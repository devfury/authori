import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TokenService } from './token.service';
import { RequestTokenDto } from './dto/request-token.dto';

@ApiTags('Token')
@Controller('token')
export class TokenController {
  constructor(private readonly tokenService: TokenService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '액세스 토큰 발급',
    description:
      'Client Credentials grant로 Authori 서버에서 액세스 토큰을 발급받습니다.\n\n' +
      '`authServerUrl`과 `tenantSlug`를 생략하면 서버 환경변수 값이 사용됩니다.',
  })
  @ApiResponse({ status: 200, description: '토큰 발급 성공' })
  @ApiResponse({ status: 401, description: '클라이언트 인증 실패' })
  async getToken(@Body() dto: RequestTokenDto) {
    return this.tokenService.fetchClientCredentialsToken(dto);
  }

  @Get('decode')
  @ApiOperation({
    summary: 'JWT 디코드',
    description:
      '액세스 토큰의 헤더와 페이로드를 디코드하여 클레임을 확인합니다.\n\n' +
      '서명 검증은 수행하지 않으며 내용 확인 용도로만 사용하세요.',
  })
  @ApiQuery({ name: 'token', description: 'Bearer 토큰 값 (Bearer 접두사 제외)', required: true })
  @ApiResponse({ status: 200, description: '디코드 성공' })
  decode(@Query('token') token: string) {
    return this.tokenService.decodeToken(token);
  }
}
