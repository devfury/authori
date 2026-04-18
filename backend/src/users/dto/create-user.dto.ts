import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { UserStatus } from '../../database/entities';

export class CreateUserDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '홍길동' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ example: 'securePassword123' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({
    description: '로그인 ID (미입력 시 email 사용)',
    example: 'john.doe',
  })
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

  @ApiPropertyOptional({
    enum: UserStatus,
    description: '생성 시 초기 사용자 상태. 미지정 시 ACTIVE',
  })
  @IsOptional()
  @IsEnum(UserStatus)
  initialStatus?: UserStatus;
}
