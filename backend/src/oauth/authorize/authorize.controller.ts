import { Body, Controller, Get, Headers, Post, Query, Redirect, Req, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
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
  constructor(
    private readonly authorizeService: AuthorizeService,
    private readonly configService: ConfigService,
  ) {}

  @Get('authorize')
  @ApiOperation({
    summary: '인가 요청 시작',
    description:
      'Accept: text/html → 로그인 페이지로 리다이렉트. Accept: application/json → requestId JSON 반환 (모바일 앱용).',
  })
  async initiate(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: AuthorizeQueryDto,
    @Headers('accept') accept: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authorizeService.initiateAuthorize(tenant.tenantId, tenant.tenantSlug, query);

    if (accept?.includes('text/html')) {
      const loginPageUrl = this.configService.get<string>('app.loginPageUrl') ?? 'http://localhost:5173/login';
      const loginUrl = new URL(loginPageUrl);
      loginUrl.searchParams.set('requestId', result.requestId);
      loginUrl.searchParams.set('tenantSlug', result.tenantSlug);
      loginUrl.searchParams.set('clientName', result.client.name);
      loginUrl.searchParams.set('scopes', result.requestedScopes.join(' '));
      res.redirect(loginUrl.toString());
      return;
    }

    return result;
  }

  @Post('authorize')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  // @Redirect()
  @ApiOperation({
    summary: '로그인 + 동의 처리 → 인가 코드 발급',
    description: 'requestId, 사용자 자격증명, 동의 스코프를 받아 redirect_uri를 반환한다.',
    // description: 'requestId, 사용자 자격증명을 받아 redirect_uri로 브라우저를 리다이렉트한다.',
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
