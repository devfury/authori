import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBasicAuth,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { TokenService } from './token.service';
import { TokenRequestDto } from './dto/token-request.dto';
import { RequireTenantGuard } from '../../common/tenant/require-tenant.guard';
import { CurrentTenant } from '../../common/tenant/tenant.decorator';
import type { TenantContext } from '../../common/tenant/tenant-context';
import { OAuthTokenVerifierService } from '../token-verifier/oauth-token-verifier.service';
import { VerifyTokenResponseDto } from '../token-verifier/dto/verify-token-response.dto';

@ApiTags('OAuth2')
@ApiParam({ name: 'tenantSlug', description: '테넌트 슬러그' })
@Controller('t/:tenantSlug/oauth')
@UseGuards(RequireTenantGuard)
export class TokenController {
  constructor(
    private readonly tokenService: TokenService,
    private readonly tokenVerifier: OAuthTokenVerifierService,
  ) {}

  @Post('token')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiBasicAuth('ClientBasicAuth')
  @ApiOperation({
    summary: '토큰 발급',
    description: 'grant_type: authorization_code | refresh_token | client_credentials',
  })
  issue(@CurrentTenant() tenant: TenantContext, @Body() dto: TokenRequestDto, @Req() req: Request) {
    const basicAuth = this.parseBasicAuth(req.headers['authorization']);
    return this.tokenService.issue(tenant.tenantId, dto, basicAuth, {
      ipAddress: req.ip ?? null,
      userAgent: (req.headers['user-agent'] as string) ?? null,
      requestId: (req.headers['x-request-id'] as string) ?? null,
    });
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOkResponse({ type: VerifyTokenResponseDto })
  @ApiOperation({
    summary: '액세스 토큰 검증 (POST)',
    description:
      'Authorization Bearer 액세스 토큰의 서명, 만료, 폐기, 테넌트 일치를 검증한다. authorization_code와 client_credentials 토큰을 모두 지원한다.',
  })
  verify(@CurrentTenant() tenant: TenantContext, @Req() req: Request) {
    return this.tokenVerifier.verifyBearer(tenant.tenantId, req.headers['authorization']);
  }

  @Get('verify')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOkResponse({ type: VerifyTokenResponseDto })
  @ApiOperation({
    summary: '액세스 토큰 검증 (GET)',
    description: 'POST /verify와 동일하지만 GET 메서드로 호출한다. 본문 없이 Authorization 헤더만 사용.',
  })
  verifyGet(@CurrentTenant() tenant: TenantContext, @Req() req: Request) {
    return this.tokenVerifier.verifyBearer(tenant.tenantId, req.headers['authorization']);
  }

  private parseBasicAuth(header?: string): { id?: string; secret?: string } {
    if (!header?.startsWith('Basic ')) return {};
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf-8');
    const [id, ...rest] = decoded.split(':');
    return { id, secret: rest.join(':') };
  }
}
