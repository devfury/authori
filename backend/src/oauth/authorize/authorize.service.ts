import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import {
  AuditAction,
  AuthorizationCode,
  ClientStatus,
  CodeChallengeMethod,
  Consent,
  OAuthClient,
  OAuthClientRedirectUri,
  TenantSettings,
  User,
  UserStatus,
} from '../../database/entities';
import { CryptoUtil } from '../../common/crypto/crypto.util';
import { AuditService, AuditContext } from '../../common/audit/audit.service';
import { PendingRequestStore } from './pending-request.store';
import { AuthorizeQueryDto } from './dto/authorize-query.dto';
import { LoginAuthorizeDto } from './dto/login-authorize.dto';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 30;

@Injectable()
export class AuthorizeService {
  private readonly pendingStore = new PendingRequestStore();

  constructor(
    @InjectRepository(OAuthClient)
    private readonly clientRepo: Repository<OAuthClient>,
    @InjectRepository(OAuthClientRedirectUri)
    private readonly redirectUriRepo: Repository<OAuthClientRedirectUri>,
    @InjectRepository(AuthorizationCode)
    private readonly codeRepo: Repository<AuthorizationCode>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Consent)
    private readonly consentRepo: Repository<Consent>,
    @InjectRepository(TenantSettings)
    private readonly settingsRepo: Repository<TenantSettings>,
    private readonly auditService: AuditService,
  ) {}

  async initiateAuthorize(tenantId: string, tenantSlug: string, query: AuthorizeQueryDto) {
    const client = await this.clientRepo.findOne({
      where: { tenantId, clientId: query.client_id, status: ClientStatus.ACTIVE },
    });
    if (!client) throw new BadRequestException('invalid_client');

    const registeredUris = await this.redirectUriRepo.find({
      where: { clientId: client.clientId },
    });
    if (!registeredUris.some((r) => r.uri === query.redirect_uri)) {
      throw new BadRequestException('redirect_uri_mismatch');
    }

    const settings = await this.settingsRepo.findOne({ where: { tenantId } });
    if (settings?.requirePkce && !query.code_challenge) {
      throw new BadRequestException('code_challenge_required');
    }

    const requestedScopes = (query.scope ?? 'openid').split(' ').filter(Boolean);
    const invalidScopes = requestedScopes.filter((s) => !client.allowedScopes.includes(s));
    if (invalidScopes.length > 0) {
      throw new BadRequestException(`invalid_scope: ${invalidScopes.join(', ')}`);
    }

    const requestId = this.pendingStore.save({
      tenantId,
      tenantSlug,
      clientId: client.clientId,
      redirectUri: query.redirect_uri,
      scopes: requestedScopes,
      state: query.state,
      codeChallenge: query.code_challenge,
      codeChallengeMethod: query.code_challenge_method,
    });

    return {
      requestId,
      client: { name: client.name, clientId: client.clientId },
      requestedScopes,
      tenantSlug,
    };
  }

  async loginAndAuthorize(tenantId: string, dto: LoginAuthorizeDto, ctx: AuditContext = {}) {
    const pending = this.pendingStore.get(dto.requestId);
    if (!pending) throw new BadRequestException('invalid_request: expired or not found');

    const user = await this.userRepo.findOne({
      where: { tenantId, email: dto.email },
    });

    // 계정 잠금 확인
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      await this.auditService.record({
        tenantId,
        action: AuditAction.LOGIN_FAILURE,
        actorType: 'user',
        targetType: 'user',
        targetId: user.id,
        success: false,
        metadata: { reason: 'account_locked', lockedUntil: user.lockedUntil },
        ...ctx,
      });
      throw new UnauthorizedException('account_locked');
    }

    if (!user || user.status !== UserStatus.ACTIVE) {
      await this.auditService.record({
        tenantId,
        action: AuditAction.LOGIN_FAILURE,
        success: false,
        metadata: { reason: 'user_not_found', email: dto.email },
        ...ctx,
      });
      throw new UnauthorizedException('invalid_credentials');
    }

    const passwordValid = await CryptoUtil.verify(dto.password, user.passwordHash);
    if (!passwordValid) {
      user.failedLoginAttempts += 1;

      if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
        user.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
        user.status = UserStatus.LOCKED;
        await this.userRepo.save(user);

        await this.auditService.record({
          tenantId,
          action: AuditAction.USER_LOCKED,
          actorType: 'system',
          targetType: 'user',
          targetId: user.id,
          metadata: { reason: 'max_failed_attempts', attempts: user.failedLoginAttempts },
          ...ctx,
        });
      } else {
        await this.userRepo.save(user);
      }

      await this.auditService.record({
        tenantId,
        action: AuditAction.LOGIN_FAILURE,
        actorType: 'user',
        targetType: 'user',
        targetId: user.id,
        success: false,
        metadata: { failedAttempts: user.failedLoginAttempts },
        ...ctx,
      });
      throw new UnauthorizedException('invalid_credentials');
    }

    // 로그인 성공 — 잠금 해제 및 카운터 초기화
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    user.lastLoginAt = new Date();
    if ((user.status as string) === UserStatus.LOCKED) user.status = UserStatus.ACTIVE;
    await this.userRepo.save(user);

    const grantedScopes = dto.grantedScopes ?? pending.scopes;

    let consent = await this.consentRepo.findOne({
      where: { tenantId, userId: user.id, clientId: pending.clientId },
    });
    if (consent) {
      consent.grantedScopes = Array.from(new Set([...consent.grantedScopes, ...grantedScopes]));
    } else {
      consent = this.consentRepo.create({
        tenantId,
        userId: user.id,
        clientId: pending.clientId,
        grantedScopes,
      });
    }
    await this.consentRepo.save(consent);

    const code = randomBytes(32).toString('base64url');
    const authCode = this.codeRepo.create({
      code,
      tenantId,
      clientId: pending.clientId,
      userId: user.id,
      redirectUri: pending.redirectUri,
      scopes: grantedScopes,
      codeChallenge: pending.codeChallenge ?? null,
      codeChallengeMethod: (pending.codeChallengeMethod as CodeChallengeMethod) ?? null,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    await this.codeRepo.save(authCode);
    this.pendingStore.delete(dto.requestId);

    await this.auditService.record({
      tenantId,
      action: AuditAction.LOGIN_SUCCESS,
      actorId: user.id,
      actorType: 'user',
      metadata: { clientId: pending.clientId, scopes: grantedScopes },
      ...ctx,
    });

    await this.auditService.record({
      tenantId,
      action: AuditAction.CODE_ISSUED,
      actorId: user.id,
      actorType: 'user',
      targetType: 'oauth_client',
      targetId: pending.clientId,
      ...ctx,
    });

    const redirectUrl = new URL(pending.redirectUri);
    redirectUrl.searchParams.set('code', code);
    if (pending.state) redirectUrl.searchParams.set('state', pending.state);

    return { url: redirectUrl.toString() };
  }
}
