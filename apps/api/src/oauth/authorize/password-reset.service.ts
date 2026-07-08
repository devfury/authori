import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  AccessToken,
  AuditAction,
  PasswordResetToken,
  RefreshToken,
  Tenant,
  User,
} from '../../database/entities';
import { CryptoUtil } from '../../common/crypto/crypto.util';
import { AuditService, AuditContext } from '../../common/audit/audit.service';
import { MailService } from '../../common/mail/mail.service';

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    @InjectRepository(PasswordResetToken)
    private readonly tokenRepo: Repository<PasswordResetToken>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(AccessToken)
    private readonly accessTokenRepo: Repository<AccessToken>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly mailService: MailService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * 재설정을 시작한다. 계정 열거 방지를 위해:
   * - 메일 인프라 불가 시: 계정 조회 이전에 mail_delivery_failed 반환
   * - 계정 없음(인프라 정상): sent 반환(메일 미발송)
   * - 계정 있음: 토큰 발급·발송. 발송 예외 시 mail_delivery_failed
   */
  async requestReset(
    tenantId: string,
    tenantSlug: string,
    email: string,
  ): Promise<{ status: 'sent' | 'mail_delivery_failed' }> {
    if (!this.mailService.isConfigured) {
      return { status: 'mail_delivery_failed' };
    }

    const user = await this.userRepo.findOne({ where: { tenantId, email } });
    if (!user) {
      return { status: 'sent' };
    }

    const ttlSeconds = this.config.get<number>('app.passwordResetTtl') ?? 3600;
    const rawToken = CryptoUtil.generateToken(32);
    const tokenHash = CryptoUtil.sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await this.tokenRepo.save(
      this.tokenRepo.create({ tenantId, userId: user.id, tokenHash, expiresAt, usedAt: null }),
    );

    const tenant = await this.tenantRepo.findOne({
      where: { id: tenantId },
      relations: ['settings'],
    });
    const serviceName = tenant?.name || '비밀번호 재설정';
    const resetUrl = this.buildResetUrl(rawToken, tenantSlug);

    try {
      await this.mailService.sendPasswordResetEmail({
        to: user.email,
        resetUrl,
        serviceName,
        ttlSeconds,
        from: tenant?.settings?.mailFrom ?? null,
        devRedirectTo: tenant?.settings?.mailDevRedirectTo ?? null,
      });
    } catch (error) {
      this.logger.error(`재설정 메일 발송 실패 userId=${user.id}: ${(error as Error).message}`);
      return { status: 'mail_delivery_failed' };
    }

    return { status: 'sent' };
  }

  /**
   * 토큰을 검증하고 비밀번호를 변경한다. 성공 시 해당 사용자 토큰을 폐기한다.
   * 계정 status는 변경하지 않는다.
   */
  async confirmReset(
    tenantId: string,
    rawToken: string,
    newPassword: string,
    ctx: AuditContext = {},
  ): Promise<{ status: 'reset'; email: string }> {
    if (!rawToken) throw new BadRequestException('invalid_token');

    const tokenHash = CryptoUtil.sha256Hex(rawToken);
    const record = await this.tokenRepo.findOne({ where: { tenantId, tokenHash } });
    if (!record) throw new BadRequestException('invalid_token');
    if (record.usedAt) throw new BadRequestException('invalid_token');
    if (record.expiresAt.getTime() < Date.now()) throw new BadRequestException('token_expired');

    const user = await this.userRepo.findOne({ where: { tenantId, id: record.userId } });
    if (!user) throw new NotFoundException('user_not_found');

    const settings = await this.tenantRepo
      .findOne({ where: { id: tenantId }, relations: ['settings'] })
      .then((t) => t?.settings);
    const minLength = settings?.passwordMinLength ?? 8;
    if (newPassword.length < minLength) {
      throw new BadRequestException({ message: 'password_too_short', minLength });
    }

    user.passwordHash = await CryptoUtil.hash(newPassword);
    record.usedAt = new Date();

    await this.dataSource.transaction(async (manager) => {
      await manager.save(User, user);
      await manager.save(PasswordResetToken, record);
      await manager.update(AccessToken, { tenantId, userId: user.id }, { revoked: true });
      await manager.update(RefreshToken, { tenantId, userId: user.id }, { revoked: true });
    });

    await this.auditService.record({
      tenantId,
      action: AuditAction.USER_UPDATED,
      actorType: 'user',
      actorId: user.id,
      targetType: 'user',
      targetId: user.id,
      metadata: { field: 'password', source: 'password_reset' },
      ...ctx,
    });

    return { status: 'reset', email: user.email };
  }

  /** loginPageUrl origin 기준으로 프론트 /reset-password 링크를 만든다 */
  private buildResetUrl(rawToken: string, tenantSlug: string): string {
    const loginPageUrl =
      this.config.get<string>('app.loginPageUrl') ?? 'http://localhost:5173/login';
    const url = new URL('/reset-password', new URL(loginPageUrl).origin);
    url.searchParams.set('token', rawToken);
    url.searchParams.set('tenantSlug', tenantSlug);
    return url.toString();
  }
}
