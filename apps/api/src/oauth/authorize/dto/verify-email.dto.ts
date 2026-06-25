import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({ description: '이메일 인증 토큰' })
  @IsString()
  token: string;
}
