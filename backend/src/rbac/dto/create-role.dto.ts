import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({
    example: 'manager',
    description: '역할 식별자 (소문자, 콜론/언더스코어/하이픈 허용)',
  })
  @IsString()
  @Matches(/^[a-z0-9:_-]+$/, {
    message: 'name must be lowercase alphanumeric with :, _, - allowed',
  })
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: '매니저' })
  @IsString()
  @MaxLength(100)
  displayName: string;

  @ApiPropertyOptional({ example: '주문 관리 권한을 가진 사용자 역할입니다.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
