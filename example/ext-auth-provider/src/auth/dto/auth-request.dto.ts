import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class AuthRequestDto {
  @ApiProperty({ example: 'alice@example.com' })
  @IsString()
  email!: string;

  @ApiProperty({
    example: 'alice123',
    description: '특수값: simulate:server_error, simulate:timeout',
  })
  @IsString()
  password!: string;
}
