# 개발완료보고서 — 테넌트 관리자 로그인 실패(401 강제 로그아웃) 수정

- 작성일: 2026-09-23
- 브랜치: `fix/tenant-admin-login-401`
- 관련 요구사항: [2026-09-23-tenant-admin-login-401-requirements.md](../requirements/2026-09-23-tenant-admin-login-401-requirements.md)
- 관련 설계: [2026-09-23-tenant-admin-login-401-spec.md](../specs/2026-09-23-tenant-admin-login-401-spec.md)
- 관련 계획: [2026-09-23-tenant-admin-login-401-plan.md](../plans/2026-09-23-tenant-admin-login-401-plan.md)

## 1. 구현 요약

TENANT_ADMIN 로그인 직후 로그인 화면으로 튕기던 문제를 인가 계층에서 바로잡았다.

증상의 원인은 인증이 아니라 **레이아웃의 부가 요청 한 건**이었다. 로그인은 성공하고 토큰도 정상 발급되지만, `AdminLayout` 이 사이드바 테넌트명을 채우려 호출하는 `GET /admin/tenants/:id` 가 401 을 반환했고, `http.ts` 의 401 인터셉터가 이를 인증 만료로 해석해 방금 만든 세션을 파기했다. 서버 로그가 조용했던 것은 정상 4xx 라 별도 로깅 대상이 아니었기 때문이다.

두 층에서 고쳤다.

1. **인가 범위** — `TenantsController` 전체에 걸려 있던 `PlatformAdminGuard` 를 핸들러별 가드로 분리해, 테넌트 관리자가 자기 테넌트를 조회·설정할 수 있게 했다. 라우터와 사이드바는 이미 테넌트 관리자에게 "테넌트 설정" 메뉴를 노출하고 있었으므로, 화면과 어긋나 있던 API 인가를 화면 쪽에 맞춘 것이다.
2. **상태 코드 의미** — 두 관리자 가드의 권한 부족 응답을 401 에서 403 으로 바꿨다. 인증 실패와 인가 실패가 한 코드를 공유하는 한, "권한 없는 화면에 들어가기만 해도 로그아웃된다"는 패턴은 다른 화면에서도 언제든 재발한다.

## 2. 완료된 작업

| # | 작업 | 커밋 |
|---|---|---|
| 1 | 가드 2종의 권한 부족 예외를 `ForbiddenException` 으로 변경 | `ed60d8a` |
| 2 | 가드 단위 테스트 9건 작성 | `ed60d8a` |
| 3 | `tenants.controller.ts` 클래스 가드 제거 → 핸들러별 가드 부여 | `7d74f68` |
| 4 | 경로 파라미터 `:id` → `:tenantId` 통일 | `7d74f68` |
| 5 | `update()` 에 TENANT_ADMIN 금지 필드(`status`, `issuer`) 검사 추가 | `7d74f68` |
| 6 | 컨트롤러 단위 테스트 9건 작성 | `7d74f68` |
| 7 | 4단계 검증 전체 실행 | — |

### 2.1 엔드포인트별 최종 인가

| 엔드포인트 | 가드 | 비고 |
|---|---|---|
| `POST   /admin/tenants` | `PlatformAdminGuard` | 변경 없음 |
| `GET    /admin/tenants` | `PlatformAdminGuard` | 변경 없음 (목록은 타 테넌트 존재를 노출) |
| `GET    /admin/tenants/:tenantId` | `TenantAdminGuard` | **완화** |
| `PATCH  /admin/tenants/:tenantId` | `TenantAdminGuard` + 필드 제한 | **완화** (`name`·`settings` 만) |
| `POST   /admin/tenants/:tenantId/notify-test` | `TenantAdminGuard` | **완화** |
| `DELETE /admin/tenants/:tenantId` | `PlatformAdminGuard` | 변경 없음 |

6개 핸들러 전부에 가드가 붙었음을 설계서 3.2 표와 1:1 대조해 확인했다(클래스 가드 제거 시 누락 리스크 대응).

### 2.2 변경 파일

