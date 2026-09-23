# 개발설계서 — DB 접속 정보를 DATABASE_URL 단일 변수로

- 작성일: 2026-09-23
- 관련 요구사항: [2026-09-23-database-url-requirements.md](../requirements/2026-09-23-database-url-requirements.md)

## 1. 범위

`apps/api` 의 DB 구성 계층과 저장소 루트의 설정 파일·문서만 변경한다. DB 스키마·마이그레이션·도메인 로직 변경 없음.

## 2. 현재 구조

```
.env ─┬─▶ common/config/app.config.ts (dbConfig)  ─▶ database/database.module.ts  ─▶ 런타임
      └─▶ database/data-source.ts                                                 ─▶ 마이그레이션 CLI
```

두 경로가 **같은 env 를 각각 따로 읽는다.** 엔티티 목록도 두 파일에 각각 하드코딩돼 있고, 그 중복이 `AdminUserTenant` 누락을 낳았다.

## 3. 목표 구조

```
.env ─▶ database/database-url.ts (resolveDatabaseConnection)
          │
          ├─▶ app.config.ts (dbConfig) ─▶ database.module.ts ─▶ 런타임
          └─▶ data-source.ts                                  ─▶ 마이그레이션 CLI

database/entities/index.ts (ALL_ENTITIES) ─▶ 양쪽이 함께 참조
```

해석과 엔티티 목록을 각각 한 곳으로 모은다.

## 4. URL 해석 — `database/database-url.ts` (신규)

### 4.1 인터페이스

```ts
export interface DatabaseConnection {
  host: string
  port: number
  username: string
  password: string
  database: string
  ssl: false | { rejectUnauthorized: boolean }
}

export function resolveDatabaseConnection(env: NodeJS.ProcessEnv = process.env): DatabaseConnection
```

`env` 를 인자로 받는다. 테스트에서 `process.env` 를 건드리지 않고 검증하기 위해서다.

### 4.2 우선순위 (FR-8·9)

| 순서 | 조건 | 동작 |
|---|---|---|
| 1 | `DATABASE_URL` 이 있음 | 파싱한다. 형식이 잘못되면 **던진다**(FR-6). |
| 2 | `DB_HOST`·`DB_PORT`·`DB_USERNAME`·`DB_PASSWORD`·`DB_NAME` 중 하나라도 있음 | 개별 변수로 구성하고 **폐기 예정 경고**를 `console.warn` 으로 남긴다. |
| 3 | 둘 다 없음 | 로컬 개발 기본값 `localhost:5432 / authori / authori_db` (현재와 동일). |

> **2번을 남기는 이유**: 하드 전환하면 기존 `DB_*` 만 설정된 배포가 조용히 **1번도 2번도 아닌 3번(localhost)** 으로 떨어져 엉뚱한 DB 에 붙는다. 이것이 요구사항 1.1 에서 지적한 바로 그 실패 방식이다. 모든 배포가 옮겨간 뒤 별도 작업으로 제거한다.

### 4.3 파싱

`new URL()` 을 쓴다. 직접 정규식을 쓰지 않는다 — 퍼센트 인코딩·IPv6·기본 포트 처리를 표준 구현에 맡긴다.

```ts
const url = new URL(raw)   // 실패 시 TypeError → 아래에서 감싸 던진다
```

| 항목 | 규칙 |
|---|---|
| 스킴 | `postgresql:` 또는 `postgres:` 만 허용. 그 외는 던진다 (FR-2) |
| host | `url.hostname`. 비면 던진다 |
| port | `url.port` 가 비면 `5432` (FR-4) |
| username / password | `decodeURIComponent(url.username / url.password)` (FR-3) |
| database | `url.pathname` 의 선행 `/` 제거. 비면 던진다 |
| ssl | `sslmode` 로 결정 (아래) |

`URL` 은 `username`·`password` 를 퍼센트 인코딩된 상태로 돌려주므로 반드시 디코딩해야 한다. `p%40ss` 를 그대로 쓰면 인증이 실패한다.

### 4.4 sslmode (FR-5)

| `sslmode` | `ssl` 값 |
|---|---|
| 없음 · `disable` · `allow` · `prefer` | `false` |
| `require` · `no-verify` | `{ rejectUnauthorized: false }` |
| `verify-ca` · `verify-full` | `{ rejectUnauthorized: true }` |

`require` 에서 검증을 끄는 것은 libpq 의 의미와 같다 — `require` 는 "암호화하되 인증서는 검증하지 않음"이고, 검증까지 원하면 `verify-full` 을 쓴다. 관리형 DB 가 자체 서명 인증서를 쓰는 경우가 많아 이 구분이 실제로 중요하다.

### 4.5 오류 메시지 (FR-6, NFR-1)

