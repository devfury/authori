import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AccessToken,
  Tenant,
  User,
  UserProfile,
} from '../../database/entities';
import { KeysModule } from '../keys/keys.module';
import { ScopesModule } from '../scopes/scopes.module';
import { DiscoveryController } from './discovery.controller';
import { UsersModule } from '../../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, AccessToken, User, UserProfile]),
    KeysModule,
    ScopesModule,
    UsersModule,
  ],
  controllers: [DiscoveryController],
})
export class DiscoveryModule {}
