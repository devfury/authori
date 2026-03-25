import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class RequestTokenDto {
  @ApiPropertyOptional({
    description: 'Authori 서버 URL',
    example: 'http://localhost:3000',
  })
  @IsOptional()
  @IsString()
  authServerUrl?: string;

  @ApiPropertyOptional({
    description: '테넌트 슬러그',
    example: 'test',
  })
  @IsOptional()
  @IsString()
  tenantSlug?: string;

  @ApiProperty({
    description: 'OAuth 클라이언트 ID',
    example: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  })
  @IsNotEmpty()
  @IsString()
  clientId: string;

  @ApiProperty({
    description: 'OAuth 클라이언트 시크릿',
    example: 'your-client-secret',
  })
  @IsNotEmpty()
  @IsString()
  clientSecret: string;

  @ApiPropertyOptional({
    description: '요청 스코프 (공백 구분)',
    example: 'openid profile',
  })
  @IsOptional()
  @IsString()
  scope?: string;
}
