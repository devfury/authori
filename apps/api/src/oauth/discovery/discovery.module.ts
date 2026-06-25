import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../../database/entities';
import { KeysModule } from '../keys/keys.module';
import { ScopesModule } from '../scopes/scopes.module';
import { DiscoveryController } from './discovery.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant]), KeysModule, ScopesModule],
  controllers: [DiscoveryController],
})
export class DiscoveryModule {}
