# Authori

멀티테넌트 OAuth2 인증 서비스다. NestJS 백엔드와 Vue 3 프론트엔드로 구성되어 있으며, 테넌트별 사용자/클라이언트/스키마/감사 로그를 관리할 수 있다.

## 구성

- `backend/` — NestJS + TypeORM 기반 OAuth2/OIDC 서버
- `frontend/` — Vue 3 + Pinia + Vue Router 기반 관리자 UI / 로그인 UI
- `docs/` — 설계 문서, 화면 규칙, 코딩 컨벤션
- `example/` — 연동 테스트용 예제 앱과 외부 인증 프로바이더 예제 서버

## 주요 기능

- 멀티테넌트 구조 (`tenant_id` 기반 논리 격리)
- OAuth2 Authorization Code / PKCE / Client Credentials 지원
- RS256 JWT access token + opaque refresh token
- refresh token rotation + family 추적
- JWKS / OIDC discovery 지원
- 관리자 인증 및 권한 분리
  - `PLATFORM_ADMIN`
  - `TENANT_ADMIN`
- 사용자 / OAuth 클라이언트 / 프로필 스키마 / 감사 로그 관리 UI
- OAuth 로그인 브랜딩 및 외부 인증 프로바이더 연동 예제 포함

## 빠른 시작

### 1. 환경 변수 준비

백엔드:

```bash
cp backend/.env.example backend/.env
```

프론트엔드:

```bash
cp frontend/.env.example frontend/.env
```

기본값:

- Backend API: `http://localhost:3000`
- Frontend: `http://localhost:5173`
- Frontend API base URL: `VITE_API_BASE_URL=http://localhost:3000`

### 2. 의존성 설치

이 저장소는 `bun` 기준으로 명령이 정리되어 있다.

```bash
cd backend && bun install
cd ../frontend && bun install
```

예제 앱도 필요하면 각 디렉터리에서 `bun install`을 실행한다.

## 실행 방법

### Backend (`backend/`)

```bash
bun run start:dev
```

- 개발 서버: `http://localhost:3000`
- Swagger: `http://localhost:3000/docs` (비프로덕션 환경)

자주 쓰는 명령:

```bash
bun run build
bun run test
bun run test:e2e
bun run migration:generate -- src/database/migrations/MigrationName
bun run migration:run
bun run migration:revert
```

### Frontend (`frontend/`)

```bash
bun run dev
```

- 개발 서버: `http://localhost:5173`

자주 쓰는 명령:

```bash
bun run build
bun run preview
```

## 예제 앱 / 테스트 앱

`example/` 아래에 연동 검증용 앱들이 있다.

- `example/vite-testapp/` — Vite 기반 테스트 앱
- `example/nest-testapp/` — Nest 기반 테스트 앱
- `example/deeplink-testapp/` — 딥링크 테스트 앱
- `example/tauri-testapp/` — Tauri 테스트 앱
- `example/ext-auth-provider/` — 외부 인증 프로바이더 예제 서버

외부 인증 프로바이더 예제 서버 실행:

```bash
cd example/ext-auth-provider
bun install
bun run start:dev
```

- 기본 포트: `3002`
- Swagger: `http://localhost:3002/docs`

## 아키텍처 요약

### Backend

- 단일 DB 스키마 + `tenant_id` 컬럼으로 테넌트 격리
- `TenantMiddleware`가 `/t/:tenantSlug/*path` 요청에서 tenant를 resolve
- 주요 모듈:
  - `admin/` — 관리자 인증 및 권한 관리
  - `oauth/authorize/` — Authorization Code 흐름 시작
  - `oauth/token/` — 토큰 발급
  - `oauth/keys/` — RSA 서명 키 / JWKS
  - `oauth/revoke/` — 토큰 폐기
  - `oauth/discovery/` — OIDC discovery
  - `users/` — 사용자 관리
  - `tenants/` — 테넌트 관리
  - `profile-schema/` — 사용자 프로필 스키마 버전 관리
  - `common/audit/` — 감사 로그
  - `common/crypto/` — bcrypt / PKCE / hashing 유틸

