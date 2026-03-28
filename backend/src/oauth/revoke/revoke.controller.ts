import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
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
  @ApiOperation({ summary: '토큰 폐기 (RFC 7009)' })
  revoke(@CurrentTenant() tenant: TenantContext, @Body() dto: RevokeRequestDto, @Req() req: Request) {
    return this.revokeService.revoke(tenant.tenantId, dto, {
      ipAddress: req.ip ?? null,
      userAgent: (req.headers['user-agent'] as string) ?? null,
      requestId: (req.headers['x-request-id'] as string) ?? null,
    });
  }
}
