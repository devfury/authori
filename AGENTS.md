# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Project Overview

**Authori** — 멀티테넌트 OAuth2 인증 서비스. NestJS 백엔드(`apps/api`) + Vue 3 프론트엔드(`apps/web`) 구조.

**모노레포**: Bun 워크스페이스 + Turborepo. 루트 `package.json`의 `workspaces: ["apps/*"]`로 `@authori/api`, `@authori/web` 두 워크스페이스를 관리한다. 의존성은 루트에서 `bun install` 한 번으로 설치되며 단일 `bun.lock`을 사용한다. 태스크 파이프라인은 `turbo.json`에 정의된다.

## Commands

### 루트 (Turborepo, 전체 앱 대상)
```bash
bun install                # 전체 워크스페이스 의존성 설치 (루트에서 한 번)
bun run dev                # api + web 개발 서버 동시 실행
bun run build              # 전체 빌드
bun run lint               # 전체 lint
bun run typecheck          # 전체 타입 체크
bun run test               # 전체 단위 테스트
bun run dev:api / dev:web  # 특정 앱 개발 서버만 (build:api / build:web 도 동일 패턴)
```

### API (`apps/api/`)
```bash
cd apps/api
bun run dev                # 개발 서버 (port 3000, watch 모드, = nest start --watch)
bun run build              # 프로덕션 빌드
bun run test               # 단위 테스트
bun run test:e2e           # E2E 테스트
bun run migration:generate -- src/database/migrations/MigrationName  # 마이그레이션 생성
bun run migration:run      # 마이그레이션 실행
bun run migration:revert   # 마이그레이션 롤백
```

### Web (`apps/web/`)
```bash
cd apps/web
bun run dev                # Vite 개발 서버 (port 5173)
bun run build              # 프로덕션 빌드
bun run preview            # 빌드 결과 미리보기
```

### Example server (`example/test_websvr/`)
```bash
bun run start:dev          # port 3001, Swagger at /docs
```

### Docker 이미지 빌드
```bash
./scripts/build.sh                 # web + api 이미지 모두 빌드 (build context = 저장소 루트)
./scripts/build.sh api             # api 만 (apps/api/Dockerfile)
./scripts/build.sh web             # web 만 (apps/web/Dockerfile)
# Windows: scripts/build.ps1 / scripts/build.bat 동일 인자
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

TypeORM DataSource 설정: `apps/api/src/database/data-source.ts`. 엔티티: `apps/api/src/database/entities/`. 마이그레이션: `apps/api/src/database/migrations/`.

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
- push 후 검증이 모두 통과했으면 `develop`에 병합하고 원격으로 push한다 (절차는 5단계 참조).
- 병합까지 마친 뒤 사용자에게 브랜치명, 커밋 해시, 병합 결과, 실행한 검증 명령을 보고한다.

### Suggested Commands
- Create: `git worktree add .worktree/<task-slug> -b <prefix>/<task-slug>` (prefix: feat|fix|docs|chore|refactor|test|style)
- Work: `cd .worktree/<task-slug>`
- Verify: 프로젝트에 맞는 테스트, 린트, 빌드 명령 실행
- Commit: `git add <files> && git commit -m "<message>"`
- Push: `git push -u origin feat/<task-slug>`
- Sync: `git fetch origin develop && git merge origin/develop` (작업 브랜치에서 충돌 선해소)
- Merge: `git checkout develop && git pull --ff-only origin develop && git merge --no-ff feat/<task-slug>`
- Publish: `git push origin develop`

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

### 5단계 — 개발완료보고서 작성 · develop 병합 · 알림

**순서를 지킨다: 보고서 작성 → develop 병합 및 push → 알림 발송.** 알림은 병합 결과를 담아야 하므로 반드시 마지막이다.

#### 5-1. 개발완료보고서

- **개발완료보고서**를 작성한다: `docs/reviews/YYYY-MM-DD-<topic>-review.md`
  - 구현 요약, 완료된 작업 목록, 빌드/테스트 실행 결과, 남은 리스크 또는 후속 작업 포함.
  - 관련 요구사항정의서, 개발설계서, 개발계획서 링크 포함.

#### 5-2. develop 병합 및 push

4단계 검증이 **모두 통과한 경우에만** 수행한다.

- 작업 브랜치의 모든 변경을 커밋하고 원격에 push한다.
- 작업 브랜치에서 최신 `develop`을 먼저 병합해 충돌을 해소한다. 충돌 해소는 `develop`이 아니라 작업 브랜치에서 한다.
- 병합으로 코드가 바뀌었으면 4단계 검증을 다시 실행한다.
- `develop`으로 옮겨 작업 브랜치를 `--no-ff`로 병합하고 push한다.

```bash
# 작업 worktree에서
git push -u origin <branch>
git fetch origin develop && git merge origin/develop   # 충돌은 여기서 해소
bun run lint && bun run typecheck && bun run test && bun run build   # 병합으로 코드가 바뀌었으면 재검증

