import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'securePassword123' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ description: '로그인 ID (미입력 시 email 사용)', example: 'john.doe' })
  @IsOptional()
  @IsString()
  loginId?: string;

  @ApiPropertyOptional({
    description: '커스텀 프로필 필드 (테넌트 schema에 따라 검증됨)',
    example: { nickname: 'John', birthYear: 1990 },
  })
  @IsOptional()
  @IsObject()
  profile?: Record<string, unknown>;
}
