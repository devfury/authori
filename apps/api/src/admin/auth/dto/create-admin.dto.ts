import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsEmail, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
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

  @ApiPropertyOptional({
    type: [String],
    description:
      'TENANT_ADMIN 역할일 때 최소 1개 필수. PLATFORM_ADMIN 은 모든 테넌트에 접근하므로 무시된다.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  tenantIds?: string[];
}