# 메인 worktree에서
git checkout develop && git pull --ff-only origin develop
git merge --no-ff <branch> -m "Merge branch '<branch>' into develop"
git push origin develop
```

**병합하지 말아야 하는 경우** — 아래에 해당하면 병합을 중단하고 사용자에게 판단을 요청한다.

- 4단계 검증 중 하나라도 실패했을 때 (기존 저장소 baseline 오류는 예외이나, 신규 유입이 없음을 확인하고 보고서에 명시한다).
- 충돌을 안전하게 해소할 수 없거나 다른 사람의 변경을 덮어써야 할 때.
- push 권한이나 자격증명이 없어 `develop` push가 실패할 때.

#### 5-3. 알림

`develop` push가 성공한 뒤 개인 알림 채널로 완료 상황을 간략히 알린다 (브랜치명, 주요 변경 내용, 검증 결과, 병합 결과, 남은 작업).

- **1순위 — ezaria**: `ezaria-personal-notify` 스킬이 있으면 해당 스킬의 절차에 따라 개인 채팅방으로 발송한다.
- **2순위 — 텔레그램**: `ezaria-personal-notify` 스킬이 없을 때만 `telegram-cli -V`로 사용 가능 여부를 확인한다. 버전이 출력되면 `telegram-cli "<메시지>"` 한 줄로 발송한다.
- 두 수단을 모두 사용할 수 없으면 알림 단계를 건너뛴다.
- 병합을 건너뛰었거나 실패했으면 알림을 생략하지 말고 **그 사실과 이유를 본문에 명시**해 발송한다.
- **메시지 형식**: 브랜치명 · 주요 변경 · 검증 결과 · 병합 결과 · 남은 작업을 5줄 내외로 요약한다.

```bash
# ezaria-personal-notify 스킬이 없을 때만 실행
telegram-cli -V || echo "telegram-cli 미설치 — 알림 생략"
telegram-cli "[Authori] <작업명> 완료
• 브랜치: <branch>
• 변경: <핵심 변경 요약>
• 검증: <lint/test/build 결과>
• 병합: develop 병합 및 push 완료 (<merge commit>) / 또는 미수행 사유
• 남은 작업: <후속 또는 없음>"
```

### 문서-코드 추적성

```
요구사항정의서 (requirements/) → 개발설계서 (specs/) → 개발계획서 (plans/) → 개발완료보고서 (reviews/)
```

모든 문서는 이전 단계 문서를 링크하여 추적성을 유지한다.

### 릴리스 파이프라인 (CI/CD)

버전을 내보내는 일은 아래 12단계를 **이 순서대로** 거친다. **승인(1 · 7 · 10)만 사용자가 하고, 나머지는 에이전트가 이어서 진행한다.**
승인 단계에 닿으면 그때까지의 결과를 보고하고 멈춘다. 어느 단계든 실패하면 다음 단계로 가지 않고 오류 원문과 함께 보고한다.

| # | 단계 | 누가 | 방법 |
| --- | --- | --- | --- |
| 1 | **버전 업데이트 승인** | 사용자 | "X.Y.Z 버전으로 올려줘" · "X.Y.Z 릴리스 진행해줘" 가 곧 승인이다 |
| 2 | 업데이트 노트 작성 | 에이전트 | [릴리스 노트](#릴리스-노트-태그마다-한-번) — 태그 전이므로 `Status: Draft` |
| 3 | 패키지 버전 bump | 에이전트 | [버전 상향](#버전-상향-chore-bump-version-to-xyz) |
| 4 | `main` 병합 · push | 에이전트 | 아래 「`main` 병합」 |
| 5 | 이미지 빌드 | 에이전트 | `jenkins-cicd` 스킬 `run authori-build-images BUILD_TAG=X.Y.Z` |
| 6 | git 태그 · 노트 확정 | 에이전트 | 아래 「git 태그」 「노트 확정」 — 빌드가 `SUCCESS` 일 때만 |
| 7 | **개발 서버 배포 승인** | 사용자 | "개발 배포 진행" 등. 8 · 9 를 함께 승인한 것이다 |
| 8 | 개발 서버 마이그레이션 | 에이전트 | 아래 「마이그레이션」 — `dev` |
| 9 | 개발 서버 배포 | 에이전트 | `jenkins-cicd` 스킬 `run authori-deploy-dev DEPLOY_TAG=X.Y.Z` |
| 10 | **운영 서버 배포 승인** | 사용자 | "운영 배포 진행" 등. 11 · 12 를 함께 승인한 것이다 |
| 11 | 운영 서버 마이그레이션 | 에이전트 | 같은 절차 — `prd`. 백업 확인은 아래 |
| 12 | 운영 서버 배포 | 에이전트 | `jenkins-cicd` 스킬 `run authori-deploy-prd DEPLOY_TAG=X.Y.Z` |

- **승인은 그 구간에만 유효하다.** 1 의 승인으로 7 · 10 을 넘지 않고, 7 의 승인으로 10 을 넘지 않는다. 사용자가 한 번에 "운영까지 진행" 이라고 명시하면 그 말대로 한다.
- **Jenkins job (5 · 9 · 12).** `jenkins.ezcaretech.com` 의 job 세 개이고 정의는 Jenkins 에 직접 적혀 있다(저장소에 `Jenkinsfile` 이 없다). 세 job 모두 동시 실행이 꺼져 있다.

  | job | 파라미터 | 하는 일 |
  | --- | --- | --- |
  | `authori-build-images` | `BUILD_TAG` | **`main` 브랜치 HEAD** 를 클론 → `registry.ezcaretech.com/authori/{api,web}:<tag>` 와 `:latest` 로 build · push. **git 태그는 올리지 않는다** |
  | `authori-deploy-dev` | `DEPLOY_TAG` | GitOps 저장소 `ezspace-dev-k8s` 의 `authori-dev/kustomization.yaml` `newTag` 수정 · push → 개발 서버에 적용 |
  | `authori-deploy-prd` | `DEPLOY_TAG` | 같은 방식으로 운영 서버에 적용 |

  실행 · 조회는 `jenkins-cicd` 스킬로 한다. 스킬은 job 이름을 갖고 있지 않으므로 **이 표의 job 이름과 파라미터 이름을 그대로 넘긴다**(`status <job>...` · `run <job> <PARAM>=X.Y.Z` · `wait` · `log`).
  태그는 `X.Y.Z` 형태만 넣는다. 파라미터 기본값이 `latest` 이지만 **`latest` 로 빌드 · 배포하지 않는다**(무엇이 배포됐는지 추적할 수 없다). `BUSY` · `LOGIN_REQUIRED` · `STILL_RUNNING` 은 스킬의 규칙대로 다시 실행하지 않고 보고한다.
  빌드는 `develop` 에만 있는 변경을 담지 않는다. 배포 job 은 이미지가 레지스트리에 있는지 확인하지 않으므로 빌드가 `SUCCESS` 인 태그만 배포한다. 배포 job 은 DB 를 건드리지 않는다.
- **`main` 병합 (4).** `main` 에만 있는 변경이 없는지 — `git rev-list --no-merges origin/develop..origin/main` 이 비어 있는지 — 확인하고, 아니면 멈추고 보고한다.
  `git merge-base --is-ancestor` 로 보지 않는다. 릴리스마다 `main` 에 남기는 병합 커밋(`Merge branch 'develop'`)은 `develop` 으로 돌아오지 않아 그 검사는 매번 걸린다.
  **fast-forward 로 올리지 않는다** — 릴리스마다 병합 커밋을 남긴다. `main` 은 체크아웃하지 않고 분리 워크트리에서 병합한다.

  ```bash
  git fetch -q origin
  git worktree add --detach .worktree/main-merge origin/main
  git -C .worktree/main-merge merge --no-ff origin/develop -m "Merge branch 'develop'"
  git -C .worktree/main-merge push origin HEAD:refs/heads/main
  git worktree remove .worktree/main-merge
  ```

  `main` 에 강제 push 하지 않는다. 거부되면 멈추고 보고한다.
- **git 태그 (6).** Jenkins 가 태그를 올리지 않으므로 빌드가 `SUCCESS` 로 끝난 뒤 에이전트가 올린다. 빌드에 들어간 커밋(= 4 에서 push 한 `main` 병합 커밋)에 annotated 태그를 단다. 이름은 `v` 없이 `X.Y.Z` 다.

  ```bash
  git fetch -q origin --tags
  git rev-parse origin/main                 # 4 에서 push 한 병합 커밋과 같아야 한다. 다르면 멈추고 보고한다
  git tag -a X.Y.Z origin/main -m "X.Y.Z"
  git push origin X.Y.Z
  ```

  같은 이름의 태그가 이미 있으면 옮기거나 덮어쓰지 않고 보고한다. 빌드가 실패했으면 태그를 올리지 않는다.
- **노트 확정 (6).** 태그를 올린 뒤 2 에서 쓴 노트의 `Status` 를 `Approved` 로, `Related` 에 태그 해시를 채우고 인덱스 `Updated` 를 맞춰 `develop` 에 병합한다. 내용은 다시 쓰지 않는다.
  노트 근거 범위(`<직전 태그>..origin/develop`)와 실제 태그 사이에 끼어든 커밋이 있으면 정정으로 보탠다. 이 커밋은 `develop` 에만 들어가고 다음 릴리스 때 `main` 으로 간다.
- **마이그레이션 (8 · 11).** `apps/api` 에서 CLI 로 실행한다. 루트의 `.env.development.local`(dev) · `.env.production.local`(prd)을 읽어 해당 DB 에 직접 붙는다.

  ```bash
  cd apps/api
  bun run migration:show:dev && bun run migration:run:dev   # 개발 DB
  bun run migration:show:prd && bun run migration:run:prd   # 운영 DB
  ```

  먼저 `migration:show` 로 무엇이 적용될지 본다. 대기 중인 마이그레이션이 없으면 없다고 보고하고 바로 배포로 간다. 순서는 **마이그레이션 → 배포**이고, 마이그레이션이 실패하면 배포하지 않는다.
  체크아웃된 커밋의 마이그레이션이 그대로 적용된다 — `git diff --stat X.Y.Z HEAD -- apps/api/src/database/migrations` 가 비어 있지 않으면(배포할 태그보다 앞선 마이그레이션이 섞여 있으면) 실행하지 않고 알린다.
  운영(11)은 대기 중인 마이그레이션에 `DROP` · `DELETE` · 타입 변경이 있으면 승인을 받았더라도 **멈추고** 해당 SQL 을 인용해 백업 여부를 확인받는다([DB / 마이그레이션](#db--마이그레이션)). 임의로 `migration:revert` 하지 않는다.
- **알림.** 승인 단계(7 · 10)에서 멈출 때와 12 가 끝났을 때 [5-3](#5-3-알림) 으로 알린다.
- **되돌리기.** 배포 뒤 문제가 생기면 임의로 되돌리지 않고 보고한다. 직전 배포 태그는 `jenkins-cicd` 스킬 `status` 에서 해당 배포 job 의 최신 `SUCCESS` 줄이다.

### 버전 상향 (`chore: bump version to X.Y.Z`)

[릴리스 파이프라인](#릴리스-파이프라인-cicd) 3단계다. **버전 파일만 고치고 끝내지 않는다.** 아래를 빠짐없이 처리한다.
작업은 별도 워크트리(`chore/bump-X.Y.Z`)에서 한다. 릴리스 노트는 이 작업 직전(2단계)에 따로 쓴다.
사용자가 "버전만 올려줘" 처럼 범위를 좁히면 이 절만 하고 멈춘다.

1. **현재 상태 확인.** 루트 · `apps/api` · `apps/web` 의 `version` 이 같은지, 최신 git 태그(`git tag --sort=-creatordate | head`)를 본다.
   요청 버전이 현재 버전의 바로 다음(patch · minor · major 중 하나)이 아니거나 세 값이 서로 다르면 **임의로 맞추지 말고 사용자에게 알린다.**
2. **버전 문자열을 바꾼다 — `scripts/bump-version.sh bump X.Y.Z`** (Windows: `scripts/bump-version.ps1`).
   - 스크립트가 `package.json` · `apps/api/package.json` · `apps/web/package.json` 의 `"version"` 3줄을 바꾸고 `bun install` 뒤 `chore: bump version to X.Y.Z` 로 커밋까지 한다.
   - `git show --stat HEAD` 로 위 3줄만 바뀌었는지 확인한다. 의존성 변경이 섞여 `bun.lock` 이 함께 바뀌었으면 멈추고 알린다.
   - `bun.lock` 의 워크스페이스 `"version"` 은 `bun install` 이 갱신하지 않아 옛 값(1.3.1)으로 남아 있다. 정상이며 **손으로 맞추지 않는다.**
   - `example/*` 는 **별도 버전이라 건드리지 않는다.**
3. **락파일 일치 확인.** `bun install --frozen-lockfile --dry-run` 이 `lockfile had changes` 오류 없이 끝나야 한다.
4. **검증.** 버전 문자열만 바뀐 변경이므로 `lint` · `typecheck` · `test` · `build` 는 생략할 수 있으나, **생략했다고 보고에 밝힌다.** 3번은 생략하지 않는다.
5. **병합 · 정리.** [5-2](#5-2-develop-병합-및-push) 대로 `--no-ff` 로 `develop` 에 병합해 push 하고, 워크트리를 정리한 뒤 파이프라인 4단계로 넘어간다. 알림은 파이프라인의 알림 시점에 함께 보낸다.
   Windows 에서 워크트리 삭제가 `Permission denied` 로 실패하면 `git worktree prune` 뒤 남은 폴더를 지운다.

**하지 않는 것.** 빌드 전에 git 태그를 만들지 않는다 — 태그는 이미지 빌드가 성공한 뒤 `main` 병합 커밋에 단다(파이프라인 6단계). `chore/bump-X.Y.Z` 를 `main` 에 직접 병합하지 않는다(`main` 에는 `develop` 을 병합한다).

### 릴리스 노트 (태그마다 한 번)

**태그 하나에 노트 파일 하나, 그리고 한 번만 쓴다.** 이미 쓴 노트를 다음 버전을 만들 때 다시 고치지 않는다(오탈자 · 사실 오류 정정만 허용하고, 정정은 사유를 한 줄 남긴다).

- **위치.** `docs/releases/YYYY-MM-DD-<버전>-release-notes.md` (날짜는 빌드 · 태그 예정일. 실제 태그 날짜가 다르면 확정할 때 파일명을 맞춘다). 모든 버전의 목록과 구간 개요는 `docs/releases/README.md` 인덱스에 둔다.
  `docs/releases/` 와 인덱스는 아직 없다 — 첫 노트를 쓸 때 함께 만든다. 그 이전 버전(1.4.0 까지)의 노트는 요청받았을 때만 소급해 쓴다.
- **시점.** [릴리스 파이프라인](#릴리스-파이프라인-cicd) 2단계, 버전 bump · 태그 **전**에 쓴다. 근거 범위는 `<직전 태그>..origin/develop` 이고 `Status: Draft`, `Related` 의 태그 해시는 `(빌드 후 확정)` 으로 둔다.
  태그가 올라가면(6단계) `Status` 와 `Related`(태그 해시)만 고쳐 확정한다. 내용을 다시 쓰지 않는다.
  파이프라인을 거치지 않고 이미 태그가 올라간 버전은 태그를 근거로 바로 `Approved` 로 쓴다.
- **머리말.** [docs/README.md](docs/README.md) 의 머리말 형식을 따른다 — `Status` · `Owner` · `Created` · `Updated` · `Related`(인덱스 · git 태그 `X`(해시) · 직전 노트 링크). 다음 노트 링크는 넣지 않는다(쓴 뒤에 고치게 된다).
- **본문.** `## 변경 내용` 아래 **신규 · 개선 · 수정 · 운영** 항목이다. 근거는 `git log --no-merges <직전 태그>..<태그>` 이고 문서 · 테스트만 바뀐 커밋은 뺀다.
  **마이그레이션 · 설정 · 환경변수 변경이 없으면 `**운영** … 없음` 이라고 적는다** — 운영자가 가장 먼저 찾는 줄이다. 아직 검증하지 못한 것은 그대로 적는다.
- **인덱스.** 매번 고치는 곳은 `docs/releases/README.md` 뿐이다 — 해당 구간(`## X.Y.x`)의 목록에 한 줄 추가, 「한눈에 보기」 표의 태그 수 · 주요 흐름, 구간 개요 문단. 갱신일(`Updated`)도 바꾼다.
- **절차.** 별도 워크트리(`docs/release-notes-X.Y.Z`)에서 쓰고 `develop` 에 병합한다. 파이프라인 안에서는 알림을 파이프라인 알림 시점에 함께 보낸다. 문서만 바뀌므로 `lint` · `typecheck` · `test` · `build` 는 생략할 수 있고 생략했다고 보고에 밝힌다.

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
