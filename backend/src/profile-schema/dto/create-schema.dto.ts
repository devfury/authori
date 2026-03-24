import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

export class CreateSchemaDto {
  @ApiProperty({
    description: 'JSON Schema 형식의 프로필 필드 정의',
    example: {
      type: 'object',
      properties: {
        nickname: { type: 'string', maxLength: 50 },
        phone: { type: 'string', pattern: '^\\+?[0-9]{7,15}$' },
        birthYear: { type: 'integer', minimum: 1900, maximum: 2100 },
      },
      required: ['nickname'],
    },
  })
  @IsObject()
  schemaJsonb: Record<string, unknown>;

  @ApiPropertyOptional({ description: '작성자 ID' })
  @IsOptional()
  @IsString()
  publishedBy?: string;
}
