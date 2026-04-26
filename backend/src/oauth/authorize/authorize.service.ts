import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import {
  AuditAction,
  AuthorizationCode,
  ClientStatus,
  CodeChallengeMethod,
  Consent,
  OAuthClient,
  OAuthClientRedirectUri,
  ProfileSchemaVersion,
  SchemaStatus,
  TenantSettings,
  User,
  UserProfile,
  UserStatus,
} from '../../database/entities';
import { CryptoUtil } from '../../common/crypto/crypto.util';
import { AuditService, AuditContext } from '../../common/audit/audit.service';
import { ExternalAuthService } from '../../external-auth/external-auth.service';
import { UsersService } from '../../users/users.service';
import {
  DEFAULT_TENANT_SCOPES,
  ScopesService,
} from '../scopes/scopes.service';
import { TypeOrmPendingRequestStore } from './typeorm-pending-request.store';
import { PendingAuthRequest } from './pending-request.store';
import { AuthorizeQueryDto } from './dto/authorize-query.dto';
import { LoginAuthorizeDto } from './dto/login-authorize.dto';
import { RegisterDto } from './dto/register.dto';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 30;

type PendingRequest = PendingAuthRequest;

@Injectable()
export class AuthorizeService {
  private readonly logger = new Logger(AuthorizeService.name);

