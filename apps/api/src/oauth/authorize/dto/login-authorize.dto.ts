import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEmail, IsOptional, IsString } from 'class-validator';

export class LoginAuthorizeDto {
  @ApiProperty({ description: '인가 요청 ID (GET /authorize 응답값)' })
  @IsString()
  requestId: string;

  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  password: string;

  @ApiPropertyOptional({
    description: '사용자가 동의한 스코프 목록 (미입력 시 요청된 모든 스코프 동의)',
    example: ['openid', 'profile'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  grantedScopes?: string[];
}