```ts
throw new Error(
  `DATABASE_URL 형식이 올바르지 않습니다: ${reason}. ` +
  `예: postgresql://user:password@host:5432/dbname`
)
```

**원본 URL 을 메시지에 넣지 않는다.** 비밀번호가 로그·스택트레이스·오류 추적 시스템에 남는다. 무엇이 잘못됐는지(`reason`)와 올바른 예시만 알려준다.

## 5. 적용

### 5.1 `common/config/app.config.ts`

```ts
export const dbConfig = registerAs('db', () => {
  const connection = resolveDatabaseConnection();
  return {
    ...connection,
    /** 쿼리 로깅 여부. 미설정 시 개발환경에서만 켜진다. */
    logging: process.env.DB_LOGGING !== undefined
      ? process.env.DB_LOGGING === 'true'
      : (process.env.NODE_ENV ?? 'development') === 'development',
  };
});
```

`name` 키를 `database` 로 바꾼다. TypeORM 의 필드명과 맞춰 `database.module.ts` 에서 그대로 펼칠 수 있게 한다.

### 5.2 `database/database.module.ts`

```ts
useFactory: (config: ConfigService) => ({
  type: 'postgres',
  host: config.get<string>('db.host'),
  port: config.get<number>('db.port'),
  username: config.get<string>('db.username'),
  password: config.get<string>('db.password'),
  database: config.get<string>('db.database'),
  ssl: config.get('db.ssl'),
  entities: ALL_ENTITIES,
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: config.get<boolean>('db.logging') ?? false,
})
```

### 5.3 `database/data-source.ts`

```ts
const connection = resolveDatabaseConnection();

export const AppDataSource = new DataSource({
  type: 'postgres',
  ...connection,
  entities: ALL_ENTITIES,
  migrations: [...],
});
```

### 5.4 엔티티 목록 단일화 (FR-11)

`database/entities/index.ts` 끝에 배열을 둔다.

```ts
/**
 * DataSource 에 등록할 전체 엔티티.
 * 런타임(DatabaseModule)과 마이그레이션 CLI(data-source.ts)가 함께 참조한다.
 * 목록이 갈라져 AdminUserTenant 가 런타임에서 누락된 전례가 있다(2026-09-23).
 */
export const ALL_ENTITIES = [ ... ];
```

엔티티를 추가할 때 고칠 곳이 한 군데가 된다. 이것이 `AdminUserTenant` 누락의 재발 방지책이다.

`entities/index.ts` 에 두는 이유: 엔티티를 새로 만들면 어차피 이 파일에 export 를 추가하므로, 배열이 바로 옆에 있으면 빠뜨리기 어렵다.

## 6. 설정 파일·문서

### 6.1 `.env.example`

```bash
# Database
# 형식: postgresql://user:password@host:port/dbname
# 관리형 DB 등 TLS 가 필요하면 ?sslmode=require 를 덧붙입니다.
DATABASE_URL=postgresql://authori:authori_password@localhost:5432/authori_db
# 쿼리 로깅. 미설정 시 개발환경에서만 켜집니다. 로그가 시끄러우면 false 로 끄세요.
DB_LOGGING=false
```

기존 `DB_HOST` 등 5줄은 제거한다. 예시 파일이 새 형식을 가리켜야 한다. **실제 자격증명은 넣지 않는다**(NFR-2).

### 6.2 `docker-compose.yml`

```yaml
environment:
  NODE_ENV: development
  DATABASE_URL: postgresql://authori:authori_password@postgres:5432/authori_db
```

compose 의 `postgres` 서비스 계정과 일치해야 한다.

### 6.3 `README.md`

환경변수 설명의 `DB_HOST, DB_PORT, ...` 항목을 `DATABASE_URL` 로 바꾸고 형식과 `sslmode` 를 덧붙인다.

## 7. 보안 검토

| 항목 | 판단 |
|---|---|
| 비밀번호 로그 노출 | 오류 메시지에 원본 URL 을 넣지 않는다(4.5). 폐기 경고에도 자격증명을 넣지 않는다. |
| 저장소 커밋 | `.env.example`·`docker-compose.yml` 은 로컬 개발용 예시 값만 쓴다. 사용자가 제시한 실제 접속 정보는 **어느 파일에도 넣지 않는다**. |
| `.env` 추적 | 이미 `.gitignore` 대상인지 확인한다. |
| SSL 기본값 | 명시가 없으면 `false`(비암호화)다. 현재 동작과 같아 회귀가 없다. TLS 가 필요한 환경은 `?sslmode=require` 를 명시한다. |

## 8. 테스트 설계

`database/database-url.spec.ts` (신규)

| 구분 | 케이스 |
|---|---|
| 정상 | 전체 지정 / `postgres://` 스킴 / 포트 생략 → 5432 / 비밀번호 없음 |
| 인코딩 | 비밀번호의 `%40`(`@`) · `%2F`(`/`) 디코딩, 사용자명 인코딩 |
| sslmode | 없음·`disable`→false / `require`·`no-verify`→검증 끔 / `verify-full`→검증 켬 |
| 오류 | URL 아님 / `mysql://` 스킴 / 호스트 없음 / 데이터베이스명 없음 |
| 오류 메시지 | **비밀번호가 메시지에 포함되지 않음** |
| 폴백 | `DATABASE_URL` 없고 `DB_*` 있음 → 그 값 사용 / 둘 다 없음 → 로컬 기본값 |
| 우선순위 | 둘 다 있으면 `DATABASE_URL` 승 |

## 9. 수동 검증 시나리오

1. `.env` 에 `DATABASE_URL` 만 두고 `bun run dev:api` → 기동, `/docs` 응답.
2. `bun run migration:run` → 같은 DB 에 접속.
3. `DATABASE_URL=not-a-url` → 기동이 명확한 오류로 실패하고 메시지에 비밀번호가 없다.
4. `DB_*` 만 둔 기존 `.env` → 기동하며 폐기 경고가 보인다.
5. 관리자 로그인 → `AdminUserTenant` 메타데이터 오류 없이 동작(5.4 검증).
