import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AccessToken,
  AdminUser,
  AuditLog,
  AuthorizationCode,
  Consent,
  ExternalAuthProvider,
  OAuthClient,
  OAuthClientRedirectUri,
  ProfileSchemaVersion,
  RefreshToken,
  RolePermission,
  SigningKey,
  Tenant,
  TenantPermission,
  TenantRole,
  TenantScope,
  TenantSettings,
  User,
  UserProfile,
  UserRole,
} from './entities';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('db.host'),
        port: config.get<number>('db.port'),
        username: config.get<string>('db.username'),
        password: config.get<string>('db.password'),
        database: config.get<string>('db.name'),
        entities: [
          Tenant,
          TenantSettings,
          TenantScope,
          TenantRole,
          TenantPermission,
          User,
          UserProfile,
          RolePermission,
          UserRole,
          ProfileSchemaVersion,
          OAuthClient,
          OAuthClientRedirectUri,
          AuthorizationCode,
          AccessToken,
          RefreshToken,
          Consent,
          SigningKey,
          AuditLog,
          AdminUser,
          ExternalAuthProvider,
        ],
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        synchronize: false,
        logging: config.get<string>('app.nodeEnv') === 'development',
      }),
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
