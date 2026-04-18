import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsObject, IsOptional, IsString } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'securePassword123' })
  @IsString()
  password: string;

  @ApiPropertyOptional({ example: '홍길동' })
  @IsOptional()
  @IsString()
  name?: string;

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
}
