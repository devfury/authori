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
  PendingOAuthRequest,
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
    PendingOAuthRequest,
  ],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
});
