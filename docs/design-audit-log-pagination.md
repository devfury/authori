# 감사 로그 페이징 + 검색/필터 기능 설계

> **구현 완료** — 이 문서는 구현된 상태를 기준으로 작성되었습니다.

---

## 1. 변경 전 상태

| 항목 | 변경 전 |
|------|---------|
| 백엔드 반환 타입 | `AuditLog[]` (총 건수 없음) |
| 백엔드 파라미터 | `limit`, `offset` (total 미반환) |
| 프론트 호출 | `auditApi.findAll(tenantId, { limit: 50 })` 고정 |
| 프론트 UI | 페이지 컨트롤·필터 없음 |

---

## 2. 백엔드

### 인터페이스

**파일**: `backend/src/common/audit/audit.service.ts`

```typescript
interface AuditLogQuery {
  page?:      number;
  limit?:     number;
  action?:    AuditAction;
  success?:   boolean;
  actorType?: string;
  from?:      Date;
  to?:        Date;
}

interface AuditLogPage {
  items: AuditLog[];
  total: number;
  page:  number;
  limit: number;
}
```

### `findByTenant` 구현

`find` → `QueryBuilder + getManyAndCount` 로 교체. 프로퍼티명 기준 (`log.tenantId`, `log.createdAt`).

```typescript
async findByTenant(tenantId: string, query: AuditLogQuery = {}): Promise<AuditLogPage> {
  const { page = 1, limit: rawLimit = 20, action, success, actorType, from, to } = query;
  const limit  = Math.min(rawLimit, 100);
  const offset = (page - 1) * limit;

  const qb = this.auditRepo
    .createQueryBuilder('log')
    .where('log.tenantId = :tenantId', { tenantId })
    .orderBy('log.createdAt', 'DESC')
    .take(limit)
    .skip(offset);

  if (action)             qb.andWhere('log.action = :action',       { action });
  if (success !== undefined) qb.andWhere('log.success = :success',  { success });
  if (actorType)          qb.andWhere('log.actorType = :actorType', { actorType });
  if (from)               qb.andWhere('log.createdAt >= :from',     { from });
  if (to) {
    const toEnd = new Date(to);
    toEnd.setHours(23, 59, 59, 999);
    qb.andWhere('log.createdAt <= :to', { to: toEnd });
  }

  const [items, total] = await qb.getManyAndCount();
  return { items, total, page, limit };
}
```

### 컨트롤러 파라미터

**파일**: `backend/src/common/audit/audit.controller.ts`

| 파라미터 | 타입 | 기본값 | 설명 |
|---------|------|--------|------|
| `page` | number | 1 | 페이지 번호 (1-based) |
| `limit` | number | 20 | 페이지당 건수 (최대 100) |
| `action` | AuditAction enum | — | 액션 필터 |
| `success` | boolean (string) | — | 결과 필터 |
| `actorType` | string | — | 행위자 유형 필터 |
| `from` | YYYY-MM-DD | — | 시작 일시 |
| `to` | YYYY-MM-DD | — | 종료 일시 (해당 일 23:59:59까지 포함) |

`success` 파라미터는 쿼리스트링으로 수신 시 문자열이므로 `success === 'true'`로 boolean 변환.

### API 응답 예시

```jsonc
// GET /admin/tenants/:tenantId/audit?page=2&limit=20&action=LOGIN.FAILURE&success=false
{
  "items": [ /* AuditLog[] */ ],
  "total": 347,
  "page": 2,
  "limit": 20
}
```

---

## 3. 프론트엔드

### API 클라이언트

**파일**: `frontend/src/api/audit.ts`

```typescript
interface AuditLogQuery {
  page?:      number;
  limit?:     number;
  action?:    string;
  success?:   boolean;
  actorType?: string;
  from?:      string;  // 'YYYY-MM-DD'
  to?:        string;  // 'YYYY-MM-DD'
}

interface AuditLogPage {
  items: AuditLog[];
  total: number;
  page:  number;
  limit: number;
}

const auditApi = {
  findAll(tenantId: string, query?: AuditLogQuery) {
    return http.get<AuditLogPage>(`/admin/tenants/${tenantId}/audit`, { params: query })
  },
}
```

### 뷰 상태 구조

**파일**: `frontend/src/views/tenant/audit/AuditLogView.vue`

```typescript
// 페이징
const currentPage = ref(1)
const pageLimit   = ref(20)
const total       = ref(0)
const totalPages  = computed(() => Math.ceil(total.value / pageLimit.value))

// 필터
const filterAction    = ref('')
const filterSuccess   = ref('')   // '' | 'true' | 'false'
const filterActorType = ref('')
const filterFrom      = ref('')
const filterTo        = ref('')
```

### `loadPage` 함수

```typescript
async function loadPage() {
  const { data } = await auditApi.findAll(tenantId, {
    page:      currentPage.value,
    limit:     pageLimit.value,
    action:    filterAction.value    || undefined,
    success:   filterSuccess.value !== '' ? filterSuccess.value === 'true' : undefined,
    actorType: filterActorType.value || undefined,
    from:      filterFrom.value      || undefined,
    to:        filterTo.value        || undefined,
  })
  logs.value  = data.items
  total.value = data.total
}
```

### URL 파라미터 연동

`syncUrl()`은 기본값(page=1, limit=20)은 URL에서 생략하고, 설정된 값만 포함:

```typescript
function syncUrl() {
  router.replace({
    query: {
      ...route.query,
      page:      currentPage.value > 1    ? currentPage.value : undefined,
      limit:     pageLimit.value !== 20   ? pageLimit.value   : undefined,
      action:    filterAction.value       || undefined,
      success:   filterSuccess.value      || undefined,
      actorType: filterActorType.value    || undefined,
      from:      filterFrom.value         || undefined,
      to:        filterTo.value           || undefined,
    },
  })
}
```

