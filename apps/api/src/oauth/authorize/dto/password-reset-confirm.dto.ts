import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class PasswordResetConfirmDto {
  @ApiProperty({ description: '재설정 메일 링크의 토큰' })
  @IsString()
  token: string;

  @ApiProperty({ example: 'newSecurePassword123' })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
