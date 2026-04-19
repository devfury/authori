import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

/**
 * 엔드유저가 본인 계정을 수정할 때 사용하는 DTO.
 * status 는 의도적으로 제외한다 — 본인이 자신을 잠그거나 활성화/비활성화할 수 없다.
 */
export class SelfUpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  loginId?: string;

  @ApiPropertyOptional({
    description: '업데이트할 프로필 필드 (기존 값과 병합)',
    example: { nickname: 'Johnny' },
  })
  @IsOptional()
  @IsObject()
  profile?: Record<string, unknown>;
}
