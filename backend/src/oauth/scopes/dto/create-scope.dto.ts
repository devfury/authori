import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateScopeDto {
  @ApiProperty({ example: 'read:orders', description: '스코프 식별자 (소문자, 콜론/하이픈 허용)' })
  @IsString()
  @Matches(/^[a-z0-9:_-]+$/, { message: 'name must be lowercase alphanumeric with :, _, - allowed' })
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: '주문 내역 조회' })
  @IsString()
  @MaxLength(100)
  displayName: string;

  @ApiPropertyOptional({ example: '사용자의 주문 내역을 조회할 수 있습니다.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
