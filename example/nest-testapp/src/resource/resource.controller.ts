import {
  Controller,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('Resource (보호된 리소스 예시)')
@Controller('api')
export class ResourceController {
  @Get('resource')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '보호된 리소스 조회',
    description:
      '`POST /token`으로 발급받은 액세스 토큰으로 호출하는 예시 엔드포인트입니다.\n\n' +
      '이 엔드포인트는 이제 `JwtAuthGuard`를 통해 서명을 포함한 토큰의 유효성을 완전히 검증합니다.',
  })
  @ApiResponse({ status: 200, description: '리소스 조회 성공' })
  @ApiResponse({ status: 401, description: '토큰 무효 또는 만료' })
  getResource(@Req() req: any) {
    const payload = req.user;

    return {
      message: '보호된 리소스에 성공적으로 접근했습니다.',
      token: {
        sub: payload.sub,
        clientId: payload.client_id,
        scope: payload.scope,
        tenantId: payload.tenant_id,
        issuedAt: typeof payload.iat === 'number'
          ? new Date(payload.iat * 1000).toISOString()
          : null,
        expiresAt: typeof payload.exp === 'number'
          ? new Date(payload.exp * 1000).toISOString()
          : null,
      },
      data: {
        items: [
          { id: 1, name: '예시 데이터 A' },
          { id: 2, name: '예시 데이터 B' },
          { id: 3, name: '예시 데이터 C' },
        ],
      },
    };
  }
}
