import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OAuthClient, OAuthClientRedirectUri } from '../../database/entities';
import { AuditModule } from '../../common/audit/audit.module';
import { AdminAuthModule } from '../../admin/auth/admin-auth.module';
import { ScopesModule } from '../scopes/scopes.module';
import { ClientsService } from './clients.service';
import { ClientsController } from './clients.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([OAuthClient, OAuthClientRedirectUri]),
    AuditModule,
    AdminAuthModule,
    ScopesModule,
  ],
  controllers: [ClientsController],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
