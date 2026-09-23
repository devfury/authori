/**
 * DB 접속 정보 해석.
 *
 * 런타임(DatabaseModule)과 마이그레이션 CLI(data-source.ts)가 같은 결과를 쓰도록
 * 해석을 한 곳에 모은다. 예전에는 두 경로가 env 를 각각 따로 읽어 한쪽만 고치면
 * 어긋날 수 있었다.
 */

export interface DatabaseConnection {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  /** false 면 비암호화. 객체면 TLS 로 접속하며 인증서 검증 여부를 지정한다. */
  ssl: false | { rejectUnauthorized: boolean };
}

const DEFAULT_PORT = 5432;
const EXAMPLE = 'postgresql://user:password@host:5432/dbname';

const LEGACY_KEYS = ['DB_HOST', 'DB_PORT', 'DB_USERNAME', 'DB_PASSWORD', 'DB_NAME'] as const;

/**
 * 오류에 원본 URL 을 절대 넣지 않는다. 비밀번호가 로그·스택트레이스·오류 추적
 * 시스템에 그대로 남는다. 무엇이 잘못됐는지와 올바른 예시만 알린다.
 */
function invalid(reason: string): Error {
  return new Error(`DATABASE_URL 형식이 올바르지 않습니다: ${reason}. 예: ${EXAMPLE}`);
}

/**
 * libpq 의 sslmode 의미를 따른다.
 * require 는 "암호화하되 인증서는 검증하지 않음"이다 — 검증까지 원하면 verify-full 을 쓴다.
 * 관리형 DB 가 자체 서명 인증서를 쓰는 경우가 많아 이 구분이 실제로 중요하다.
 */
function resolveSsl(sslmode: string | null): DatabaseConnection['ssl'] {
  switch (sslmode) {
    case 'require':
    case 'no-verify':
      return { rejectUnauthorized: false };
    case 'verify-ca':
    case 'verify-full':
      return { rejectUnauthorized: true };
    default:
      // 없음 · disable · allow · prefer
      return false;
  }
}

function parseDatabaseUrl(raw: string): DatabaseConnection {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw invalid('URL 로 해석할 수 없습니다');
  }

  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw invalid(
      `지원하지 않는 스킴 '${url.protocol.replace(':', '')}' (postgresql 또는 postgres)`,
    );
  }

  const host = url.hostname;
  if (!host) throw invalid('호스트가 없습니다');

  const database = url.pathname.replace(/^\//, '');
  if (!database) throw invalid('데이터베이스명이 없습니다');

  const port = url.port ? Number(url.port) : DEFAULT_PORT;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw invalid('포트가 올바르지 않습니다');
  }

  // URL 은 사용자명·비밀번호를 퍼센트 인코딩된 채로 돌려준다.
  // 디코딩하지 않으면 'p%40ss' 같은 값이 그대로 전달돼 인증이 실패한다.
  return {
    host,
    port,
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(database),
    ssl: resolveSsl(url.searchParams.get('sslmode')),
  };
}

function fromLegacyVars(env: NodeJS.ProcessEnv): DatabaseConnection {
  return {
    host: env.DB_HOST ?? 'localhost',
    port: parseInt(env.DB_PORT ?? String(DEFAULT_PORT), 10),
    username: env.DB_USERNAME ?? 'authori',
    password: env.DB_PASSWORD ?? '',
    database: env.DB_NAME ?? 'authori_db',
    ssl: false,
  };
}

/**
 * 우선순위:
 *   1. DATABASE_URL — 형식이 잘못되면 던진다. 조용히 기본값으로 넘어가지 않는다.
 *   2. 개별 DB_* 변수 — 폐기 예정. 하드 전환하면 기존 배포가 조용히 3번(localhost)으로
 *      떨어져 엉뚱한 DB 에 붙으므로 당분간 남긴다.
 *   3. 로컬 개발 기본값.
 */
export function resolveDatabaseConnection(
  env: NodeJS.ProcessEnv = process.env,
): DatabaseConnection {
  const raw = env.DATABASE_URL?.trim();
  if (raw) return parseDatabaseUrl(raw);

  if (LEGACY_KEYS.some((key) => env[key] !== undefined)) {
    // 자격증명은 넣지 않는다.
    console.warn(
      '[database] DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD/DB_NAME 는 폐기 예정입니다. ' +
        `DATABASE_URL 하나로 대체하세요. 예: ${EXAMPLE}`,
    );
    return fromLegacyVars(env);
  }

  return fromLegacyVars(env);
}
