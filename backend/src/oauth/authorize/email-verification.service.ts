import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AuditAction,
  EmailVerificationToken,
  Tenant,
  User,
  UserStatus,
} from '../../database/entities';
import { CryptoUtil } from '../../common/crypto/crypto.util';
import { AuditService, AuditContext } from '../../common/audit/audit.service';
import { MailService } from '../../common/mail/mail.service';

interface IssueOptions {
  /** 메일 헤더/제목에 노출할 이름. 없으면 테넌트 이름 사용 */
  serviceName?: string;
  /** 버튼 색상 (클라이언트 브랜딩) */
  brandColor?: string | null;
}

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    @InjectRepository(EmailVerificationToken)
    private readonly tokenRepo: Repository<EmailVerificationToken>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    private readonly config: ConfigService,
    private readonly mailService: MailService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * 인증 토큰을 발급해 DB에 해시로 저장하고 인증 메일을 발송한다.
   * 메일 발송 실패는 회원가입을 막지 않도록 호출부에서 처리한다.
   */
  async issueAndSend(
    tenantId: string,
    tenantSlug: string,
    user: User,
    opts: IssueOptions = {},
  ): Promise<void> {
    const ttlSeconds = this.config.get<number>('app.emailVerificationTtl') ?? 86400;

    const rawToken = CryptoUtil.generateToken(32);
    const tokenHash = CryptoUtil.sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await this.tokenRepo.save(
      this.tokenRepo.create({
        tenantId,
        userId: user.id,
        tokenHash,
        expiresAt,
        usedAt: null,
      }),
    );

    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    const serviceName = opts.serviceName || tenant?.name || '회원가입';

    const verifyUrl = this.buildVerifyUrl(rawToken, tenantSlug);

    await this.mailService.sendVerificationEmail({
      to: user.email,
      verifyUrl,
      serviceName,
      brandColor: opts.brandColor ?? null,
      ttlSeconds,
    });
  }

  /**
   * 인증 토큰을 검증하고 사용자를 활성화한다.
   * 이미 활성화된 사용자라면 멱등하게 성공 처리한다.
   */
  async confirm(
    tenantId: string,
    rawToken: string,
    ctx: AuditContext = {},
  ): Promise<{ message: 'verified'; email: string }> {
    if (!rawToken) throw new BadRequestException('invalid_token');

    const tokenHash = CryptoUtil.sha256Hex(rawToken);
    const record = await this.tokenRepo.findOne({
      where: { tenantId, tokenHash },
    });

    if (!record) throw new BadRequestException('invalid_token');

    const user = await this.userRepo.findOne({
      where: { tenantId, id: record.userId },
    });
    if (!user) throw new NotFoundException('user_not_found');

    // 이미 인증/활성화된 경우 멱등 처리
    if (record.usedAt) {
      return { message: 'verified', email: user.email };
    }

    if (record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('token_expired');
    }

    record.usedAt = new Date();
    if (user.status === UserStatus.INACTIVE) {
      user.status = UserStatus.ACTIVE;
    }

    await this.tokenRepo.manager.transaction(async (manager) => {
      await manager.save(EmailVerificationToken, record);
      await manager.save(User, user);
    });

    await this.auditService.record({
      tenantId,
      action: AuditAction.USER_ACTIVATED,
      actorType: 'user',
      actorId: user.id,
      targetType: 'user',
      targetId: user.id,
      metadata: { source: 'email_verification' },
      ...ctx,
    });

    return { message: 'verified', email: user.email };
  }

  /** loginPageUrl의 origin 기준으로 프론트 /verify-email 링크를 만든다 */
  private buildVerifyUrl(rawToken: string, tenantSlug: string): string {
    const loginPageUrl =
      this.config.get<string>('app.loginPageUrl') ??
      'http://localhost:5173/login';
    const url = new URL('/verify-email', new URL(loginPageUrl).origin);
    url.searchParams.set('token', rawToken);
    url.searchParams.set('tenantSlug', tenantSlug);
    return url.toString();
  }
}
