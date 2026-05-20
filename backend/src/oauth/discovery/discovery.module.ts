import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant, User, UserProfile } from '../../database/entities';
import { KeysModule } from '../keys/keys.module';
import { ScopesModule } from '../scopes/scopes.module';
import { DiscoveryController } from './discovery.controller';
import { UsersModule } from '../../users/users.module';
import { TokenVerifierModule } from '../token-verifier/token-verifier.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, User, UserProfile]),
    KeysModule,
    ScopesModule,
    UsersModule,
    TokenVerifierModule,
  ],
  controllers: [DiscoveryController],
})
export class DiscoveryModule {}
