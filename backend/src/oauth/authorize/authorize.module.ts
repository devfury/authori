import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AuthorizationCode,
  Consent,
  OAuthClient,
  OAuthClientRedirectUri,
  ProfileSchemaVersion,
  TenantSettings,
  User,
  UserProfile,
} from '../../database/entities';
import { AuditModule } from '../../common/audit/audit.module';
import { ExternalAuthModule } from '../../external-auth/external-auth.module';
import { AuthorizeService } from './authorize.service';
import { AuthorizeController } from './authorize.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OAuthClient,
      OAuthClientRedirectUri,
      AuthorizationCode,
      User,
      UserProfile,
      ProfileSchemaVersion,
      Consent,
      TenantSettings,
    ]),
    AuditModule,
    ExternalAuthModule,
  ],
  controllers: [AuthorizeController],
  providers: [AuthorizeService],
})
export class AuthorizeModule {}
