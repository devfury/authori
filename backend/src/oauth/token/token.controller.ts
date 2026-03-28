import { Body, Controller, Headers, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { TokenService } from './token.service';
import { TokenRequestDto } from './dto/token-request.dto';
import { RequireTenantGuard } from '../../common/tenant/require-tenant.guard';
import { CurrentTenant } from '../../common/tenant/tenant.decorator';
import type { TenantContext } from '../../common/tenant/tenant-context';

@ApiTags('OAuth2')
@ApiParam({ name: 'tenantSlug', description: '테넌트 슬러그' })
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
    @Req() req: Request,
    @Headers('authorization') authHeader?: string,
  ) {
    const basicAuth = this.parseBasicAuth(authHeader);
    return this.tokenService.issue(tenant.tenantId, dto, basicAuth, {
      ipAddress: req.ip ?? null,
      userAgent: (req.headers['user-agent'] as string) ?? null,
      requestId: (req.headers['x-request-id'] as string) ?? null,
    });
  }

  private parseBasicAuth(header?: string): { id?: string; secret?: string } {
    if (!header?.startsWith('Basic ')) return {};
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf-8');
    const [id, ...rest] = decoded.split(':');
    return { id, secret: rest.join(':') };
  }
}
