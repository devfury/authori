import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AuthorizationCode,
  Consent,
  OAuthClient,
  OAuthClientRedirectUri,
  PendingOAuthRequest,
  ProfileSchemaVersion,
  TenantSettings,
  User,
  UserProfile,
} from '../../database/entities';
import { AuditModule } from '../../common/audit/audit.module';
import { ExternalAuthModule } from '../../external-auth/external-auth.module';
import { RbacModule } from '../../rbac/rbac.module';
import { UsersModule } from '../../users/users.module';
import { ScopesModule } from '../scopes/scopes.module';
import { AuthorizeService } from './authorize.service';
import { AuthorizeController } from './authorize.controller';
import { TypeOrmPendingRequestStore } from './typeorm-pending-request.store';
import { PendingRequestCleanupService } from './pending-request-cleanup.service';
import { PENDING_REQUEST_STORE } from './pending-request.store';

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
      PendingOAuthRequest,
    ]),
    AuditModule,
    ExternalAuthModule,
    RbacModule,
    UsersModule,
    ScopesModule,
  ],
  controllers: [AuthorizeController],
  providers: [
    AuthorizeService,
    { provide: PENDING_REQUEST_STORE, useClass: TypeOrmPendingRequestStore },
    PendingRequestCleanupService,
  ],
})
export class AuthorizeModule {}
