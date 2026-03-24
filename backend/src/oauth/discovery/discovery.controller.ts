import { Controller, Get, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { verify } from 'jsonwebtoken';
import { createPublicKey } from 'crypto';
import { AccessToken, Tenant, User, UserProfile } from '../../database/entities';
import { KeysService } from '../keys/keys.service';
import { RequireTenantGuard } from '../../common/tenant/require-tenant.guard';
import { CurrentTenant } from '../../common/tenant/tenant.decorator';
import type { TenantContext } from '../../common/tenant/tenant-context';
import { Headers } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';

@ApiTags('OAuth2 Discovery')
@Controller('t/:tenantSlug')
export class DiscoveryController {
  constructor(
    private readonly keysService: KeysService,
    private readonly configService: ConfigService,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(AccessToken)
    private readonly accessTokenRepo: Repository<AccessToken>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserProfile)
    private readonly profileRepo: Repository<UserProfile>,
  ) {}

  @Get('.well-known/openid-configuration')
  @UseGuards(RequireTenantGuard)
  @ApiOperation({ summary: 'OpenID Connect Discovery 문서' })
  async discovery(@CurrentTenant() tenant: TenantContext) {
    const tenantEntity = await this.tenantRepo.findOne({ where: { id: tenant.tenantId } });
    const defaultIssuer = this.configService.get<string>('app.issuer') ?? 'https://auth.example.com';
    const issuer = tenantEntity?.issuer ?? `${defaultIssuer}/t/${tenant.tenantSlug}`;
    const base = `${issuer}`;

    return {
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      revocation_endpoint: `${base}/oauth/revoke`,
      userinfo_endpoint: `${base}/oauth/userinfo`,
      jwks_uri: `${base}/.well-known/jwks.json`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token', 'client_credentials'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      scopes_supported: ['openid', 'profile', 'email'],
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
      code_challenge_methods_supported: ['S256', 'plain'],
    };
  }

  @Get('.well-known/jwks.json')
  @UseGuards(RequireTenantGuard)
  @ApiOperation({ summary: 'JWKS 공개키 목록' })
  async jwks(@CurrentTenant() tenant: TenantContext) {
    return this.keysService.getJwks(null);
  }

  @Get('oauth/userinfo')
  @UseGuards(RequireTenantGuard)
  @ApiOperation({ summary: 'UserInfo (Bearer 액세스 토큰 필요)' })
  async userinfo(
    @CurrentTenant() tenant: TenantContext,
    @Headers('authorization') authHeader?: string,
  ) {
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Bearer token required');
    }
    const rawToken = authHeader.slice(7);

    // JWT 검증
    const activeKey = await this.keysService.getActiveKey(null);
    let payload: { sub: string; jti: string; scope: string };
    try {
      const publicKey = createPublicKey(activeKey.publicKeyPem);
      payload = verify(rawToken, publicKey, { algorithms: ['RS256'] }) as typeof payload;
    } catch {
      throw new UnauthorizedException('invalid_token');
    }

    // 폐기 여부 확인
    const tokenRecord = await this.accessTokenRepo.findOne({
      where: { tenantId: tenant.tenantId, jti: payload.jti },
    });
    if (!tokenRecord || tokenRecord.revoked) {
      throw new UnauthorizedException('token_revoked');
    }

    const user = await this.userRepo.findOne({
      where: { id: payload.sub, tenantId: tenant.tenantId },
    });
    if (!user) throw new UnauthorizedException('user_not_found');

    const profile = await this.profileRepo.findOne({ where: { userId: user.id } });
    const scopes = payload.scope.split(' ');

    const claims: Record<string, unknown> = { sub: user.id };
    if (scopes.includes('email')) claims['email'] = user.email;
    if (scopes.includes('profile') && profile) {
      claims['profile'] = profile.profileJsonb;
    }

    return claims;
  }
}
