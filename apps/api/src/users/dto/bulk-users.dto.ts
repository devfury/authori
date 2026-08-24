import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class BulkActivateUsersDto {
  @ApiProperty({ description: '대상 사용자 ID 목록 (1~100건)', type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID(undefined, { each: true })
  userIds: string[];
}

export class BulkHoldUsersDto extends BulkActivateUsersDto {
  @ApiPropertyOptional({
    description: '보류 사유 (모든 성공 건의 감사 로그에 기록)',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
