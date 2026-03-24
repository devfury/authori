import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthorizeService } from './authorize.service';
import { AuthorizeQueryDto } from './dto/authorize-query.dto';
import { LoginAuthorizeDto } from './dto/login-authorize.dto';
import { CurrentTenant } from '../../common/tenant/tenant.decorator';
import { RequireTenantGuard } from '../../common/tenant/require-tenant.guard';
import type { TenantContext } from '../../common/tenant/tenant-context';

@ApiTags('OAuth2')
@Controller('t/:tenantSlug/oauth')
@UseGuards(RequireTenantGuard)
export class AuthorizeController {
  constructor(private readonly authorizeService: AuthorizeService) {}

  @Get('authorize')
  @ApiOperation({
    summary: '인가 요청 시작',
    description: '파라미터 검증 후 requestId 반환. 클라이언트는 이 값으로 로그인 폼을 구성한다.',
  })
  initiate(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: AuthorizeQueryDto,
  ) {
    return this.authorizeService.initiateAuthorize(tenant.tenantId, tenant.tenantSlug, query);
  }

  @Post('authorize')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: '로그인 + 동의 처리 → 인가 코드 발급',
    description: 'requestId, 사용자 자격증명, 동의 스코프를 받아 redirect_uri를 반환한다.',
  })
  loginAndAuthorize(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: LoginAuthorizeDto,
    @Req() req: Request,
  ) {
    return this.authorizeService.loginAndAuthorize(tenant.tenantId, dto, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.requestId,
    });
  }
}
