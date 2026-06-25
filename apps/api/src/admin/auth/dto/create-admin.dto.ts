import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { AdminRole } from '../../../database/entities';

export class CreateAdminDto {
  @ApiProperty({ example: 'admin@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '홍길동' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty()
  @IsString()
  @MinLength(10)
  password: string;

  @ApiProperty({ enum: AdminRole })
  @IsEnum(AdminRole)
  role: AdminRole;

  @ApiPropertyOptional({ description: 'TENANT_ADMIN 역할일 때 필수' })
  @IsOptional()
  @IsUUID()
  tenantId?: string;
}
