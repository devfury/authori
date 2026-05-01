import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthorizeService } from './authorize.service';
import { AuthorizeQueryDto } from './dto/authorize-query.dto';
import { LoginAuthorizeDto } from './dto/login-authorize.dto';
import { RegisterDto } from './dto/register.dto';
import { CurrentTenant } from '../../common/tenant/tenant.decorator';
import { RequireTenantGuard } from '../../common/tenant/require-tenant.guard';
import type { TenantContext } from '../../common/tenant/tenant-context';

@ApiTags('OAuth2')
@ApiParam({ name: 'tenantSlug', description: '테넌트 슬러그' })
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
    const result = await this.authorizeService.initiateAuthorize(
      tenant.tenantId,
      tenant.tenantSlug,
      query,
    );

    if (accept?.includes('text/html')) {
      const loginPageUrl =
        this.configService.get<string>('app.loginPageUrl') ??
        'http://localhost:5173/login';
      const loginUrl = new URL(loginPageUrl);
      loginUrl.searchParams.set('requestId', result.requestId);
      loginUrl.searchParams.set('tenantSlug', result.tenantSlug);
      loginUrl.searchParams.set('clientId', result.client.clientId);
      loginUrl.searchParams.set('scopes', result.requestedScopes.join(' '));
      res.redirect(loginUrl.toString());
      return;
    }

    return result;
  }

  @Get('login-config')
  @ApiOperation({
    summary: '로그인 페이지 설정 조회',
    description:
      'clientId로 해당 클라이언트의 브랜딩 정보를 반환한다. 인증 불필요.',
  })
  async loginConfig(
    @CurrentTenant() tenant: TenantContext,
    @Query('client_id') clientId?: string,
    @Query('clientId') camelClientId?: string,
  ) {
    return this.authorizeService.getLoginConfig(
      tenant.tenantId,
      clientId ?? camelClientId,
    );
  }

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: '공개 회원가입',
    description:
      '테넌트 설정에서 회원가입이 허용된 경우 사용자를 생성한다. 자동 활성화 설정이 꺼져 있으면 INACTIVE 상태로 생성한다.',
  })
  register(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: RegisterDto,
    @Req() req: Request,
  ) {
    return this.authorizeService.register(tenant.tenantId, dto, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.requestId,
    });
  }

  @Post('authorize')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: '로그인 + 동의 처리 → 인가 코드 발급',
    description:
      'requestId, 사용자 자격증명, 동의 스코프를 받아 redirect_uri를 반환한다.',
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
