import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreatePermissionDto {
  @ApiProperty({
    example: 'orders:delete',
    description: '권한 식별자 (소문자, 콜론/언더스코어/하이픈 허용)',
  })
  @IsString()
  @Matches(/^[a-z0-9:_-]+$/, {
    message: 'name must be lowercase alphanumeric with :, _, - allowed',
  })
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: '주문 삭제' })
  @IsString()
  @MaxLength(100)
  displayName: string;

  @ApiPropertyOptional({ example: '주문을 삭제할 수 있습니다.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
