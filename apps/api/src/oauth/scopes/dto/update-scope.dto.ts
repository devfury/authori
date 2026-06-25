import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateScopeDto {
  @ApiPropertyOptional({ example: '주문 내역 조회' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @ApiPropertyOptional({ example: '사용자의 주문 내역을 조회할 수 있습니다.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
