import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RevokeRequestDto {
  @ApiProperty({ description: 'access_token 또는 refresh_token 값' })
  @IsString()
  token: string;

  @ApiPropertyOptional({ enum: ['access_token', 'refresh_token'] })
  @IsOptional()
  @IsString()
  token_type_hint?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  client_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  client_secret?: string;
}
