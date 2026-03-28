import {
  Controller,
  Get,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('Resource (보호된 리소스 예시)')
@Controller('api')
export class ResourceController {
  @Get('resource')
  @ApiBearerAuth()
  @ApiOperation({
    summary: '보호된 리소스 조회',
    description:
      '`POST /token`으로 발급받은 액세스 토큰으로 호출하는 예시 엔드포인트입니다.\n\n' +
      '토큰에서 `sub`, `scope`, `client_id` 클레임을 추출하여 반환합니다.',
  })
  @ApiResponse({ status: 200, description: '리소스 조회 성공' })
  @ApiResponse({ status: 401, description: '토큰 없음 또는 형식 오류' })
  getResource(@Headers('authorization') authHeader: string) {
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Bearer 토큰이 필요합니다.');
    }

    const token = authHeader.slice(7);
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('유효하지 않은 토큰 형식입니다.');
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(
        Buffer.from(parts[1], 'base64url').toString('utf-8'),
      ) as Record<string, unknown>;
    } catch {
      throw new UnauthorizedException('토큰 디코드에 실패했습니다.');
    }

    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === 'number' && payload.exp < now) {
      throw new UnauthorizedException('토큰이 만료됐습니다.');
    }

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