주요 패턴:

- 여러 엔티티 저장 시 `dataSource.transaction(...)` 사용
- 감사 로그는 트랜잭션 커밋 후 기록
- 컨트롤러에서 `AuditContext`를 구성해 서비스로 전달

### Frontend

- Vue 3 + Pinia + Vue Router 4 + Tailwind CSS v4 + axios
- `meta.layout: 'auth'` 라우트는 인증 레이아웃 사용
- `meta.public: true` 라우트는 인증 가드 우회
- 주요 화면:
  - `/login` — 엔드유저 OAuth 로그인
  - `/admin/login`, `/admin/bootstrap` — 관리자 인증
  - `/admin/tenants/*` — Platform Admin 전용 테넌트 관리
  - `/admin/admins/*` — 관리자 계정 관리
  - `/admin/tenants/:tenantId/clients/*` — OAuth 클라이언트 관리
  - `/admin/tenants/:tenantId/users/*` — 사용자 관리
  - `/admin/tenants/:tenantId/schemas/*` — 프로필 스키마 관리
  - `/admin/tenants/:tenantId/audit` — 감사 로그

중요:

- 일반 API 호출은 `frontend/src/api/http.ts`의 공통 axios 인스턴스를 사용
- OAuth 로그인 관련 엔드포인트는 별도 axios 인스턴스를 사용해야 함
  - 관리자 401 인터셉터와 분리하기 위함

## OAuth 플로우 요약

| 클라이언트 타입 | Grant | 특징 |
|---|---|---|
| `PUBLIC` | authorization_code + PKCE | `code_challenge` / `code_verifier` 필수 |
| `CONFIDENTIAL` | authorization_code | `client_secret` 사용 가능 |
| `CONFIDENTIAL` | client_credentials | 서버 간 M2M |

Refresh token은 rotation + family 추적 방식이며, 재사용 감지 시 동일 family 전체를 폐기한다.

## 환경 변수

### Backend (`backend/.env.example`)

주요 항목:

- `PORT`
- `NODE_ENV`
- `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`
- `JWT_ISSUER`
- `JWT_ACCESS_TOKEN_EXPIRY`
- `JWT_REFRESH_TOKEN_EXPIRY`
- `PLATFORM_ADMIN_SECRET`
- `JWT_ADMIN_SECRET`
- `JWT_ADMIN_EXPIRY`
- `CORS_ORIGINS`

### Frontend (`frontend/.env.example`)

- `VITE_API_BASE_URL`

## 문서

주요 문서:

- `docs/conventions.md` — 저장소 코딩 컨벤션
- `docs/guidelines-list-view.md` — 목록 화면 개발 규칙
- `docs/PLAN.md` — 전체 계획
- `docs/design-login-branding.md` — 로그인 브랜딩 설계
- `docs/design-external-auth-provider.md` — 외부 인증 프로바이더 설계
- `docs/design-external-auth-provider-example-server.md` — 예제 외부 인증 서버 설계
- `docs/design-user-list-pagination.md` — 사용자 목록 화면 설계
- `docs/design-audit-log-pagination.md` — 감사 로그 화면 설계
- `docs/design-public-client-enhancements.md` — public client 개선 설계
- `docs/backend-development-artifacts.md` — backend 개발 산출물 정리
- `docs/frontend-development-artifacts.md` — frontend 개발 산출물 정리

## 개발 팁

- 새 목록 화면은 `docs/guidelines-list-view.md`를 먼저 확인하는 것이 좋다.
- 새 코드 작성 전 `docs/conventions.md`를 기준으로 기존 패턴을 맞춘다.
- 백엔드 변경 후에는 `bun run build`, 프론트엔드 변경 후에는 `bun run build`로 최소 검증을 권장한다.

## 참고

- 저장소 내부 작업 가이드: `CLAUDE.md`
