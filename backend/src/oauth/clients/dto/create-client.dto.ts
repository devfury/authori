import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';
import { ClientType } from '../../../database/entities';

export class CreateClientDto {
  @ApiProperty({ example: 'My Web App' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ enum: ClientType, default: ClientType.CONFIDENTIAL })
  @IsOptional()
  @IsEnum(ClientType)
  type?: ClientType;

  @ApiProperty({ description: '허용 redirect URIs', example: ['https://app.example.com/callback'] })
  @IsArray()
  @ArrayMinSize(1)
  @IsUrl({}, { each: true })
  redirectUris: string[];

  @ApiPropertyOptional({ description: '허용 scopes', default: ['openid'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedScopes?: string[];

  @ApiPropertyOptional({
    description: '허용 grant types',
    default: ['authorization_code', 'refresh_token'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedGrants?: string[];
}
