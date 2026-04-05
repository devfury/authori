# Frontend 개발 산출물 문서

## 목적

이 문서는 `frontend/` 프로젝트의 개발 산출물(라우팅, 상태, API 계층, 화면 구성)을 정리해 신규 개발과 유지보수를 빠르게 지원한다.

## 기술 스택

- Framework: Vue 3 (Composition API)
- Build Tool: Vite
- Language: TypeScript
- 상태 관리: Pinia
- 라우팅: Vue Router 4
- HTTP: axios
- UI: Tailwind CSS v4
- 입력 검증: vee-validate + zod

## 디렉터리 구조

```text
frontend/
├─ src/
│  ├─ api/                 # 백엔드 연동 계층
│  ├─ components/shared/   # 공용 UI 컴포넌트
│  ├─ layouts/             # 인증/관리 레이아웃
│  ├─ router/              # 라우트 정의 및 가드
│  ├─ stores/              # auth/ui 스토어
│  └─ views/               # 플랫폼/테넌트/인증 화면
├─ public/
└─ package.json
```

## 라우팅 산출물

1. 공개 라우트
- `/login` (엔드유저 OAuth 로그인)
- `/admin/login`, `/admin/bootstrap`
- `/403`

2. 플랫폼 관리자 라우트
- `/admin/tenants*`
- `/admin/admins*`
- `meta.requiresPlatformAdmin` 기반 접근 제어

3. 테넌트 관리자 라우트
- `/admin/tenants/:tenantId/dashboard`
- `/clients`, `/users`, `/schemas`, `/audit`, `/external-auth`

4. 가드 규칙
- `meta.public`는 인증 우회
- 기본적으로 비인증 사용자는 `/admin/login`으로 리다이렉트
- 플랫폼 관리자 권한 부족 시 `/403` 이동

## API 계층 산출물

- 공통 HTTP 인스턴스: `src/api/http.ts`
- 도메인별 API 모듈:
  - `auth.ts`, `tenants.ts`, `admins.ts`
  - `clients.ts`, `users.ts`, `schemas.ts`, `audit.ts`, `external-auth.ts`
- OAuth 로그인 흐름은 관리자 인터셉터와 분리된 별도 인스턴스 사용

## UI/화면 산출물

- 플랫폼 화면: 테넌트/관리자 목록, 생성, 상세
- 테넌트 화면: 대시보드, OAuth 클라이언트, 사용자, 프로필 스키마, 감사 로그, 외부 인증 프로바이더
- 공통 컴포넌트: 사이드바, 헤더, 확인 다이얼로그, 상태 배지, 복사 필드 등

## 런타임/명령 산출물

- 개발 실행: `bun run dev`
- 빌드: `bun run build`
- 미리보기: `bun run preview`

## 운영 체크리스트

- 새 화면 추가 시:
  - 라우트 메타(`requiresAuth`, `requiresPlatformAdmin`, `public`) 검토
  - API 모듈 분리(`src/api/*.ts`) 원칙 준수
  - 목록 화면은 `docs/guidelines-list-view.md` 규칙 반영
- 권한별 접근 시나리오(Platform Admin / Tenant Admin) 수동 검증

## 관련 문서

- `docs/conventions.md`
- `docs/guidelines-list-view.md`
- `docs/design-login-branding.md`
- `docs/design-user-list-pagination.md`
- `docs/design-audit-log-pagination.md`
