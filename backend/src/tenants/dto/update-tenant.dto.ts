import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsUrl, ValidateNested } from 'class-validator';
import { TenantStatus } from '../../database/entities';
import { CreateTenantSettingsDto } from './create-tenant.dto';

export class UpdateTenantDto {
  @ApiPropertyOptional({ example: 'Acme Corp (Updated)' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'https://auth.acme.com' })
  @IsOptional()
  @IsUrl()
  issuer?: string;

  @ApiPropertyOptional({ enum: TenantStatus })
  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;

  @ApiPropertyOptional({ type: CreateTenantSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateTenantSettingsDto)
  settings?: CreateTenantSettingsDto;
}