  constructor(
    @InjectRepository(OAuthClient)
    private readonly clientRepo: Repository<OAuthClient>,
    @InjectRepository(OAuthClientRedirectUri)
    private readonly redirectUriRepo: Repository<OAuthClientRedirectUri>,
    @InjectRepository(AuthorizationCode)
    private readonly codeRepo: Repository<AuthorizationCode>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserProfile)
    private readonly profileRepo: Repository<UserProfile>,
    @InjectRepository(ProfileSchemaVersion)
    private readonly schemaRepo: Repository<ProfileSchemaVersion>,
    @InjectRepository(Consent)
    private readonly consentRepo: Repository<Consent>,
    @InjectRepository(TenantSettings)
    private readonly settingsRepo: Repository<TenantSettings>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly externalAuthService: ExternalAuthService,
    private readonly usersService: UsersService,
    private readonly scopesService: ScopesService,
    private readonly pendingStore: TypeOrmPendingRequestStore,
  ) {}

  async initiateAuthorize(
    tenantId: string,
    tenantSlug: string,
    query: AuthorizeQueryDto,
  ) {
    const client = await this.clientRepo.findOne({
      where: {
        tenantId,
        clientId: query.client_id,
        status: ClientStatus.ACTIVE,
      },
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

    const requestedScopes = (query.scope ?? 'openid')
      .split(' ')
      .filter(Boolean);
    await this.scopesService.assertScopesExist(tenantId, requestedScopes);
    const invalidScopes = requestedScopes.filter(
      (s) => !client.allowedScopes.includes(s),
    );
    if (invalidScopes.length > 0) {
      throw new BadRequestException(
        `invalid_scope: ${invalidScopes.join(', ')}`,
      );
    }
    const scopeDetails = await this.scopesService.getScopeDetails(
      tenantId,
      requestedScopes,
    );

    const requestId = await this.pendingStore.save({
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
      scopes: scopeDetails.map((scope) => ({
        name: scope.name,
        displayName: scope.displayName,
        description: scope.description,
      })),
      tenantSlug,
      branding: client.branding ?? null,
    };
  }

  async getLoginConfig(tenantId: string, clientId?: string) {
    if (!clientId) {
      throw new BadRequestException('client_id required');
    }

    const client = await this.clientRepo.findOne({
      where: { tenantId, clientId },
    });
    if (!client) {
      throw new BadRequestException('invalid_client');
    }

    const [settings, activeSchema, scopeDetails] = await Promise.all([
      this.settingsRepo.findOne({ where: { tenantId } }),
      this.schemaRepo.findOne({
        where: { tenantId, status: SchemaStatus.PUBLISHED },
        order: { version: 'DESC' },
      }),
      this.scopesService.getScopeDetails(tenantId, client.allowedScopes),
    ]);

    const scopeByName = new Map(scopeDetails.map((scope) => [scope.name, scope]));
    const defaultScopeByName = new Map(
      DEFAULT_TENANT_SCOPES.map((scope) => [scope.name, scope]),
    );
    const scopes = Array.from(new Set(client.allowedScopes)).map((name) => {
      const scope = scopeByName.get(name) ?? defaultScopeByName.get(name);
      return {
        name,
        displayName: scope?.displayName ?? name,
        description: scope?.description ?? null,
      };
    });

    return {
      clientName: client.name,
      branding: client.branding ?? null,
      scopes,
      allowRegistration: settings?.allowRegistration ?? false,
      activeSchema: activeSchema
        ? {
            schemaJsonb: activeSchema.schemaJsonb,
          }
        : null,
    };
  }

  async register(
    tenantId: string,
    dto: RegisterDto,
    ctx: AuditContext = {},
  ): Promise<{ message: 'registered'; id: string; email: string }> {
    const settings = await this.settingsRepo.findOne({ where: { tenantId } });
    if (!settings?.allowRegistration) {
      throw new ForbiddenException('registration_disabled');
    }

    if (dto.password.length < settings.passwordMinLength) {
      throw new BadRequestException('password_too_short');
    }

    let savedUser: User;
    try {
      savedUser = await this.usersService.create(
        tenantId,
        {
          email: dto.email,
          password: dto.password,
          profile: dto.profile,
          initialStatus: UserStatus.INACTIVE,
        },
        {
          actorType: 'user',
          ...ctx,
        },
      );
    } catch (error) {
      if (error instanceof ConflictException) {
        throw new ConflictException('email_already_exists');
      }
      throw error;
    }

    return { message: 'registered', id: savedUser.id, email: savedUser.email };
  }

  async loginAndAuthorize(
    tenantId: string,
    dto: LoginAuthorizeDto,
    ctx: AuditContext = {},
  ) {
    const pending = await this.pendingStore.get(dto.requestId);
    if (!pending)
      throw new BadRequestException('invalid_request: expired or not found');

    let user = await this.userRepo.findOne({
      where: { tenantId, email: dto.email },
      relations: ['profile'],
    });

    // 잠금 확인
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      await this.recordAuditLoginFailure(
        tenantId,
        pending.clientId,
        user.id,
        'account_locked',
        ctx,
      );
      throw new UnauthorizedException('account_locked');
    }

    if (user?.status === UserStatus.INACTIVE) {
      await this.recordAuditLoginFailure(
        tenantId,
        pending.clientId,
        user.id,
        'user_inactive',
        ctx,
      );
      throw new ForbiddenException('user_inactive');
    }

    const provider = await this.externalAuthService.findActive(
      tenantId,
      pending.clientId,
    );

    if (provider) {
      // ── 외부 인증 우선 경로 ──────────────────────────
      const result = await this.externalAuthService.callProvider(
        provider,
        dto.email,
        dto.password,
      );

      if (result.error) {
        // 연동 장애 → 로컬 폴백 시도
        this.logger.warn(
          `Provider ${provider.id} error=${result.error}, attempting local fallback`,
        );
        await this.auditService.record({
          tenantId,
          action: AuditAction.EXTERNAL_AUTH_ERROR,
          actorType: 'user',
          actorId: user?.id ?? null,
          targetType: 'external_auth_provider',
          targetId: provider.id,
          success: false,
          metadata: {
            providerId: provider.id,
            error: result.error,
            fallback: true,
          },
          ...ctx,
        });

        if (!user) {
          await this.recordAuditLoginFailure(
            tenantId,
            pending.clientId,
            null,
            'external_auth_error_local_fallback_failed',
            ctx,
            { email: dto.email },
          );
          throw new UnauthorizedException('invalid_credentials');
        }

        const localValid = await CryptoUtil.verify(
          dto.password,
          user.passwordHash,
        );
        if (!localValid) {
          await this.recordFailedAttempt(user, tenantId, pending.clientId, ctx);
          throw new UnauthorizedException('invalid_credentials');
        }

        return this.issueAuthCode(user, false, dto, pending, tenantId, ctx, {
          source: 'local_fallback',
          providerId: provider.id,
        });
      }

      if (!result.authenticated) {
        // 외부 명시적 거부 — 로컬 폴백 없음
        await this.auditService.record({
          tenantId,
          action: AuditAction.LOGIN_FAILURE,
          actorType: 'user',
          actorId: user?.id ?? null,
          targetType: 'oauth_client',
          targetId: pending.clientId,
          success: false,
          metadata: {
            reason: 'external_auth_rejected',
            providerId: provider.id,
            externalReason: result.reason,
          },
          ...ctx,
        });
        throw new UnauthorizedException('invalid_credentials');
      }

      // 외부 인증 성공 처리
      let profileDirty = false;

      if (!user) {
        // JIT 프로비저닝
        if (!provider.jitProvision || !result.user) {
          throw new UnauthorizedException('invalid_credentials');
        }
        user = await this.jitProvisionUser(
          tenantId,
          dto.email,
          dto.password,
          result.user,
          provider,
          ctx,
        );
        return this.issueAuthCode(user, false, dto, pending, tenantId, ctx, {
          source: 'external_auth',
          providerId: provider.id,
        });
      }

      // 기존 사용자 — 로컬 비밀번호 동기화
      user.passwordHash = await CryptoUtil.hash(dto.password);
      user.status = UserStatus.ACTIVE;

      if (provider.syncOnLogin && result.user) {
        const mapped = this.externalAuthService.applyFieldMapping(
          result.user,
          provider.fieldMapping,
        );
        if (mapped.loginId !== undefined) user.loginId = mapped.loginId ?? null;
        if (user.profile && Object.keys(mapped.profile).length > 0) {
          user.profile.profileJsonb = {
            ...user.profile.profileJsonb,
            ...mapped.profile,
          };
          profileDirty = true;
        }
      }

      return this.issueAuthCode(
        user,
        profileDirty,
        dto,
        pending,
        tenantId,
        ctx,
        {
          source: 'external_auth',
          providerId: provider.id,
        },
      );
    }

    // ── 로컬 전용 경로 ──────────────────────────────────
    if (!user) {
      await this.recordAuditLoginFailure(
        tenantId,
        pending.clientId,
        null,
        'user_not_found',
        ctx,
        { email: dto.email },
      );
      throw new UnauthorizedException('invalid_credentials');
    }

    const passwordValid = await CryptoUtil.verify(
      dto.password,
      user.passwordHash,
    );
    if (!passwordValid) {
      await this.recordFailedAttempt(user, tenantId, pending.clientId, ctx);
      throw new UnauthorizedException('invalid_credentials');
    }

    return this.issueAuthCode(user, false, dto, pending, tenantId, ctx);
  }

  // ── private helpers ───────────────────────────────────────────────────────

  private async jitProvisionUser(
    tenantId: string,
    email: string,
    password: string,
    externalUser: {
      email: string;
      loginId?: string;
      profile?: Record<string, unknown>;
    },
    provider: NonNullable<
      Awaited<ReturnType<ExternalAuthService['findActive']>>
    >,
    ctx: AuditContext,
  ): Promise<User> {
    const mapped = this.externalAuthService.applyFieldMapping(
      externalUser,
      provider.fieldMapping,
    );
    const passwordHash = await CryptoUtil.hash(password);

    const activeSchema = await this.schemaRepo.findOne({
      where: { tenantId, status: SchemaStatus.PUBLISHED },
      order: { version: 'DESC' },
    });

    const profile = this.profileRepo.create({
      tenantId,
      schemaVersionId: activeSchema?.id ?? null,
      profileJsonb: mapped.profile,
    });

    const user = this.userRepo.create({
      tenantId,
      email,
      loginId: mapped.loginId ?? null,
      passwordHash,
      profile,
    });

    const saved = await this.userRepo.save(user);

    await this.auditService.record({
      tenantId,
      action: AuditAction.USER_CREATED,
      actorType: 'system',
      targetType: 'user',
      targetId: saved.id,
      metadata: { source: 'external_auth', providerId: provider.id, email },
      ...ctx,
    });

    return saved;
  }

  private async issueAuthCode(
    user: User,
    profileDirty: boolean,
    dto: LoginAuthorizeDto,
    pending: PendingRequest,
    tenantId: string,
    ctx: AuditContext,
    loginMeta?: Record<string, unknown>,
  ) {
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    user.lastLoginAt = new Date();
    if ((user.status as string) === UserStatus.LOCKED)
      user.status = UserStatus.ACTIVE;

    if (dto.grantedScopes) {
      const overGranted = dto.grantedScopes.filter(
        (scope) => !pending.scopes.includes(scope),
      );
      if (overGranted.length > 0) {
        throw new BadRequestException(
          `invalid_scope: ${overGranted.join(', ')}`,
        );
      }
    }

    const grantedScopes = Array.from(
      new Set(dto.grantedScopes ?? pending.scopes),
    );

    let consent = await this.consentRepo.findOne({
      where: { tenantId, userId: user.id, clientId: pending.clientId },
    });
    if (consent) {
      consent.grantedScopes = Array.from(
        new Set([...consent.grantedScopes, ...grantedScopes]),
      );
    } else {
      consent = this.consentRepo.create({
        tenantId,
        userId: user.id,
        clientId: pending.clientId,
        grantedScopes,
      });
    }

    const code = randomBytes(32).toString('base64url');
    const authCode = this.codeRepo.create({
      code,
      tenantId,
      clientId: pending.clientId,
      userId: user.id,
      redirectUri: pending.redirectUri,
      scopes: grantedScopes,
      codeChallenge: pending.codeChallenge ?? null,
      codeChallengeMethod:
        (pending.codeChallengeMethod as CodeChallengeMethod) ?? null,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    await this.dataSource.transaction(async (manager) => {
      await manager.save(User, user);
      if (profileDirty && user.profile) {
        await manager.save(UserProfile, user.profile);
      }
      await manager.save(Consent, consent!);
      await manager.save(AuthorizationCode, authCode);
    });

    await this.pendingStore.delete(dto.requestId);

    await this.auditService.record({
      tenantId,
      action: AuditAction.LOGIN_SUCCESS,
      actorId: user.id,
      actorType: 'user',
      targetId: pending.clientId,
      targetType: 'oauth_client',
      metadata: {
        clientId: pending.clientId,
        scopes: grantedScopes,
        ...loginMeta,
      },
      ...ctx,
    });

    await this.auditService.record({
      tenantId,
      action: AuditAction.CODE_ISSUED,
      actorId: user.id,
      actorType: 'user',
      targetId: authCode.code,
      targetType: 'auth_code',
      ...ctx,
    });

    const redirectUrl = new URL(pending.redirectUri);
    redirectUrl.searchParams.set('code', code);
    if (pending.state) redirectUrl.searchParams.set('state', pending.state);

    return { url: redirectUrl.toString() };
  }

  private async recordFailedAttempt(
    user: User,
    tenantId: string,
    clientId: string,
    ctx: AuditContext,
  ) {
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
        metadata: {
          reason: 'max_failed_attempts',
          attempts: user.failedLoginAttempts,
        },
        ...ctx,
      });
    } else {
      await this.userRepo.save(user);
    }

    await this.auditService.record({
      tenantId,
      action: AuditAction.LOGIN_FAILURE,
      actorType: 'user',
      actorId: user.id,
      targetType: 'oauth_client',
      targetId: clientId,
      success: false,
      metadata: { failedAttempts: user.failedLoginAttempts },
      ...ctx,
    });
  }

  private async recordAuditLoginFailure(
    tenantId: string,
    clientId: string,
    userId: string | null,
    reason: string,
    ctx: AuditContext,
    extra?: Record<string, unknown>,
  ) {
    await this.auditService.record({
      tenantId,
      action: AuditAction.LOGIN_FAILURE,
      actorType: 'user',
      actorId: userId,
      targetType: 'oauth_client',
      targetId: clientId,
      success: false,
      metadata: { reason, ...extra },
      ...ctx,
    });
  }
}
