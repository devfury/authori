import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VerifyTokenResponseDto {
  @ApiProperty({ example: true })
  active: true;

  @ApiProperty({ enum: ['user', 'client'] })
  subjectType: 'user' | 'client';

  @ApiProperty()
  sub: string;

  @ApiProperty()
  clientId: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty()
  scope: string;

  @ApiProperty({ type: [String] })
  scopes: string[];

  @ApiProperty()
  jti: string;

  @ApiProperty()
  expiresAt: string;

  @ApiPropertyOptional({ type: [String] })
  roles?: string[];

  @ApiPropertyOptional({ type: [String] })
  permissions?: string[];
}
