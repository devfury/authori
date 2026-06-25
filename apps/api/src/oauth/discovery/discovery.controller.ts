import { Controller, Get, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Tenant } from '../../database/entities';
import { KeysService } from '../keys/keys.service';
import { ScopesService } from '../scopes/scopes.service';
import { RequireTenantGuard } from '../../common/tenant/require-tenant.guard';
import { resolveTenantIssuer } from '../../common/tenant/issuer.util';
import { CurrentTenant } from '../../common/tenant/tenant.decorator';
import type { TenantContext } from '../../common/tenant/tenant-context';

@ApiTags('OAuth2')
@ApiParam({ name: 'tenantSlug', description: '테넌트 슬러그' })
@Controller('t/:tenantSlug')
export class DiscoveryController {
  constructor(
    private readonly keysService: KeysService,
    private readonly configService: ConfigService,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    private readonly scopesService: ScopesService,
  ) {}

  @Get('.well-known/openid-configuration')
  @UseGuards(RequireTenantGuard)
  @ApiOperation({ summary: 'OpenID Connect Discovery 문서' })
  async discovery(@CurrentTenant() tenant: TenantContext) {
    const tenantEntity = await this.tenantRepo.findOne({
      where: { id: tenant.tenantId },
    });
    const defaultIssuer =
      this.configService.get<string>('app.issuer') ?? 'https://auth.example.com';
    const issuer = resolveTenantIssuer(defaultIssuer, {
      issuer: tenantEntity?.issuer ?? null,
      slug: tenantEntity?.slug ?? tenant.tenantSlug,
    });
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
      scopes_supported: await this.scopesService.getSupportedScopes(tenant.tenantId),
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
      code_challenge_methods_supported: ['S256', 'plain'],
    };
  }

  @Get('.well-known/jwks.json')
  @UseGuards(RequireTenantGuard)
  @ApiOperation({ summary: 'JWKS 공개키 목록' })
  async jwks(@CurrentTenant() tenant: TenantContext) {
    return this.keysService.getJwks(tenant.tenantId);
  }
}
