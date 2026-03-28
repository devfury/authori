import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { sign } from 'jsonwebtoken';
import { randomBytes, randomUUID } from 'crypto';
import {
  AccessToken,
  AuditAction,
  AuthorizationCode,
  ClientStatus,
  ClientType,
  CodeChallengeMethod,
  OAuthClient,
  OAuthClientRedirectUri,
  RefreshToken,
  Tenant,
  TenantSettings,
} from '../../database/entities';
import { CryptoUtil } from '../../common/crypto/crypto.util';
import { AuditService, AuditContext } from '../../common/audit/audit.service';
import { KeysService } from '../keys/keys.service';
import { TokenRequestDto } from './dto/token-request.dto';

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

@Injectable()
export class TokenService {
  constructor(
    @InjectRepository(OAuthClient)
    private readonly clientRepo: Repository<OAuthClient>,
    @InjectRepository(OAuthClientRedirectUri)
    private readonly redirectUriRepo: Repository<OAuthClientRedirectUri>,
    @InjectRepository(AuthorizationCode)
    private readonly codeRepo: Repository<AuthorizationCode>,
    @InjectRepository(AccessToken)
    private readonly accessTokenRepo: Repository<AccessToken>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(TenantSettings)
    private readonly settingsRepo: Repository<TenantSettings>,
    private readonly keysService: KeysService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  async issue(tenantId: string, req: TokenRequestDto, basicAuth: { id?: string; secret?: string }, ctx?: AuditContext): Promise<TokenResponse> {
    const clientId = req.client_id ?? basicAuth.id;
    const clientSecret = req.client_secret ?? basicAuth.secret;
    if (!clientId) throw new BadRequestException('client_id required');

    const client = await this.clientRepo.findOne({
      where: { tenantId, clientId, status: ClientStatus.ACTIVE },
    });
    if (!client) throw new UnauthorizedException('invalid_client');

    // confidential client: secret 검증
    if (client.type === ClientType.CONFIDENTIAL) {
      if (!clientSecret || !client.clientSecretHash) {
        throw new UnauthorizedException('invalid_client');
      }
      const secretValid = await CryptoUtil.verify(clientSecret, client.clientSecretHash);
      if (!secretValid) throw new UnauthorizedException('invalid_client');
    }

    if (!client.allowedGrants.includes(req.grant_type)) {
      throw new BadRequestException('unsupported_grant_type');
    }

    const settings = await this.settingsRepo.findOne({ where: { tenantId } });
    const accessTtl = settings?.accessTokenTtl ?? 3600;
    const refreshTtl = settings?.refreshTokenTtl ?? 2592000;

    switch (req.grant_type) {
      case 'authorization_code':
        return this.handleAuthorizationCode(tenantId, client, req, accessTtl, refreshTtl, ctx);
      case 'refresh_token':
        return this.handleRefreshToken(tenantId, client, req, settings, accessTtl, refreshTtl, ctx);
      case 'client_credentials':
        return this.handleClientCredentials(tenantId, client, req, accessTtl, ctx);
      default:
        throw new BadRequestException('unsupported_grant_type');
    }
  }

  private async handleAuthorizationCode(
    tenantId: string,
    client: OAuthClient,
    req: TokenRequestDto,
    accessTtl: number,
    refreshTtl: number,
    ctx?: AuditContext,
  ): Promise<TokenResponse> {
    if (!req.code) throw new BadRequestException('code required');
    if (!req.redirect_uri) throw new BadRequestException('redirect_uri required');

    const authCode = await this.codeRepo.findOne({ where: { code: req.code, tenantId } });
    if (!authCode) throw new BadRequestException('invalid_grant');
    if (authCode.used) throw new BadRequestException('invalid_grant: code already used');
    if (new Date() > authCode.expiresAt) throw new BadRequestException('invalid_grant: code expired');
    if (authCode.clientId !== client.clientId) throw new BadRequestException('invalid_grant');
    if (authCode.redirectUri !== req.redirect_uri) throw new BadRequestException('invalid_grant: redirect_uri mismatch');

    // PKCE 검증
    if (authCode.codeChallenge) {
      if (!req.code_verifier) throw new BadRequestException('code_verifier required');
      const valid =
        authCode.codeChallengeMethod === CodeChallengeMethod.S256
          ? CryptoUtil.verifyPkceS256(req.code_verifier, authCode.codeChallenge)
          : req.code_verifier === authCode.codeChallenge;
      if (!valid) throw new BadRequestException('invalid_grant: code_verifier mismatch');
    }

    authCode.used = true;
    await this.codeRepo.save(authCode);

    return this.issueTokenPair(
      tenantId, client.clientId, authCode.userId, authCode.scopes, accessTtl, refreshTtl, ctx,
    );
  }

  private async handleRefreshToken(
    tenantId: string,
    client: OAuthClient,
    req: TokenRequestDto,
    settings: TenantSettings | null,
    accessTtl: number,
    refreshTtl: number,
    ctx?: AuditContext,
  ): Promise<TokenResponse> {
    if (!req.refresh_token) throw new BadRequestException('refresh_token required');

    const tokenHash = CryptoUtil.sha256Hex(req.refresh_token);
    const stored = await this.refreshTokenRepo.findOne({
      where: { tenantId, tokenHash, clientId: client.clientId },
    });
    if (!stored) throw new BadRequestException('invalid_grant');
    if (stored.revoked) {
      // 재사용 감지: 같은 family 전체 폐기
      await this.refreshTokenRepo.update({ familyId: stored.familyId }, { revoked: true });
      throw new BadRequestException('invalid_grant: token reuse detected');
    }
    if (new Date() > stored.expiresAt) throw new BadRequestException('invalid_grant: token expired');

    // rotation: 기존 토큰 폐기
    stored.revoked = true;
    await this.refreshTokenRepo.save(stored);

    const scopes = req.scope
      ? req.scope.split(' ').filter((s) => stored.scopes.includes(s))
      : stored.scopes;

    const result = await this.issueTokenPair(
      tenantId, client.clientId, stored.userId, scopes, accessTtl, refreshTtl, ctx,
    );

    // 같은 family로 새 refresh token 저장
    const newToken = await this.refreshTokenRepo.findOne({
      where: { tenantId, tokenHash: CryptoUtil.sha256Hex(result.refresh_token!) },
    });
    if (newToken) {
      newToken.familyId = stored.familyId;
      await this.refreshTokenRepo.save(newToken);
    }

    await this.auditService.record({
      tenantId,
      action: AuditAction.TOKEN_REFRESHED,
      actorId: stored.userId,
      actorType: 'user',
      targetId: stored.familyId,
      targetType: 'refresh_token',
      metadata: { familyId: stored.familyId, scopes },
      ...ctx,
    });

    return result;
  }

  private async handleClientCredentials(
    tenantId: string,
    client: OAuthClient,
    req: TokenRequestDto,
    accessTtl: number,
    ctx?: AuditContext,
  ): Promise<TokenResponse> {
    const scopes = req.scope
      ? req.scope.split(' ').filter((s) => client.allowedScopes.includes(s))
      : client.allowedScopes;

    return this.issueTokenPair(tenantId, client.clientId, null, scopes, accessTtl, null, ctx);
  }

  private async issueTokenPair(
    tenantId: string,
    clientId: string,
    userId: string | null,
    scopes: string[],
    accessTtl: number,
    refreshTtl: number | null,
    ctx?: AuditContext,
  ): Promise<TokenResponse> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    const activeKey = await this.keysService.getActiveKey(null);
    const defaultIssuer = this.configService.get<string>('app.issuer') ?? 'https://auth.example.com';
    const issuer = tenant?.issuer ?? defaultIssuer;
    const jti = randomUUID();

    const accessTokenJwt = sign(
      {
        sub: userId ?? clientId,
        tenant_id: tenantId,
        client_id: clientId,
        scope: scopes.join(' '),
        jti,
      },
      activeKey.privateKeyPem,
      {
        algorithm: 'RS256',
        issuer,
        audience: clientId,
        expiresIn: accessTtl,
        keyid: activeKey.kid,
      },
    );

    const grantType = refreshTtl === null ? 'client_credentials' : 'authorization_code';
    const expiresAt = new Date(Date.now() + accessTtl * 1000);
    await this.accessTokenRepo.save(
      this.accessTokenRepo.create({
        tenantId,
        clientId,
        userId,
        jti,
        scopes,
        expiresAt,
      }),
    );
    await this.auditService.record({
      tenantId,
      action: AuditAction.TOKEN_ISSUED,
      actorId: userId ?? clientId,
      actorType: userId ? 'user' : 'client',
      targetId: jti,
      targetType: 'access_token',
      metadata: { grantType, scopes, jti },
      ...ctx,
    });

    const response: TokenResponse = {
      access_token: accessTokenJwt,
      token_type: 'Bearer',
      expires_in: accessTtl,
      scope: scopes.join(' '),
    };

    if (refreshTtl !== null && userId) {
      const plainRefresh = randomBytes(32).toString('base64url');
      const tokenHash = CryptoUtil.sha256Hex(plainRefresh);
      const familyId = randomUUID();
      const refreshExpiresAt = new Date(Date.now() + refreshTtl * 1000);

      await this.refreshTokenRepo.save(
        this.refreshTokenRepo.create({
          tenantId,
          clientId,
          userId,
          tokenHash,
          familyId,
          scopes,
          expiresAt: refreshExpiresAt,
        }),
      );
      await this.auditService.record({
        tenantId,
        action: AuditAction.TOKEN_ISSUED,
        actorId: userId ?? clientId,
        actorType: userId ? 'user' : 'client',
        targetId: familyId,
        targetType: 'refresh_token',
        metadata: { plainRefresh, familyId, scopes },
        ...ctx,
      });

      response.refresh_token = plainRefresh;
    }

    return response;
  }
}
