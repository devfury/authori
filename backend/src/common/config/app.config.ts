import { registerAs } from '@nestjs/config';

function parseCorsOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function getDefaultCorsOrigins(): string[] {
  const loginPageUrl = process.env.LOGIN_PAGE_URL ?? 'http://localhost:5173/login';

  try {
    return [new URL(loginPageUrl).origin];
  } catch {
    return ['*'];
  }
}

export const appConfig = registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  issuer: process.env.JWT_ISSUER ?? 'https://auth.example.com',
  accessTokenExpiry: parseInt(process.env.JWT_ACCESS_TOKEN_EXPIRY ?? '3600', 10),
  refreshTokenExpiry: parseInt(process.env.JWT_REFRESH_TOKEN_EXPIRY ?? '2592000', 10),
  platformAdminSecret: process.env.PLATFORM_ADMIN_SECRET ?? '',
  adminJwtSecret: process.env.JWT_ADMIN_SECRET ?? 'change_me_admin_secret',
  adminJwtExpiry: parseInt(process.env.JWT_ADMIN_EXPIRY ?? '86400', 10),
  corsOrigins: (() => {
    const origins = parseCorsOrigins(process.env.CORS_ORIGINS ?? '');
    return origins.length > 0 ? origins : getDefaultCorsOrigins();
  })(),
  loginPageUrl: process.env.LOGIN_PAGE_URL ?? 'http://localhost:5173/login',
}));

export const dbConfig = registerAs('db', () => ({
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'authori',
  password: process.env.DB_PASSWORD ?? '',
  name: process.env.DB_NAME ?? 'authori_db',
}));
