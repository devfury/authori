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
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: (process.env.SMTP_SECURE ?? 'false') === 'true',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? 'Authori <no-reply@authori.local>',
    /** 개발환경 전용 — 설정 시 모든 수신자를 이 주소로 강제 변경한다 */
    devRedirectTo: process.env.SMTP_DEV_REDIRECT_TO ?? '',
    /** TLS 인증서 검증 여부. false 로 두면 자체 서명 인증서를 허용한다(개발용). 기본 true */
    tlsRejectUnauthorized: (process.env.SMTP_TLS_REJECT_UNAUTHORIZED ?? 'true') !== 'false',
  },
  emailVerificationTtl: parseInt(process.env.EMAIL_VERIFICATION_TTL ?? '86400', 10),
}));

export const dbConfig = registerAs('db', () => ({
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'authori',
  password: process.env.DB_PASSWORD ?? '',
  name: process.env.DB_NAME ?? 'authori_db',
  /** 쿼리 로깅 여부. 미설정 시 개발환경에서만 켜진다. DB_LOGGING=false 로 강제로 끌 수 있다 */
  logging:
    process.env.DB_LOGGING !== undefined
      ? process.env.DB_LOGGING === 'true'
      : (process.env.NODE_ENV ?? 'development') === 'development',
}));
