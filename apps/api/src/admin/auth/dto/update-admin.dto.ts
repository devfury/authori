import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { AdminRole, AdminStatus } from '../../../database/entities';

export class UpdateAdminDto {
  @ApiPropertyOptional({ example: 'admin@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '홍길동' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(10)
  password?: string;

  @ApiPropertyOptional({ enum: AdminRole })
  @IsOptional()
  @IsEnum(AdminRole)
  role?: AdminRole;

  @ApiPropertyOptional({
    type: [String],
    description:
      '배정 테넌트 전체 교체. 생략하면 기존 배정을 유지한다. TENANT_ADMIN 은 빈 배열을 허용하지 않는다.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  tenantIds?: string[];

  @ApiPropertyOptional({ enum: AdminStatus })
  @IsOptional()
  @IsEnum(AdminStatus)
  status?: AdminStatus;
}
