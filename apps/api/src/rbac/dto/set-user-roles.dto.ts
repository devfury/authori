import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class SetUserRolesDto {
  @ApiProperty({
    type: [String],
    example: ['8c1b25cc-1d2c-4b2f-9bcb-145c68f5a7df'],
  })
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  roleIds: string[];
}
