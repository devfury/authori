# 요구사항정의서 — 테넌트 관리자 로그인 실패(401 강제 로그아웃) 수정

- 작성일: 2026-09-23
- 작성자: Jinho Lee
- 상태: 확정
- 유형: 결함 수정 (인가 · 관리 UI)

## 1. 문제 정의

TENANT_ADMIN 계정으로 관리 콘솔에 로그인하면 **로그인 직후 다시 로그인 화면으로 튕긴다.** 서버 로그에는 오류가 남지 않고, 브라우저 콘솔에만 `GET /api/admin/tenants/{tenantId} 401` 이 찍힌다.

### 1.1 근본 원인

인증 자체는 성공한다. 실패하는 것은 **로그인 직후 레이아웃이 보내는 부가 요청 한 건**이며, 그 401이 전역 인터셉터를 통해 방금 받은 세션을 스스로 파기한다.

| # | 위치 | 동작 |
|---|---|---|
| 1 | `apps/web/src/stores/auth.store.ts:41` | 로그인 성공. TENANT_ADMIN 을 `/admin/tenants/:tenantId/dashboard` 로 이동 |
| 2 | `apps/web/src/layouts/AdminLayout.vue:25` | 사이드바 테넌트명 표시를 위해 `GET /admin/tenants/:tenantId` 호출 |
| 3 | `apps/api/src/tenants/tenants.controller.ts:26` | 이 컨트롤러는 **클래스 전체**가 `@UseGuards(PlatformAdminGuard)` — TENANT_ADMIN 통과 불가 |
| 4 | `apps/api/src/admin/guards/platform-admin.guard.ts:14` | 권한 부족인데 403이 아니라 **`UnauthorizedException`(401)** 을 던짐 |
| 5 | `apps/web/src/api/http.ts:21` | 401 응답 인터셉터가 `authStore.logout()` 실행 → 토큰 삭제 → `/admin/login` |

`AdminLayout` 의 `try/catch` 는 테넌트명 표시 실패만 삼킬 뿐, 인터셉터의 로그아웃은 이미 실행된 뒤다.

### 1.2 설계 의도와의 불일치

`tenants.controller.ts` 를 제외한 모든 테넌트 범위 컨트롤러(`users`, `clients`, `scopes`, `rbac`, `schemas`, `audit`, `external-auth`)는 `TenantAdminGuard` 를 사용한다. 또한 라우터(`/admin/tenants/:tenantId/settings`)와 사이드바("테넌트 설정" 메뉴)는 **이미 테넌트 관리자에게 테넌트 설정 화면을 노출하고 있다.** 즉 화면·라우팅은 테넌트 관리자의 자기 테넌트 조회·설정을 전제하는데 API 인가만 플랫폼 관리자 전용으로 남아 있다.

### 1.3 부수 영향

- `/admin/tenants/:tenantId/settings`(테넌트 설정) 화면은 테넌트 관리자에게 전혀 동작하지 않는다. 진입 시 `findOne` 401 → 강제 로그아웃.
- 401 을 인가 실패에도 사용하는 구조 탓에, 앞으로 **권한이 없는 화면에 접근하기만 해도 세션이 파기되는** 동일 패턴이 재발할 수 있다.

## 2. 목표

1. TENANT_ADMIN 이 로그인 후 대시보드에 정상 진입하고, 사이드바에 테넌트명이 표시된다.
2. TENANT_ADMIN 이 **자기 테넌트에 한해** 테넌트 정보를 조회하고 설정을 수정할 수 있다.
3. 인가 실패(권한 부족)가 인증 실패(401)와 구분되어, 권한 부족이 강제 로그아웃을 유발하지 않는다.

## 3. 기능 요구사항

