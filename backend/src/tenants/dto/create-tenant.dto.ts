import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateTenantSettingsDto {
  @ApiPropertyOptional({
    description: '액세스 토큰 만료 시간 (초)',
    default: 3600,
  })
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(86400)
  accessTokenTtl?: number;

  @ApiPropertyOptional({
    description: '리프레시 토큰 만료 시간 (초)',
    default: 2592000,
  })
  @IsOptional()
  @IsInt()
  @Min(3600)
  refreshTokenTtl?: number;

  @ApiPropertyOptional({ description: 'PKCE 강제 여부', default: true })
  @IsOptional()
  @IsBoolean()
  requirePkce?: boolean;

  @ApiPropertyOptional({
    description: '허용 grant types',
    default: ['authorization_code', 'refresh_token'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedGrants?: string[];

  @ApiPropertyOptional({
    description: 'Refresh token rotation 여부',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  refreshTokenRotation?: boolean;

  @ApiPropertyOptional({ description: '비밀번호 최소 길이', default: 8 })
  @IsOptional()
  @IsInt()
  @Min(6)
  passwordMinLength?: number;

  @ApiPropertyOptional({
    description: 'OAuth 공개 회원가입 허용 여부',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  allowRegistration?: boolean;
}

export class CreateTenantDto {
  @ApiProperty({
    description: 'URL 식별자 (소문자, 하이픈 허용)',
    example: 'acme-corp',
  })
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug는 소문자, 숫자, 하이픈만 사용 가능합니다',
  })
  slug: string;

  @ApiProperty({ description: '테넌트 표시 이름', example: 'Acme Corp' })
  @IsString()
  name: string;

  @ApiPropertyOptional({
    description: '토큰 issuer URL',
    example: 'https://auth.acme.com',
  })
  @IsOptional()
  @IsUrl()
  issuer?: string;

  @ApiPropertyOptional({ type: CreateTenantSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateTenantSettingsDto)
  settings?: CreateTenantSettingsDto;
}
