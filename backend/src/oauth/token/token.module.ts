import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AccessToken,
  AuthorizationCode,
  OAuthClient,
  OAuthClientRedirectUri,
  RefreshToken,
  Tenant,
  TenantSettings,
} from '../../database/entities';
import { KeysModule } from '../keys/keys.module';
import { AuditModule } from '../../common/audit/audit.module';
import { RbacModule } from '../../rbac/rbac.module';
import { TokenService } from './token.service';
import { TokenController } from './token.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OAuthClient,
      OAuthClientRedirectUri,
      AuthorizationCode,
      AccessToken,
      RefreshToken,
      Tenant,
      TenantSettings,
    ]),
    KeysModule,
    AuditModule,
    RbacModule,
  ],
  controllers: [TokenController],
  providers: [TokenService],
  exports: [TokenService],
})
export class TokenModule {}
