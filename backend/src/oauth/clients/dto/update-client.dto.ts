import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsEnum, IsHexColor, IsOptional, IsString, IsUrl, ValidateNested } from 'class-validator';
import { ClientStatus } from '../../../database/entities';

/** 빈 문자열을 null로 변환 */
const emptyToNull = () => Transform(({ value }) => (value === '' ? null : value));

export class LoginBrandingDto {
  @ApiPropertyOptional({ example: 'https://cdn.example.com/logo.png' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  logoUrl?: string;

  @ApiPropertyOptional({ example: '#4f46e5', description: '빈 문자열로 보내면 기본값으로 초기화' })
  @emptyToNull()
  @IsOptional()
  @IsHexColor()
  primaryColor?: string | null;

  @ApiPropertyOptional({ example: '#f9fafb', description: '빈 문자열로 보내면 기본값으로 초기화' })
  @emptyToNull()
  @IsOptional()
  @IsHexColor()
  bgColor?: string | null;

  @ApiPropertyOptional({ example: 'MyApp에 로그인' })
  @emptyToNull()
  @IsOptional()
  @IsString()
  title?: string | null;
}

export class UpdateClientDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: ClientStatus })
  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsUrl({ require_tld: false }, { each: true })
  redirectUris?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedScopes?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedGrants?: string[];

  @ApiPropertyOptional({ type: LoginBrandingDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LoginBrandingDto)
  branding?: LoginBrandingDto | null;
}
