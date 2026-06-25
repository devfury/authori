import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { UserStatus } from '../../database/entities';

export class UpdateUserDto {
  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  loginId?: string;

  @ApiPropertyOptional({
    description: '업데이트할 프로필 필드 (기존 값과 병합)',
    example: { nickname: 'Johnny' },
  })
  @IsOptional()
  @IsObject()
  profile?: Record<string, unknown>;
}
