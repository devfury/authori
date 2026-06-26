import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AuditAction,
  EmailVerificationToken,
  OAuthClient,
  Tenant,
  User,
  UserStatus,
} from '../../database/entities';
import { CryptoUtil } from '../../common/crypto/crypto.util';
import { AuditService, AuditContext } from '../../common/audit/audit.service';
import { MailService } from '../../common/mail/mail.service';
import { RedirectUriValidator } from '../../common/redirect/redirect-uri.validator';

interface IssueOptions {
  /** 메일 헤더/제목에 노출할 이름. 없으면 테넌트 이름 사용 */
  serviceName?: string;
  /** 버튼 색상 (클라이언트 브랜딩) */
  brandColor?: string | null;
  /** 가입을 트리거한 클라이언트. 인증 후 목적지 해석에 사용 */
  clientId?: string | null;
  /** 요청별 동적 복귀 목적지(호출부에서 allowlist 검증을 마친 값) */
  continueUri?: string | null;
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
    @InjectRepository(OAuthClient)
    private readonly clientRepo: Repository<OAuthClient>,
    private readonly config: ConfigService,
    private readonly mailService: MailService,
    private readonly auditService: AuditService,
    private readonly redirectUriValidator: RedirectUriValidator,
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
        clientId: opts.clientId ?? null,
        continueUri: opts.continueUri ?? null,
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
  ): Promise<{ message: 'verified'; email: string; continueUrl?: string }> {
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
      const continueUrl = await this.resolveContinueUrl(record);
      return { message: 'verified', email: user.email, continueUrl };
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

    const continueUrl = await this.resolveContinueUrl(record);
    return { message: 'verified', email: user.email, continueUrl };
  }

  /**
   * 인증 완료 후 이동할 목적지를 우선순위 체인으로 해석한다.
   * 1) 토큰에 저장된 동적 continueUri (allowlist 통과 시)
   * 2) 클라이언트 기본 postVerificationRedirectUri (allowlist 통과 시)
   * 3) undefined → 프론트가 기본 안내 페이지로 폴백
   *
   * allowlist 미통과는 에러가 아니라 다음 순위로 넘어가는 안전한 폴백으로 처리한다.
   */
  private async resolveContinueUrl(record: EmailVerificationToken): Promise<string | undefined> {
    const clientId = record.clientId;

    // 1) 요청별 동적 목적지
    if (
      record.continueUri &&
      (await this.redirectUriValidator.isAllowed(clientId, record.continueUri))
    ) {
      return record.continueUri;
    }

    // 2) 클라이언트 기본 목적지
    if (clientId) {
      const client = await this.clientRepo.findOne({
        where: { tenantId: record.tenantId, clientId },
      });
      const candidate = client?.postVerificationRedirectUri;
      if (candidate && (await this.redirectUriValidator.isAllowed(clientId, candidate))) {
        return candidate;
      }
    }

    // 3) 폴백
    return undefined;
  }

  /** loginPageUrl의 origin 기준으로 프론트 /verify-email 링크를 만든다 */
  private buildVerifyUrl(rawToken: string, tenantSlug: string): string {
    const loginPageUrl =
      this.config.get<string>('app.loginPageUrl') ?? 'http://localhost:5173/login';
    const url = new URL('/verify-email', new URL(loginPageUrl).origin);
    url.searchParams.set('token', rawToken);
    url.searchParams.set('tenantSlug', tenantSlug);
    return url.toString();
  }
}
