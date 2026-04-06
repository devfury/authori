import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from 'dotenv';
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

config({ path: '.env' });

/**
 * TypeORM CLI 마이그레이션용 DataSource
 * 실행: npx typeorm migration:generate src/database/migrations/InitialSchema -d src/database/data-source.ts
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'authori',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'authori_db',
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
});
