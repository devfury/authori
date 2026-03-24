import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class BootstrapAdminDto {
  @ApiProperty({ description: '.env의 PLATFORM_ADMIN_SECRET 값' })
  @IsString()
  secret: string;

  @ApiProperty({ example: 'admin@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(10)
  password: string;
}
