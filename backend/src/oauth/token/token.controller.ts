import { Body, Controller, Headers, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { TokenService } from './token.service';
import { TokenRequestDto } from './dto/token-request.dto';
import { RequireTenantGuard } from '../../common/tenant/require-tenant.guard';
import { CurrentTenant } from '../../common/tenant/tenant.decorator';
import type { TenantContext } from '../../common/tenant/tenant-context';

@ApiTags('OAuth2')
@Controller('t/:tenantSlug/oauth')
@UseGuards(RequireTenantGuard)
export class TokenController {
  constructor(private readonly tokenService: TokenService) {}

  @Post('token')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: '토큰 발급',
    description: 'grant_type: authorization_code | refresh_token | client_credentials',
  })
  issue(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: TokenRequestDto,
    @Headers('authorization') authHeader?: string,
  ) {
    const basicAuth = this.parseBasicAuth(authHeader);
    return this.tokenService.issue(tenant.tenantId, dto, basicAuth);
  }

  private parseBasicAuth(header?: string): { id?: string; secret?: string } {
    if (!header?.startsWith('Basic ')) return {};
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf-8');
    const [id, ...rest] = decoded.split(':');
    return { id, secret: rest.join(':') };
  }
}
