# 개발완료보고서 — 권한 없는 접근을 화면에 드러내기

- 작성일: 2026-09-23
- 브랜치: `fix/forbidden-ux`
- 관련 요구사항: [2026-09-23-forbidden-ux-requirements.md](../requirements/2026-09-23-forbidden-ux-requirements.md)
- 관련 설계: [2026-09-23-forbidden-ux-spec.md](../specs/2026-09-23-forbidden-ux-spec.md)
- 관련 계획: [2026-09-23-forbidden-ux-plan.md](../plans/2026-09-23-forbidden-ux-plan.md)

## 1. 구현 요약

테넌트 관리자가 권한 없는 테넌트 URL 로 들어가면 화면이 정상처럼 렌더링되고 빈 목록만 남던 문제를 고쳤다. [직전 작업](2026-09-23-tenant-admin-login-401-review.md)에서 권한 부족 응답을 401 → 403 으로 바꾸며 "프런트엔드 403 전역 처리"를 제외 범위로 남겼고, 그 빈자리가 이번 증상이었다.

세 층으로 나눠 고쳤다.

1. **예방** — 라우터 가드가 `requiresPlatformAdmin` 만 검사하고 테넌트 경계는 보지 않았다. 경로의 `tenantId` 를 로그인 사용자의 테넌트와 대조해, 화면이 그려지기 전에 403 으로 보낸다.
2. **탈출로** — 403 화면의 복귀 링크가 항상 `/admin`(플랫폼 전용)을 가리켜, 테넌트 관리자가 누르면 가드가 다시 403 으로 돌려보내는 막다른 골목이었다. 역할에 맞는 목적지로 나눴다.
3. **안전망** — 라우터가 걸러내지 못한 조회 실패(500·네트워크 단절 등)도 빈 화면이 아니라 이유가 보이는 화면으로 끝나게 했다.

## 2. 완료된 작업

| # | 작업 | 커밋 |
|---|---|---|
| 1 | `utils/api-error.ts` — HTTP 오류 → 문구 매핑 + 테스트 17건 | `6fbdc98` |
| 2 | `components/shared/ErrorState.vue` — 공용 오류 표시 + 테스트 4건 | `6fbdc98` |
| 3 | 라우터 가드 테넌트 경계 검사 + 테스트 7건 | `c85d72b` |
| 4 | `ForbiddenView` 역할별 복귀 경로·사유 문구 | `c85d72b` |
| 5 | 화면 9곳에 오류 상태 적용 | `56d0414` |
| 6 | 4단계 검증 전체 실행 | — |

### 2.1 라우터 가드

```ts
const targetTenantId = to.params.tenantId
if (typeof targetTenantId === 'string' && !auth.isPlatformAdmin) {
  if (auth.tenantId !== targetTenantId) return next({ name: 'forbidden' })
}
```

라우트 meta 에 새 플래그를 두지 않고 **`tenantId` 파라미터의 존재 자체**를 신호로 삼았다. 테넌트 범위 라우트를 추가할 때 플래그를 빠뜨려 구멍이 생기는 일을 구조적으로 막는다.

> **이것은 UX 장치이지 보안 경계가 아니다.** 실제 차단은 서버의 `TenantAdminGuard` 가 계속 한다. 프런트 가드를 우회해도 API 가 403 을 반환한다. 코드 주석에도 같은 취지를 남겼다.

### 2.2 오류 문구 매핑

| 조건 | 문구 |
|---|---|
| 403 | 권한이 없습니다. |
| 404 | 찾을 수 없습니다. |
| 5xx | 서버 오류가 발생했습니다. |
| 응답 없음 | 서버에 연결할 수 없습니다. |
| 그 외 | 불러오지 못했습니다. |

axios 에 의존하지 않고 `status` 만 안전하게 읽는다. `null`·문자열·`Error` 등 비정형 입력에도 던지지 않고 기본 문구를 반환한다(테스트로 고정). 401 은 매핑하지 않는다 — `http.ts` 인터셉터가 로그아웃으로 처리하므로 화면에 남을 일이 없다.

권한 오류는 다시 호출해도 결과가 같으므로 `isRetryable()` 로 재시도 버튼을 감춘다.

### 2.3 화면별 처리 (9곳)

6곳(`ClientListView`, `UserListView`, `RoleListView`, `PermissionListView`, `ScopeListView`, `AuditLogView`)은 구조가 균일해 동일 패턴으로 적용했다. 나머지 3곳은 **구현 중 각각 다른 사정이 드러나** 개별 처리했다.

