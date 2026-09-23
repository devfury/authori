# 개발설계서 — 권한 없는 접근을 화면에 드러내기

- 작성일: 2026-09-23
- 관련 요구사항: [2026-09-23-forbidden-ux-requirements.md](../requirements/2026-09-23-forbidden-ux-requirements.md)

## 1. 범위

프런트엔드(`apps/web`)만 변경한다. 백엔드·DB·API 계약 변경 없음.

세 층으로 나눠 고친다. ①이 이번 증상의 직접 해결이고, ②는 ①이 만들어내는 막다른 골목을 없애며, ③은 ①이 걸러내지 못하는 나머지를 받는 안전망이다.

## 2. ① 라우터 가드 — 테넌트 경계 검사

### 2.1 현재

```ts
router.beforeEach((to, _from, next) => {
  const auth = useAuthStore()
  if (to.meta.public) return next()
  if (!auth.isAuthenticated) return next({ name: 'login' })
  if (to.meta.requiresPlatformAdmin && !auth.isPlatformAdmin) {
    return next({ name: 'forbidden' })
  }
  next()
})
```

`/admin/tenants/:tenantId/*` 라우트의 meta 는 `{ requiresAuth: true }` 뿐이다. 테넌트 경계를 아무도 검사하지 않는다.

### 2.2 변경

`requiresPlatformAdmin` 검사 **뒤에** 테넌트 경계 검사를 추가한다.

```ts
// 경로가 특정 테넌트를 가리키면 그 테넌트에 속한 관리자인지 확인한다.
// 플랫폼 관리자는 모든 테넌트를 넘나들 수 있다.
const targetTenantId = to.params.tenantId
if (typeof targetTenantId === 'string' && !auth.isPlatformAdmin) {
  if (auth.tenantId !== targetTenantId) return next({ name: 'forbidden' })
}
```

- `to.params.tenantId` 는 `string | string[]` 이므로 `typeof` 로 좁힌다.
- 라우트 meta 에 새 플래그를 추가하지 않는다. **경로에 `tenantId` 가 있다는 사실 자체**가 테넌트 범위 화면이라는 신호이고, 라우트를 새로 추가할 때 플래그를 빠뜨려 구멍이 생기는 일을 막는다.
- `auth.tenantId` 는 JWT 페이로드에서 파생된 computed 다(`auth.store.ts`). 별도 조회가 필요 없다.

> **이것은 UX 장치이지 보안 경계가 아니다.** 실제 차단은 서버의 `TenantAdminGuard` 가 한다. 프런트 가드를 우회해도 API 가 403 을 반환한다. 이 가드의 목적은 "권한 없음을 사용자에게 알리고, 실패할 것이 뻔한 요청을 보내지 않는 것"이다.

### 2.3 플랫폼 전용 라우트와의 관계

`/admin/tenants/:id`(tenant-detail)는 `requiresPlatformAdmin: true` 라 앞 조건에서 이미 걸러진다. 파라미터 이름도 `:id` 라 새 검사에 걸리지 않는다. 중복·충돌 없다.

## 3. ② ForbiddenView — 역할에 맞는 복귀 경로

### 3.1 현재 문제

```html
<RouterLink to="/admin">홈으로 돌아가기</RouterLink>
```

`/admin` 은 `requiresPlatformAdmin: true` 다. 테넌트 관리자가 누르면 가드가 다시 `forbidden` 으로 돌려보낸다. 403 에서 나갈 방법이 없다.

### 3.2 변경

역할에 따라 목적지를 계산한다.

| 역할 | 목적지 |
|---|---|
| PLATFORM_ADMIN | `/admin/tenants` (테넌트 목록) |
| TENANT_ADMIN (tenantId 있음) | `/admin/tenants/{tenantId}/dashboard` |
| 그 외 (미인증·tenantId 없음) | `/admin/login` |

`ForbiddenView.vue` 에 `<script setup>` 을 추가해 `useAuthStore()` 로 계산한다. 링크 문구도 목적지에 맞춰 바꾼다("내 테넌트로 돌아가기" / "테넌트 목록으로").

또한 현재 문구가 "접근 권한이 없습니다." 한 줄뿐이라 **왜** 막혔는지 알 수 없다. 테넌트 관리자 맥락에서는 "다른 테넌트의 자원입니다"라는 부연을 덧붙인다.

## 4. ③ 조회 실패의 표면화

### 4.1 오류 → 문구 매핑: `src/utils/api-error.ts` (신규)

순수 함수다. 상태를 갖지 않으므로 composable 이 아니라 `utils/` 에 둔다(기존 `utils/math.ts`, `utils/schema.ts` 와 같은 자리).

```ts
export function toApiErrorMessage(error: unknown): string
```

| 조건 | 반환 |
|---|---|
| HTTP 403 | `권한이 없습니다.` |
| HTTP 404 | `찾을 수 없습니다.` |
| HTTP 5xx | `서버 오류가 발생했습니다.` |
| 응답 없음(네트워크·타임아웃) | `서버에 연결할 수 없습니다.` |
| 그 외 | `불러오지 못했습니다.` |

401 은 매핑하지 않는다. `http.ts` 인터셉터가 로그아웃으로 처리하므로 화면에 남을 일이 없다(FR-8).

axios 에 의존하지 않고 `error?.response?.status` 를 안전하게 읽는다. 테스트에서 axios 오류 객체를 만들 필요가 없고, 다른 HTTP 클라이언트로 바뀌어도 깨지지 않는다.

