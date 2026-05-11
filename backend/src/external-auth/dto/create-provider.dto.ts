import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  ValidateNested,
} from 'class-validator';
import type { TransformSpec } from '../../database/entities';


export class FieldMappingDto {
  @ApiPropertyOptional({ example: 'email' })
  @IsOptional()
  @IsString()
  email?: string;

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

export class ParameterizedTransformDto {
  @ApiProperty({ enum: ['prefix', 'suffix', 'template', 'regex_extract', 'substring'] })
  @IsString()
  type: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  value?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pattern?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  group?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  start?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  end?: number;
}

export class RequestMappingDto {
  @ApiPropertyOptional({ example: 'login_id' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ example: 'passwd' })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({ example: 'tenant' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ example: 'client' })
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiPropertyOptional({
    description: '외부 인증 요청에 항상 포함할 고정 문자열 파라미터',
    example: { source: 'authori', grant_type: 'password' },
  })
  @IsOptional()
  @IsObject()
  staticParams?: Record<string, string>;

  @ApiPropertyOptional({
    description: '각 소스 값에 적용할 변환 파이프라인',
    example: { email: ['email_prefix'], password: ['base64'] },
  })
  @IsOptional()
  @IsObject()
  transforms?: {
    email?: TransformSpec[];
    password?: TransformSpec[];
    tenantId?: TransformSpec[];
    clientId?: TransformSpec[];
  };
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

  @ApiPropertyOptional({
    description: '외부 인증 요청에 추가할 헤더 목록',
    example: { Authorization: 'Bearer token', 'X-Tenant-Code': 'demo' },
  })
  @IsOptional()
  @IsObject()
  credentialHeaders?: Record<string, string> | null;

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

  @ApiPropertyOptional({ type: RequestMappingDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RequestMappingDto)
  requestMapping?: RequestMappingDto | null;
}
