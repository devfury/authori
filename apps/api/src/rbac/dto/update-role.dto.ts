import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateRoleDto {
  @ApiPropertyOptional({ example: '매니저' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @ApiPropertyOptional({ example: '주문 관리 권한을 가진 사용자 역할입니다.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description: '회원가입 사용자에게 자동 부여할 기본 역할 여부',
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
