import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessToken, Tenant, User, UserProfile } from '../../database/entities';
import { KeysModule } from '../keys/keys.module';
import { DiscoveryController } from './discovery.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, AccessToken, User, UserProfile]),
    KeysModule,
  ],
  controllers: [DiscoveryController],
})
export class DiscoveryModule {}