마운트 시 URL에서 상태 복원:

```typescript
onMounted(async () => {
  currentPage.value     = Number(route.query.page      ?? 1)
  pageLimit.value       = Number(route.query.limit     ?? 20)
  filterAction.value    = String(route.query.action    ?? '')
  filterSuccess.value   = String(route.query.success   ?? '')
  filterActorType.value = String(route.query.actorType ?? '')
  filterFrom.value      = String(route.query.from      ?? '')
  filterTo.value        = String(route.query.to        ?? '')
  // ...
  await loadPage()
})
```

### 필터 변경 핸들러

필터가 변경되면 항상 1페이지로 리셋:

```typescript
function onFilterChange() {
  currentPage.value = 1
  syncUrl()
  loadPage()
}
```

`removeFilter(key)` — 활성 필터 뱃지의 ✕ 클릭 시 해당 필터만 초기화:

```typescript
function removeFilter(key: string) {
  if (key === 'action')    filterAction.value    = ''
  if (key === 'success')   filterSuccess.value   = ''
  if (key === 'actorType') filterActorType.value = ''
  if (key === 'date')      { filterFrom.value = ''; filterTo.value = '' }
  onFilterChange()
}
```

### `visiblePages` computed (페이지 번호 생략)

현재 페이지 ±2 범위 + 첫·마지막 페이지 항상 표시, 간격이 있으면 `'...'` 삽입:

```typescript
const visiblePages = computed(() => {
  const pages: (number | '...')[] = []
  const left  = currentPage.value - 2
  const right = currentPage.value + 2

  for (let i = 1; i <= totalPages.value; i++) {
    if (i === 1 || i === totalPages.value || (i >= left && i <= right)) {
      pages.push(i)
    } else if (pages.length > 0 && pages[pages.length - 1] !== '...') {
      pages.push('...')
    }
  }
  return pages
})
```

예: 총 18페이지, 현재 8페이지 → `1 ... 6 7 [8] 9 10 ... 18`

---

## 4. UI 레이아웃

```
┌──────────────────────────────────────────────────────────────────────┐
│  감사 로그   테넌트 내 주요 이벤트 기록입니다.                          │
├──────────────────────────────────────────────────────────────────────┤
│  [시작일____-__-__] ~ [종료일____-__-__]                              │
│  [액션 전체 ▼]  [전체 결과 ▼]  [전체 행위자 유형 ▼]   [필터 초기화]   │
│                                                                      │
│  [로그인 실패 ✕]  [실패 ✕]  (활성 필터 뱃지, 필터 설정 시 표시)       │
├──────────────────────────────────────────────────────────────────────┤
│  [테이블] (로딩 중 opacity-50)                                        │
├──────────────────────────────────────────────────────────────────────┤
│  총 347건          [◀]  1 2 ... 18  [▶]           [20건씩 ▼]         │
└──────────────────────────────────────────────────────────────────────┘
```

**액션 드롭다운 항목** (구현 기준):

| 표시 | 값 |
|------|-----|
| 전체 액션 | `''` |
| 로그인 성공 | `LOGIN.SUCCESS` |
| 로그인 실패 | `LOGIN.FAILURE` |
| 사용자 생성 | `USER.CREATED` |
| 사용자 수정 | `USER.UPDATED` |
| 사용자 활성화 | `USER.ACTIVATED` |
| 사용자 비활성화 | `USER.DEACTIVATED` |
| 사용자 잠금 | `USER.LOCKED` |
| 토큰 발급 | `TOKEN.ISSUED` |
| 토큰 갱신 | `TOKEN.REFRESHED` |
| 토큰 폐기 | `TOKEN.REVOKED` |
| 인증 코드 발급 | `CODE.ISSUED` |
| 외부 인증 오류 | `EXTERNAL_AUTH.ERROR` |

> `CONSENT.GRANTED`, `CONSENT.REVOKED`, `LOGOUT`, `TENANT.*`, `CLIENT.*`, `SCHEMA.*` 는 드롭다운에서 제외됨 (관리자 감사 로그 화면에서 별도 노출 예정).

---

## 5. 변경 파일 목록

| 파일 | 내용 |
|------|------|
| `backend/src/common/audit/audit.service.ts` | `AuditLogQuery`, `AuditLogPage` 인터페이스 추가, `findByTenant` QueryBuilder로 재작성 |
| `backend/src/common/audit/audit.controller.ts` | `page`, `limit`, `action`, `success`, `actorType`, `from`, `to` 파라미터 추가 |
| `frontend/src/api/audit.ts` | `AuditLogQuery`, `AuditLogPage` 타입 추가, `findAll` 파라미터 확장 |
| `frontend/src/views/tenant/audit/AuditLogView.vue` | 페이징·필터 상태, `loadPage`, `syncUrl`, `visiblePages`, `activeFilters`, 필터 UI, 페이지 컨트롤 UI 추가 |

DB 마이그레이션 불필요.

---

## 6. 엣지 케이스

| 상황 | 처리 |
|------|------|
| `from > to` | `to` date input에 `min="filterFrom"` 속성으로 방지 |
| `to` 날짜 포함 범위 | 백엔드에서 `toEnd.setHours(23, 59, 59, 999)` 처리 |
| 필터 결과 없음 | "기록이 없습니다" 표시 (필터 초기화 버튼 상단에 노출) |
| 페이지 로딩 중 | 테이블 `opacity-50` + 버튼 disabled |
| `limit=200` 초과 | 백엔드에서 100으로 클램핑 |
| URL `page=999` | 빈 `items` 반환, "기록이 없습니다" 표시 |
