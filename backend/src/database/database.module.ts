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
  SigningKey,
  Tenant,
  TenantSettings,
  User,
  UserProfile,
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
          User,
          UserProfile,
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
