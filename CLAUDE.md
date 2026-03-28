# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Authori** — 멀티테넌트 OAuth2 인증 서비스. NestJS 백엔드 + Vue 3 프론트엔드 구조.

## Commands

### Backend (`backend/`)
```bash
bun run start:dev          # 개발 서버 (port 3000, watch 모드)
bun run build              # 프로덕션 빌드
bun run test               # 단위 테스트
bun run test:e2e           # E2E 테스트
bun run migration:generate -- src/database/migrations/MigrationName  # 마이그레이션 생성
bun run migration:run      # 마이그레이션 실행
bun run migration:revert   # 마이그레이션 롤백
```

### Frontend (`frontend/`)
```bash
bun run dev                # Vite 개발 서버 (port 5173)
bun run build              # 프로덕션 빌드
bun run preview            # 빌드 결과 미리보기
```

### Example server (`example/test_websvr/`)
```bash
bun run start:dev          # port 3001, Swagger at /docs
```

## Architecture

### Backend

**멀티테넌시**: 단일 DB 스키마 + `tenant_id` 컬럼으로 논리 격리. `TenantMiddleware`가 `/t/:tenantSlug/*path` 경로의 요청에서 slug → tenantId를 resolve하여 `req.tenantId`에 주입.

**모듈 구조**:
- `admin/` — 관리자 인증 (JWT, bcrypt), PLATFORM_ADMIN / TENANT_ADMIN 역할 분리
- `oauth/authorize/` — Authorization Code 흐름 시작. `PendingRequestStore`(인메모리)에 요청 상태 저장. GET 요청에서 `Accept: text/html` 감지 시 프론트엔드 `/login` 페이지로 리다이렉트
- `oauth/token/` — 토큰 발급: `authorization_code`, `refresh_token`, `client_credentials` grant 처리. RS256 JWT access token, opaque refresh token
- `oauth/keys/` — RSA 서명 키 관리 (DB 저장), JWKS 엔드포인트
- `oauth/revoke/` — 토큰 폐기
- `oauth/discovery/` — `.well-known/openid-configuration`
- `users/` — 테넌트 내 사용자 CRUD, UserProfile(JSONB)
- `tenants/` — 테넌트 및 TenantSettings CRUD
- `profile-schema/` — JSON Schema Draft-07 기반 사용자 프로필 스키마 버전 관리
- `common/audit/` — AuditService: 모든 중요 동작을 AuditLog 테이블에 기록
- `common/crypto/` — CryptoUtil: bcrypt hash/verify, PKCE S256 검증, sha256Hex

**트랜잭션 패턴**: 여러 엔티티를 함께 저장할 때 `dataSource.transaction(async (manager) => { ... })` 사용. 감사 로그(`auditService.record()`)는 반드시 트랜잭션 커밋 후 호출.

**AuditContext 패턴**: 컨트롤러에서 `{ actorId, actorType, ipAddress, userAgent, requestId }`를 구성하여 서비스 메서드에 `ctx` 파라미터로 전달. `...ctx` 스프레드로 AuditEventDto에 병합.

**관리자 인증**: `AdminJwtGuard` → JWT 검증 (`type: 'admin'` 클레임 확인). `PlatformAdminGuard` → `role === PLATFORM_ADMIN`. `TenantAdminGuard` → role이 TENANT_ADMIN이고 `tenantId` 일치 여부 확인.

**엔티티 목록**: Tenant, TenantSettings, User, UserProfile, ProfileSchemaVersion, OAuthClient, OAuthClientRedirectUri, AuthorizationCode, AccessToken, RefreshToken, Consent, SigningKey, AuditLog, AdminUser

### Frontend

**스택**: Vue 3 + Pinia + Vue Router 4 + Tailwind CSS v4 + axios

**레이아웃**: `meta.layout: 'auth'`이면 인증 레이아웃, 없으면 기본 관리자 레이아웃. `meta.public: true`이면 라우터 가드 우회.

**라우트 구조**:
- `/login` — 엔드유저 OAuth 로그인 폼 (`OAuthLoginView.vue`)
- `/admin/login`, `/admin/bootstrap` — 관리자 인증
- `/admin/tenants/*` — Platform Admin 전용 (테넌트 관리)
- `/admin/admins/*` — Platform Admin 전용 (관리자 계정 관리)
- `/admin/tenants/:tenantId/clients/*` — 클라이언트 관리
- `/admin/tenants/:tenantId/users/*` — 사용자 관리
- `/admin/tenants/:tenantId/schemas/*` — 프로필 스키마 관리
- `/admin/tenants/:tenantId/audit` — 감사 로그

**API 클라이언트**: `src/api/` 폴더의 각 모듈별 파일. 공통 axios 인스턴스(`src/api/http.ts`)에 401 인터셉터(→ `/admin/login`)가 달려 있음. **OAuth 엔드포인트 호출 시 별도 `axios.create()` 인스턴스를 사용해야 함** (401이 관리자 로그아웃을 트리거하지 않도록).

**프로필 폼**: `UserCreateView.vue`에서 활성 스키마를 조회하여 field type(string/number/boolean/enum)에 따라 동적 폼 렌더링.

### OAuth 플로우 요약

| 클라이언트 타입 | Grant | 특징 |
|---|---|---|
| `PUBLIC` | authorization_code + PKCE | code_challenge/code_verifier 필수, client_secret 없음 |
| `CONFIDENTIAL` | authorization_code | client_secret Basic Auth 또는 body 전달 |
| `CONFIDENTIAL` | client_credentials | 서버 간 M2M, 사용자 없음 |

Refresh token은 rotation + family 추적 방식. 재사용 감지 시 동일 family 전체 폐기.

### DB / 마이그레이션

TypeORM DataSource 설정: `backend/src/database/data-source.ts`. 엔티티: `src/database/entities/`. 마이그레이션: `src/database/migrations/`.

환경변수: `.env` 파일 (DB 접속 정보, JWT_SECRET, APP_ISSUER, LOGIN_PAGE_URL 등).

### Swagger

백엔드: 비프로덕션 환경에서 `http://localhost:3000/docs`

Example server: `http://localhost:3001/docs`
