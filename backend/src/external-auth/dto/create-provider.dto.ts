import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  ValidateNested,
} from 'class-validator';

export class FieldMappingDto {
  @ApiPropertyOptional({ example: 'email' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ example: 'name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'username' })
  @IsOptional()
  @IsString()
  loginId?: string;

  @ApiPropertyOptional({
    description: '외부 응답 필드 → profile.key 매핑',
    example: { dept: 'department', empNo: 'employeeNumber' },
  })
  @IsOptional()
  @IsObject()
  profile?: Record<string, string>;
}

export class CreateProviderDto {
  @ApiPropertyOptional({ description: '특정 clientId에만 적용. null이면 테넌트 전체 적용' })
  @IsOptional()
  @IsString()
  clientId?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty({ example: 'https://legacy-auth.example.com/validate' })
  @IsUrl({ require_tld: false })
  providerUrl: string;

  @ApiPropertyOptional({ example: 'X-Api-Key' })
  @IsOptional()
  @IsString()
  credentialHeader?: string | null;

  @ApiPropertyOptional({ example: 'secret-api-key' })
  @IsOptional()
  @IsString()
  credentialValue?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  jitProvision?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  syncOnLogin?: boolean;

  @ApiPropertyOptional({ type: FieldMappingDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => FieldMappingDto)
  fieldMapping?: FieldMappingDto | null;
}
