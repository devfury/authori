import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SigningKey } from '../../database/entities';
import { KeysService } from './keys.service';

@Module({
  imports: [TypeOrmModule.forFeature([SigningKey])],
  providers: [KeysService],
  exports: [KeysService],
})
export class KeysModule {}