### 4.2 오류 표시 컴포넌트: `src/components/shared/ErrorState.vue` (신규)

```
props:  message: string
        retryable?: boolean   (기본 true)
emits:  retry
```

기존 "불러오는 중..." 자리(`p-8 text-center text-sm text-gray-400`)와 같은 박스 안에 렌더링해 레이아웃이 튀지 않게 한다. 아이콘(`lucide-vue-next` 의 `AlertCircle`) + 메시지 + "다시 시도" 버튼.

`retryable` 을 두는 이유: 403 은 다시 시도해도 결과가 같다. 권한 오류에서는 재시도 버튼을 감춘다.

### 4.3 적용 화면 (9곳)

`try` 는 있으나 `catch` 가 없어 조용히 실패하던 조회 경로다.

| 화면 | 로딩 함수 |
|---|---|
| `tenant/DashboardView.vue` | `onMounted` 내 `Promise.all` |
| `tenant/clients/ClientListView.vue` | `loadPage()` |
| `tenant/users/UserListView.vue` | `loadPage()` |
| `tenant/rbac/RoleListView.vue` | `loadRoles()` |
| `tenant/rbac/PermissionListView.vue` | 목록 로딩 |
| `tenant/scopes/ScopeListView.vue` | 목록 로딩 |
| `tenant/schemas/SchemaListView.vue` | 목록 로딩 |
| `tenant/audit/AuditLogView.vue` | `loadPage()` + `onMounted` 보조 로딩 |
| `tenant/external-auth/ExternalAuthListView.vue` | 목록 로딩 |

적용 패턴(모든 화면 동일):

```ts
const loadError = ref('')

async function loadPage() {
  loading.value = true
  loadError.value = ''
  try {
    /* 기존 본문 그대로 */
  } catch (e) {
    loadError.value = toApiErrorMessage(e)
  } finally {
    loading.value = false
  }
}
```

```html
<div v-if="loading && items.length === 0" ...>불러오는 중...</div>
<ErrorState
  v-else-if="loadError"
  :message="loadError"
  :retryable="loadError !== '권한이 없습니다.'"
  @retry="loadPage"
/>
<template v-else> <!-- 기존 테이블 --> </template>
```

기존 템플릿의 `v-if="loading && ..."` 분기 바로 뒤에 `v-else-if` 를 끼우므로 기존 구조를 건드리지 않는다.

### 4.4 손대지 않는 것

- **이미 `catch` 가 있는 화면·다이얼로그** — 인라인 오류를 표시하고 있다. 문구를 통일하려 건드리면 검증 범위만 넓어진다.
- **변경 동작(생성·수정·삭제·일괄 처리)** — `UserListView.runBulk` 처럼 `catch` 없는 변경 경로가 남아 있으나, 요구사항의 대상은 조회 경로다. 후속 작업으로 남긴다.

## 5. 데이터 흐름

```
사용자가 /admin/tenants/<타 테넌트>/users 진입
        │
        ▼
router.beforeEach ──── 테넌트 불일치 ────▶ /403 (ForbiddenView)
        │                                      │
   일치 / 플랫폼 관리자                    역할별 복귀 링크
        │
        ▼
화면 렌더 → API 호출
        │
   ┌────┴────┐
 성공      실패(403·404·5xx·네트워크)
   │          │
 테이블   toApiErrorMessage() → ErrorState
```

## 6. 테스트 설계

vitest + `@vue/test-utils` (기존 `AppSidebar.spec.ts` 패턴 참고).

### 6.1 `src/utils/api-error.spec.ts` (신규)

403 / 404 / 500 / 응답 없음 / 알 수 없는 오류 각각의 문구, 그리고 `null`·문자열 등 비정형 입력에서 던지지 않고 기본 문구를 반환하는지.

### 6.2 `src/router/tenant-guard.spec.ts` (신규)

라우터 가드 로직 검증.

| 케이스 | 기대 |
|---|---|
| TENANT_ADMIN 이 자기 테넌트 경로 진입 | 통과 |
| TENANT_ADMIN 이 타 테넌트 경로 진입 | `forbidden` 으로 리다이렉트 |
| PLATFORM_ADMIN 이 임의 테넌트 경로 진입 | 통과 |
| `tenantId` 파라미터가 없는 경로 | 테넌트 검사 건너뜀 |
| 미인증 | `login` 으로 리다이렉트 (기존 동작) |
| TENANT_ADMIN 이 `requiresPlatformAdmin` 경로 진입 | `forbidden` (기존 동작 회귀) |

### 6.3 `src/components/shared/ErrorState.spec.ts` (신규)

메시지 렌더링, `retryable: false` 일 때 버튼 미표시, 버튼 클릭 시 `retry` emit.

## 7. 수동 검증 시나리오

1. 테넌트 A 관리자로 로그인 → 주소창에 `/admin/tenants/<B의 id>/users` 입력 → 403 화면. **네트워크 탭에 해당 테넌트 API 요청 0건.**
2. 403 화면의 복귀 링크 클릭 → 자기 테넌트 대시보드. 다시 튕기지 않음.
3. 플랫폼 관리자로 로그인 → 임의 테넌트 화면 진입 정상.
4. 개발자 도구에서 네트워크를 오프라인으로 두고 목록 새로고침 → "서버에 연결할 수 없습니다." + 다시 시도 버튼.