```
apps/api/src/admin/guards/platform-admin.guard.ts   수정
apps/api/src/admin/guards/tenant-admin.guard.ts     수정
apps/api/src/tenants/tenants.controller.ts          수정
apps/api/src/admin/guards/admin-guards.spec.ts      신규
apps/api/src/tenants/tenants.controller.spec.ts     신규
```

계획대로 `tenants.module.ts` 는 변경하지 않았다 — `AdminAuthModule` 이 이미 `TenantAdminGuard` 를 export 하고 `TenantsModule` 이 이를 import 하고 있었다. **프런트엔드도 변경 없다.** URL 형태가 그대로이고, 403 은 401 전용 인터셉터를 발동시키지 않는다. DB 스키마·마이그레이션 변경 없음.

## 3. 빌드/테스트 실행 결과

| 명령 | 결과 |
|---|---|
| `bun run lint` | **실패 — 기존 baseline** (아래 3.1) |
| `bun run typecheck` | 통과 (api, web) |
| `bun run test` | 통과 — 26 suites / **233 tests** |
| `bun run build` | 통과 (api, web) |

### 3.1 lint baseline 확인

`bun run lint` 는 이 브랜치에서 실패하지만 **`develop` 에서도 동일하게 실패**한다. 신규 유입이 없음을 다음과 같이 확인했다.

- `develop`: `✖ 122 problems (67 errors, 55 warnings)`
- `fix/tenant-admin-login-401`: `✖ 122 problems (67 errors, 55 warnings)`
- 오류 발생 파일 목록을 정렬해 `diff` 한 결과 **완전히 동일**(차이 0줄).

본 작업에서 추가한 두 스펙 파일은 오류 목록에 등장하지 않는다. 두 가드 파일은 baseline 에도 있던 항목으로, `await this.jwtGuard.canActivate(context)` 에 대한 `@typescript-eslint/await-thenable`(`AdminJwtGuard.canActivate` 가 `boolean` 을 동기 반환) 이며 본 수정과 무관하다.

### 3.2 테스트 사전 실패 확인

가드 스펙은 수정 전 코드에서 먼저 실행해 **4건 실패**(`Expected constructor: ForbiddenException / Received constructor: UnauthorizedException`)를 확인한 뒤 구현했다. 테스트가 실제로 대상 동작을 잡고 있음을 보장한다.

### 3.3 추가 테스트 커버리지 (18건)

가드(9): 역할별 통과/거부, 자기 테넌트 허용, 타 테넌트 거부, `tenantId` 클레임 없음, 경로 파라미터 없음, 인증 실패 401 전파.

컨트롤러(9): 플랫폼 관리자의 `status`·`issuer` 수정 허용, 테넌트 관리자의 `name`·`settings` 수정 허용, `status`·`issuer` 단독/혼합 수정 403 거부(서비스 미호출 확인), 빈 PATCH 허용, `mailDevRedirectEditable` 플래그 회귀 방지.

## 4. 남은 리스크 및 후속 작업

| 항목 | 내용 |
|---|---|
| **수동 검증 미실시** | 실행 중인 API·DB 가 없어 브라우저 종단 확인을 하지 못했다. 설계서 7장의 3개 시나리오(테넌트 관리자 로그인·설정 저장, 플랫폼 관리자 회귀)를 배포 후 확인 권장. |
| **401 → 403 계약 변경** | 권한 부족 응답 코드가 바뀐다. 차단 여부 자체는 동일하므로 보안 경계 변화는 없으나, 401 을 인가 실패로 처리하던 외부 소비자가 있다면 영향을 받는다. 저장소 내에는 그런 코드가 없다. |
| **프런트엔드 403 전역 처리 부재** | 요구사항 제외 범위. 현재 403 은 각 화면의 일반 오류 처리로 흘러간다. `/403` 리다이렉트 등 전역 UX 는 별도 결정 사항. |
| **lint baseline 부채** | 67 errors / 55 warnings 가 `develop` 에 누적돼 있다. 본 작업 범위 밖이나, 신규 오류 유입 감지를 어렵게 하므로 별도 정리 작업 권장. |
| **E2E 미보강** | 인가 변경을 단위 테스트로만 검증했다. `test/` 의 e2e 스위트에 테넌트 관리자 시나리오를 추가하면 라우팅·가드 배선까지 한 번에 검증할 수 있다. |