| 화면 | 발견한 사정 | 처리 |
|---|---|---|
| `ExternalAuthListView` | `try` 자체가 없었다. 실패 시 `loading` 이 영원히 `true` 로 남아 **"불러오는 중..."이 무한히 표시**됐다(빈 화면과는 또 다른 증상). | `try/catch/finally` 신규 |
| `SchemaListView` · `AuditLogView` | `Promise.allSettled` 로 보조 데이터를 받는데, 거기 섞인 `adminsApi` 는 **플랫폼 관리자 전용이라 테넌트 관리자에게는 항상 403** 이다. 관용 처리가 의도적이었다. | 관용은 유지하고 **주 데이터의 실패만** 표면화 |
| `DashboardView` · `SchemaListView` | 로딩이 `onMounted` 인라인이라 재시도할 대상이 없었다. | named `load()` 로 추출 |

`AuditLogView` 의 `onMounted` 보조 로딩은 이미 `allSettled` 라 손대지 않았다. `loadPage()` 만 변경했다.

### 2.4 변경 파일

```
신규  apps/web/src/utils/api-error.ts
      apps/web/src/utils/api-error.spec.ts
      apps/web/src/components/shared/ErrorState.vue
      apps/web/src/components/shared/ErrorState.spec.ts
      apps/web/src/router/tenant-guard.spec.ts
수정  apps/web/src/router/index.ts
      apps/web/src/views/ForbiddenView.vue
      apps/web/src/views/tenant/ 아래 9개 화면
```

**백엔드·DB·`http.ts` 인터셉터 변경 없음.** `apps/api` 는 한 파일도 건드리지 않았다.

## 3. 빌드/테스트 실행 결과

| 명령 | 결과 |
|---|---|
| `bun run lint` | **실패 — 기존 api baseline** (아래 3.1) |
| `bun run typecheck` | 통과 (api, web) |
| `bun run test` | 통과 — api 26 suites / 233 tests, **web 9 files / 41 tests** |
| `bun run build` | 통과 (api, web) |

### 3.1 lint baseline 확인

`✖ 122 problems (67 errors, 55 warnings)` — `develop` 과 **수치가 동일**하고, 오류는 전부 `@authori/api` 에서 나온다. **`apps/web` 의 lint 오류는 0건**이다.

이 브랜치는 `apps/api` 파일을 **한 건도 변경하지 않았다**(`git diff --name-only origin/develop...HEAD` 로 확인). 따라서 신규 유입이 없음이 확정적이다.

### 3.2 테스트 사전 실패 확인

라우터 가드 스펙은 수정 전 코드에서 먼저 실행해 **"테넌트 관리자가 다른 테넌트 경로로 진입하면 403" 1건만 실패**(`Expected { name: 'forbidden' } / Received undefined`)함을 확인한 뒤 구현했다. 나머지 6건은 기존 동작이라 처음부터 통과했고, 이는 회귀 방지선 역할을 한다.

### 3.3 추가 테스트 커버리지 (28건)

- `api-error` (17): 403·404·5xx·응답 없음·미분류 상태 코드, 비정형 입력 6종, 재시도 가능 여부.
- `tenant-guard` (7): 자기 테넌트 통과, 타 테넌트 차단, 플랫폼 관리자 통과, `tenantId` 없는 경로 건너뜀, public 통과, 미인증 → 로그인, 플랫폼 전용 경로 차단(기존 동작 회귀).
- `ErrorState` (4): 메시지 렌더링, 버튼 표시·숨김, `retry` emit.

## 4. 남은 리스크 및 후속 작업

| 항목 | 내용 |
|---|---|
| **수동 검증 미실시** | 실행 중인 API·DB 가 없어 브라우저 종단 확인을 하지 못했다. 설계서 7장의 4개 시나리오를 배포 후 확인 권장. 특히 **네트워크 탭에 타 테넌트 API 요청이 0건**인지. |
| **변경 동작(mutation)의 조용한 실패** | `UserListView.runBulk` 등 `catch` 없는 **변경** 경로가 남아 있다. 이번 범위는 조회 경로였다. 일괄 승인·보류가 실패하면 여전히 조용히 끝난다 — 후속 작업 권장. |
| **프런트 가드의 성격** | 라우터 가드는 UX 장치다. 이를 보안 경계로 오인해 서버 검사를 느슨하게 만들면 안 된다. 설계서·코드 주석에 명시했다. |
| **오류 문구의 구체성** | 403 을 "권한이 없습니다."로 일괄 표현한다. 서버가 내려주는 구체적 사유(예: `Tenant admin cannot modify: status`)는 노출하지 않는다. 필요해지면 매핑 함수 한 곳만 고치면 된다. |
| **lint baseline 부채** | api 의 67 errors / 55 warnings 가 `develop` 에 누적돼 있다. 신규 오류 유입 감지를 어렵게 하므로 별도 정리 작업 권장(직전 보고서에서도 동일 지적). |
