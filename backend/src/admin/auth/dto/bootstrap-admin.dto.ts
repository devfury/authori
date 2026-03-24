import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class BootstrapAdminDto {
  @ApiProperty({ description: '.env의 PLATFORM_ADMIN_SECRET 값' })
  @IsString()
  secret: string;

  @ApiProperty({ example: 'admin@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '홍길동' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty()
  @IsString()
  @MinLength(10)
  password: string;
}
