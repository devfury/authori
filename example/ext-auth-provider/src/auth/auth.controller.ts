import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthRequestDto } from './dto/auth-request.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '외부 인증 (Authori가 호출하는 핵심 엔드포인트)',
    description: [
      '요청: `{ email, password }`',
      '',
      '**특수 비밀번호 (테스트 시나리오):**',
      '- `simulate:server_error` — HTTP 500 반환 → Authori가 server_error 감지, 로컬 폴백',
      '- `simulate:timeout` — 10초 지연 → Authori 5초 타임아웃 → timeout 감지, 로컬 폴백',
      '',
      '**응답:**',
      '- 성공: `{ authenticated: true, user: { email, name, loginId, profile } }`',
      '- 명시적 거부: `{ authenticated: false, reason: "..." }` → Authori 로컬 폴백 없음',
    ].join('\n'),
  })
  @ApiSecurity('credential')
  async authenticate(
    @Headers() headers: Record<string, string>,
    @Body() dto: AuthRequestDto,
  ): Promise<object> {
    const credHeader = this.config.get<string>('CREDENTIAL_HEADER');
    const credValue = this.config.get<string>('CREDENTIAL_VALUE');

    if (credHeader && credValue) {
      const provided = headers[credHeader.toLowerCase()];
      if (provided !== credValue) {
        throw new UnauthorizedException('Invalid provider credential');
      }
    }

    return this.authService.authenticate(dto);
  }
}
