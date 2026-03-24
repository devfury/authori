import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RevokeService } from './revoke.service';
import { RevokeRequestDto } from './dto/revoke-request.dto';
import { RequireTenantGuard } from '../../common/tenant/require-tenant.guard';
import { CurrentTenant } from '../../common/tenant/tenant.decorator';
import type { TenantContext } from '../../common/tenant/tenant-context';

@ApiTags('OAuth2')
@Controller('t/:tenantSlug/oauth')
@UseGuards(RequireTenantGuard)
export class RevokeController {
  constructor(private readonly revokeService: RevokeService) {}

  @Post('revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '토큰 폐기 (RFC 7009)' })
  revoke(@CurrentTenant() tenant: TenantContext, @Body() dto: RevokeRequestDto) {
    return this.revokeService.revoke(tenant.tenantId, dto);
  }
}