| ID | 요구사항 |
|---|---|
| FR-1 | `GET /admin/tenants/:tenantId` 를 PLATFORM_ADMIN 과 **해당 테넌트의** TENANT_ADMIN 이 호출할 수 있다. |
| FR-2 | `PATCH /admin/tenants/:tenantId` 를 PLATFORM_ADMIN 과 **해당 테넌트의** TENANT_ADMIN 이 호출할 수 있다. |
| FR-3 | TENANT_ADMIN 의 `PATCH` 는 `name` 과 `settings` 만 허용한다. `status`(테넌트 활성/비활성)와 `issuer`(토큰 발급자) 변경 시도는 **403으로 거부**한다. 두 값은 플랫폼 차원의 생명주기·신뢰 경계 설정이다. |
| FR-4 | `POST /admin/tenants/:tenantId/notify-test`(ezAria 알림 테스트)를 해당 테넌트의 TENANT_ADMIN 이 호출할 수 있다. 알림 설정 자체가 테넌트 설정 화면에 있으므로 검증 수단도 함께 제공한다. |
| FR-5 | 테넌트 **생성**(`POST`), **목록 조회**(`GET /admin/tenants`), **영구 삭제**(`DELETE`)는 PLATFORM_ADMIN 전용을 유지한다. |
| FR-6 | 다른 테넌트의 ID 로 FR-1~FR-4 를 호출하면 TENANT_ADMIN 은 거부된다(테넌트 경계 격리). |
| FR-7 | `PlatformAdminGuard` · `TenantAdminGuard` 의 **권한 부족**은 `ForbiddenException`(403)으로 응답한다. 토큰 부재·위조·만료 등 **인증 실패**는 401 을 유지한다. |
| FR-8 | 로그인한 TENANT_ADMIN 이 권한 없는 API 를 호출해도 세션이 파기되지 않는다(403은 프런트 로그아웃 인터셉터를 발동시키지 않는다). |

## 4. 비기능 요구사항

| ID | 요구사항 |
|---|---|
| NFR-1 | DB 스키마 변경 없음. 마이그레이션 없음. |
| NFR-2 | 프런트엔드 API 경로·요청 형태는 변경하지 않는다(`GET /admin/tenants/{id}` 그대로). |
| NFR-3 | 테넌트 경계 위반 접근은 기존과 동일하게 차단된다. 상태 코드만 401 → 403 으로 바뀐다. |
| NFR-4 | 인가 규칙 변경은 단위 테스트로 검증한다(자기 테넌트 허용 / 타 테넌트 거부 / 금지 필드 거부). |

## 5. 제외 범위

- **`GET /admin/tenants` 목록을 테넌트 관리자에게 열어주는 것** — 테넌트 관리자는 자기 테넌트만 알면 되고, 목록은 다른 테넌트의 존재를 드러낸다.
- **테넌트 관리자의 테넌트 생성·삭제·상태 변경** — 플랫폼 관리자 고유 권한으로 유지.
- **프런트엔드 403 전역 처리(`/403` 리다이렉트 등)** — 현재 각 화면이 개별적으로 오류를 처리하고 있어, 전역 리다이렉트는 별도 UX 결정이 필요하다. 본 작업은 "403이 로그아웃을 유발하지 않는다"까지만 보장한다.
- **테넌트 관리자용 별도 설정 화면 신설** — 기존 `TenantDetailView.vue` 를 공용한다. 해당 화면에서 slug·issuer·status 는 읽기 전용 표시이고 편집 대상은 이름·설정뿐이라 권한 범위와 일치한다.
- OAuth 엔드포인트 및 엔드유저 로그인 흐름 — 본 결함과 무관.

## 6. 성공 기준

- TENANT_ADMIN 으로 로그인하면 `/admin/tenants/:tenantId/dashboard` 에 머무르고, 사이드바에 테넌트명이 표시된다. 브라우저 콘솔에 401 이 발생하지 않는다.
- TENANT_ADMIN 이 "테넌트 설정" 화면에서 테넌트 이름과 보안·가입·알림 설정을 저장할 수 있다.
- TENANT_ADMIN 이 `status` 또는 `issuer` 변경을 시도하면 403 이 반환되고 값은 바뀌지 않는다.
- TENANT_ADMIN 이 다른 테넌트 ID 로 조회·수정을 시도하면 403 이 반환된다.
- PLATFORM_ADMIN 의 기존 동작(목록·생성·삭제·상태 변경 포함)은 모두 그대로다.
- `bun run lint`, `bun run typecheck`, `bun run test`, `bun run build` 통과.
