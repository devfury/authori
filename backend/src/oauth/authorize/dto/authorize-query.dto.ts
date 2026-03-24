import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum ResponseType {
  CODE = 'CODE',
}

export class AuthorizeQueryDto {
  @ApiProperty({ enum: ResponseType, example: 'code' })
  @IsEnum(ResponseType)
  response_type: ResponseType;

  @ApiProperty({ example: 'my-client-id' })
  @IsString()
  client_id: string;

  @ApiProperty({ example: 'https://app.example.com/callback' })
  @IsString()
  redirect_uri: string;

  @ApiPropertyOptional({ example: 'openid profile' })
  @IsOptional()
  @IsString()
  scope?: string;

  @ApiPropertyOptional({ example: 'random_state_value' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ example: 'code_challenge_base64url' })
  @IsOptional()
  @IsString()
  code_challenge?: string;

  @ApiPropertyOptional({ enum: ['S256', 'plain'], example: 'S256' })
  @IsOptional()
  @IsString()
  code_challenge_method?: string;
}
