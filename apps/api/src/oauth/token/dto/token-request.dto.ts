import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class TokenRequestDto {
  @ApiProperty({
    enum: ['authorization_code', 'refresh_token', 'client_credentials'],
    example: 'authorization_code',
  })
  @IsString()
  grant_type: string;

  // --- authorization_code ---
  @ApiPropertyOptional({ example: 'auth_code_value' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ example: 'https://app.example.com/callback' })
  @IsOptional()
  @IsString()
  redirect_uri?: string;

  @ApiPropertyOptional({ description: 'PKCE code_verifier' })
  @IsOptional()
  @IsString()
  code_verifier?: string;

  // --- refresh_token ---
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  refresh_token?: string;

  // --- client_credentials ---
  @ApiPropertyOptional({ example: 'openid' })
  @IsOptional()
  @IsString()
  scope?: string;

  // --- client authentication (body) ---
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  client_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  client_secret?: string;
}
