import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  issuer: process.env.JWT_ISSUER ?? 'https://auth.example.com',
  accessTokenExpiry: parseInt(process.env.JWT_ACCESS_TOKEN_EXPIRY ?? '3600', 10),
  refreshTokenExpiry: parseInt(process.env.JWT_REFRESH_TOKEN_EXPIRY ?? '2592000', 10),
  platformAdminSecret: process.env.PLATFORM_ADMIN_SECRET ?? '',
  adminJwtSecret: process.env.JWT_ADMIN_SECRET ?? 'change_me_admin_secret',
  adminJwtExpiry: parseInt(process.env.JWT_ADMIN_EXPIRY ?? '86400', 10),
  corsOrigins: (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
}));

export const dbConfig = registerAs('db', () => ({
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'authori',
  password: process.env.DB_PASSWORD ?? '',
  name: process.env.DB_NAME ?? 'authori_db',
}));
