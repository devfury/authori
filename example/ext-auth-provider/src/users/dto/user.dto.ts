import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'alice@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'alice123' })
  @IsString()
  password!: string;

  @ApiPropertyOptional({ example: 'Alice Kim' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'alice' })
  @IsOptional()
  @IsString()
  loginId?: string;

  @ApiPropertyOptional({ example: { department: 'engineering' } })
  @IsOptional()
  @IsObject()
  profile?: Record<string, unknown>;
}

export interface UserRecord {
  email: string;
  password: string;
  name?: string;
  loginId?: string;
  profile?: Record<string, unknown>;
}
