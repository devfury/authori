import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBasicAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { RevokeService } from './revoke.service';
import { RevokeRequestDto } from './dto/revoke-request.dto';
import { RequireTenantGuard } from '../../common/tenant/require-tenant.guard';
import { CurrentTenant } from '../../common/tenant/tenant.decorator';
import type { TenantContext } from '../../common/tenant/tenant-context';

@ApiTags('OAuth2')
@ApiParam({ name: 'tenantSlug', description: '테넌트 슬러그' })
@Controller('t/:tenantSlug/oauth')
@UseGuards(RequireTenantGuard)
export class RevokeController {
  constructor(private readonly revokeService: RevokeService) {}

  @Post('revoke')
  @HttpCode(HttpStatus.OK)
  @ApiBasicAuth('ClientBasicAuth')
  @ApiOperation({ summary: '토큰 폐기 (RFC 7009)' })
  revoke(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: RevokeRequestDto,
    @Req() req: Request,
  ) {
    const basicAuth = this.parseBasicAuth(req.headers['authorization']);
    return this.revokeService.revoke(tenant.tenantId, dto, basicAuth, {
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
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
