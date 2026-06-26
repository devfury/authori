import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsObject, IsOptional, IsString, IsUrl } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'securePassword123' })
  @IsString()
  password: string;

  @ApiPropertyOptional({
    description: '커스텀 프로필 필드 (테넌트 schema에 따라 검증됨)',
    example: { nickname: 'John', birthYear: 1990 },
  })
  @IsOptional()
  @IsObject()
  profile?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'OAuth 흐름 복귀용 requestId' })
  @IsOptional()
  @IsString()
  requestId?: string;

  @ApiPropertyOptional({ description: 'OAuth 흐름 복귀용 clientId' })
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiPropertyOptional({
    description:
      '인증 완료 후 복귀할 동적 목적지 URL (clientId의 등록 redirect_uri origin allowlist로 검증됨)',
  })
  @IsOptional()
  @IsUrl({ require_tld: false })
  continueUri?: string;
}
