# AGENTS.md

This file provides guidance to agents when working with code in this repository.

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

환경변수: `.env` 파일 (DB 접속 정보, JWT_SECRET, JWT_ISSUER, API_PREFIX, LOGIN_PAGE_URL 등).

> **issuer 규칙**: `JWT_ISSUER`는 외부에서 보이는 전체 base URL이며 `API_PREFIX`가 설정된 경우 그 prefix까지 포함해야 한다(예: `https://auth.example.com/api`). issuer 계산은 `common/tenant/issuer.util.ts`의 `resolveTenantIssuer()`로 단일화되어 있어 discovery 문서의 `issuer`/엔드포인트 URL과 access token의 `iss` 클레임이 항상 일치한다. 테넌트별 `issuer` 컬럼이 설정되면 그 값을 그대로 사용하고, 없으면 `{JWT_ISSUER}/t/{slug}`로 폴백한다.

### Swagger

백엔드: 비프로덕션 환경에서 `http://localhost:3000/docs`

Example server: `http://localhost:3001/docs`

## Documentation

`docs/`는 SDLC 단계별 산출물 저장소다. 작성 규칙·디렉터리 구조·파일명 규칙·추적성 규칙은 [docs/README.md](docs/README.md)를 따른다. 되돌리기 어려운 기술 결정은 `docs/adr/`에 기록한다(예: `0001-auth-strategy`, `0002-rbac-model`, `0003-data-standards`). 모든 문서는 한국어로 작성한다.

## Agent Operating Rules

### Edit Workflow
- 모든 에이전트는 파일을 편집하기 전에 현재 저장소에서 직접 작업하지 말고 별도 `git worktree`를 생성해 작업한다.
- worktree 브랜치는 작업 유형에 맞는 prefix와 목적이 드러나는 짧은 이름을 사용한다. prefix는 `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `style` 중 하나를 선택한다. 예: `feat/<task-slug>`, `fix/<task-slug>`, `docs/<task-slug>`.
- worktree 생성 전에는 `git status --short --branch`로 현재 브랜치와 미커밋 변경을 확인한다.
- 기존 사용자 변경사항을 되돌리거나 덮어쓰지 않는다. 충돌이 있으면 해당 변경을 보존한 상태로 해결한다.
- 편집, 테스트, 검증은 생성한 worktree 안에서 수행한다.
- 작업이 끝나면 변경사항을 커밋하고 원격 브랜치로 push한다.
- push 후 사용자에게 브랜치명, 커밋 해시, 실행한 검증 명령을 보고한다.

### Suggested Commands
- Create: `git worktree add .worktree/<task-slug> -b <prefix>/<task-slug>` (prefix: feat|fix|docs|chore|refactor|test|style)
- Work: `cd .worktree/<task-slug>`
- Verify: 프로젝트에 맞는 테스트, 린트, 빌드 명령 실행
- Commit: `git add <files> && git commit -m "<message>"`
- Push: `git push -u origin feat/<task-slug>`

## Development Process (개발 프로세스 표준)

모든 기능 개발 및 수정 작업은 아래 5단계 프로세스를 반드시 준수한다.

### 1단계 — 요구사항 수집 및 분석

사용자 요청을 받으면 구현 전에 먼저 아래를 수행한다.

- 요청 내용을 분석하고 브레인스토밍한다 (기능 범위, 영향 범위, 엣지 케이스, 대안).
- 불명확한 항목은 사용자에게 질문하여 확인한다.
- **요구사항정의서**를 작성한다: `docs/requirements/YYYY-MM-DD-<topic>-requirements.md`
  - 문제 정의와 목표, 기능/비기능 요구사항, 제외 범위, 성공 기준 포함.

문서 작성 후 커밋한 뒤 사용자에게 보고하여 승인을 받는다.

### 2단계 — 설계 및 계획 수립

요구사항이 확정되면 구현 전에 아래 두 문서를 작성한다.

- **개발설계서**: `docs/specs/YYYY-MM-DD-<topic>-spec.md`
  - 아키텍처, API, 데이터 모델, UI/UX 설계, 보안/성능 제약, 관련 요구사항 링크 포함.
- **개발계획서**: `docs/plans/YYYY-MM-DD-<topic>-plan.md`
  - Goal, 변경 파일 목록, **체크박스 작업 단계**, 검증 명령과 기대 결과, 리스크 포함.
  - 체크박스 형식 예시: `- [ ] API 엔드포인트 구현`

문서 작성 후 커밋한 뒤 사용자에게 보고하고 승인을 받은 뒤 구현을 시작한다.

### 3단계 — 단위 작업 구현

개발계획서의 체크박스 순서대로 작업한다.

- 각 단위 작업 완료 시 개발계획서의 해당 체크박스를 `- [x]`로 변경한다.
- **코드 변경과 계획서 체크박스 갱신을 같은 커밋에 포함한다.**
- 계획이 변경되면 코드만 바꾸지 말고 계획서도 함께 갱신한다.

### 4단계 — 빌드 및 테스트

모든 작업이 완료되면 아래를 순서대로 실행한다.

```
bun run lint
bun run typecheck
bun run test
bun run build
```

실패 시 원인을 수정하고 재실행한다. 통과 후 다음 단계로 진행한다.

### 5단계 — 개발완료보고서 작성 및 알림

- **개발완료보고서**를 작성한다: `docs/reviews/YYYY-MM-DD-<topic>-review.md`
  - 구현 요약, 완료된 작업 목록, 빌드/테스트 실행 결과, 남은 리스크 또는 후속 작업 포함.
  - 관련 요구사항정의서, 개발설계서, 개발계획서 링크 포함.
- 가능하면 텔레그램으로 완료 상황을 간략히 알린다 (브랜치명, 주요 변경 내용, 남은 작업).
  - **설치 확인**: 발송 전 `telegram-cli -V`로 사용 가능 여부를 확인한다. 버전이 출력되면 사용 가능하고, `command not found` 등으로 실패하면 알림 단계를 건너뛴다.
  - **발송**: `telegram-cli "<메시지>"` 한 줄로 보낸다. 따옴표 하나에 여러 줄 메시지를 담을 수 있으며, 종료 코드 `0`이면 전송 성공이다.
  - **메시지 형식**: 브랜치명 · 주요 변경 · 검증 결과 · 남은 작업을 4줄 내외로 요약한다.

    ```bash
    telegram-cli -V || echo "telegram-cli 미설치 — 알림 생략"
    telegram-cli "[ezPlatform] <작업명> 완료
    • 브랜치: <branch>
    • 변경: <핵심 변경 요약>
    • 검증: <lint/test/build 결과>
    • 남은 작업: <후속 또는 없음>"
    ```

### 문서-코드 추적성

```
요구사항정의서 (requirements/) → 개발설계서 (specs/) → 개발계획서 (plans/) → 개발완료보고서 (reviews/)
```

모든 문서는 이전 단계 문서를 링크하여 추적성을 유지한다.

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
