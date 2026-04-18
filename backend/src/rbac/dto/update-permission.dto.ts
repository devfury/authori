import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePermissionDto {
  @ApiPropertyOptional({ example: '주문 삭제' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @ApiPropertyOptional({ example: '주문을 삭제할 수 있습니다.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
