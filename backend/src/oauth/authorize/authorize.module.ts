import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AuthorizationCode,
  Consent,
  OAuthClient,
  OAuthClientRedirectUri,
  Tenant,
  TenantSettings,
  User,
} from '../../database/entities';
import { AuditModule } from '../../common/audit/audit.module';
import { AuthorizeService } from './authorize.service';
import { AuthorizeController } from './authorize.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OAuthClient,
      OAuthClientRedirectUri,
      AuthorizationCode,
      User,
      Consent,
      Tenant,
      TenantSettings,
    ]),
    AuditModule,
  ],
  controllers: [AuthorizeController],
  providers: [AuthorizeService],
})
export class AuthorizeModule {}
