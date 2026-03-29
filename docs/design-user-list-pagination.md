# 사용자 목록 페이징 + 검색/필터 기능 설계

> **구현 완료** — 이 문서는 구현된 상태를 기준으로 작성되었습니다.

---

## 1. 변경 전 상태

| 항목 | 변경 전 |
|------|---------|
| 백엔드 반환 타입 | `User[]` (총 건수 없음) |
| 백엔드 파라미터 | 없음 |
| 프론트 호출 | `usersApi.findAll(tenantId)` 고정 |
| 프론트 UI | 검색·필터·페이지 컨트롤 없음 |

---

## 2. 백엔드

### 인터페이스

**파일**: `backend/src/users/users.service.ts`

```typescript
interface UserListQuery {
  page?:   number;      // 1-based, 기본값 1
  limit?:  number;      // 기본값 20, 최대 100
  search?: string;      // email 또는 name 부분 검색
  status?: UserStatus;  // 'ACTIVE' | 'INACTIVE' | 'LOCKED'
}

interface UserPage {
  items: User[];
  total: number;
  page:  number;
  limit: number;
}
```

### `findAll` 구현

`find` → `QueryBuilder + getManyAndCount` 로 교체. 프로퍼티명 기준 (`u.tenantId`, `u.createdAt`).

```typescript
async findAll(tenantId: string, query: UserListQuery = {}): Promise<UserPage> {
  const { page = 1, limit: rawLimit = 20, search, status } = query;
  const limit  = Math.min(rawLimit, 100);
  const offset = (page - 1) * limit;

  const qb = this.userRepo
    .createQueryBuilder('u')
    .leftJoinAndSelect('u.profile', 'profile')
    .where('u.tenantId = :tenantId', { tenantId })
    .orderBy('u.createdAt', 'DESC')
    .take(limit)
    .skip(offset);

  if (search) {
    qb.andWhere('(u.email ILIKE :search OR u.name ILIKE :search)', {
      search: `%${search}%`,
    });
  }

  if (status) {
    qb.andWhere('u.status = :status', { status });
  }

  const [items, total] = await qb.getManyAndCount();
  return { items, total, page, limit };
}
```

> `ILIKE`는 PostgreSQL 대소문자 무시 검색. TypeORM 파라미터 바인딩 사용으로 SQL Injection 없음.

### 컨트롤러 파라미터

**파일**: `backend/src/users/users.controller.ts`

| 파라미터 | 타입 | 기본값 | 설명 |
|---------|------|--------|------|
| `page` | number | 1 | 페이지 번호 (1-based) |
| `limit` | number | 20 | 페이지당 건수 (최대 100) |
| `search` | string | — | 이메일 또는 이름 부분 검색 |
| `status` | UserStatus enum | — | 상태 필터 (ACTIVE / INACTIVE / LOCKED) |

### API 응답 예시

```jsonc
// GET /admin/tenants/:tenantId/users?page=2&limit=20&search=alice&status=ACTIVE
{
  "items": [ /* User[] */ ],
  "total": 83,
  "page": 2,
  "limit": 20
}
```

---

## 3. 프론트엔드

### API 클라이언트

**파일**: `frontend/src/api/users.ts`

```typescript
export interface UserListQuery {
  page?:   number;
  limit?:  number;
  search?: string;
  status?: UserStatus;
}

export interface UserPage {
  items: User[];
  total: number;
  page:  number;
  limit: number;
}

export const usersApi = {
  findAll(tenantId: string, query?: UserListQuery) {
    return http.get<UserPage>(`/admin/tenants/${tenantId}/users`, { params: query })
  },
  // ...
}
```

### 뷰 상태 구조

**파일**: `frontend/src/views/tenant/users/UserListView.vue`

```typescript
// 페이징
const currentPage = ref(1)
const pageLimit   = ref(20)
const total       = ref(0)
const totalPages  = computed(() => Math.ceil(total.value / pageLimit.value))

// 검색/필터
const searchInput  = ref('')   // 입력 중인 값 (디바운스 전)
const searchQuery  = ref('')   // 실제 API 호출에 사용되는 값
const statusFilter = ref<string>('')
```

### `loadPage` 함수

```typescript
async function loadPage() {
  loading.value = true
  try {
    const { data } = await usersApi.findAll(tenantId, {
      page:   currentPage.value,
      limit:  pageLimit.value,
      search: searchQuery.value || undefined,
      status: (statusFilter.value as UserStatus) || undefined,
    })
    users.value = data.items
    total.value = data.total
  } finally {
    loading.value = false
  }
}
```

### URL 파라미터 연동

`syncUrl()`은 기본값(page=1, limit=20)은 URL에서 생략하고, 설정된 값만 포함:

```typescript
function syncUrl() {
  router.replace({
    query: {
      page:   currentPage.value > 1   ? currentPage.value : undefined,
      limit:  pageLimit.value !== 20  ? pageLimit.value   : undefined,
      search: searchQuery.value       || undefined,
      status: statusFilter.value      || undefined,
    },
  })
}
```

마운트 시 URL에서 상태 복원:

```typescript
onMounted(() => {
  currentPage.value  = Number(route.query.page   ?? 1)
  pageLimit.value    = Number(route.query.limit  ?? 20)
  searchQuery.value  = String(route.query.search ?? '')
  searchInput.value  = searchQuery.value
  statusFilter.value = String(route.query.status ?? '')
  loadPage()
})
```

### 검색 디바운스 및 필터 핸들러

검색어 입력은 300ms 디바운스 후 적용, 상태 변경은 즉시 적용:

```typescript
let debounceTimer: ReturnType<typeof setTimeout>
function onSearchInput() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    searchQuery.value = searchInput.value
    currentPage.value = 1
    syncUrl()
    loadPage()
  }, 300)
}

function onStatusChange() {
  currentPage.value = 1
  syncUrl()
  loadPage()
}
```

### `visiblePages` computed (페이지 번호 생략)

현재 페이지 ±2 범위 + 첫·마지막 페이지 항상 표시, 간격이 있으면 `'...'` 삽입:

```typescript
const visiblePages = computed(() => {
  const pages: (number | '...')[] = []
  const delta = 2
  const left  = currentPage.value - delta
  const right = currentPage.value + delta

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

### 비활성화 후 현재 페이지 유지

```typescript
async function confirmDeactivate() {
  if (!deactivateTarget.value) return
  await usersApi.deactivate(tenantId, deactivateTarget.value.id)
  deactivateTarget.value = null
  await loadPage()  // 현재 페이지 상태 유지
}
```

---

## 4. UI 레이아웃

```
┌─────────────────────────────────────────────────────────────────┐
│  사용자   테넌트 사용자를 관리합니다.          [+ 사용자 생성]    │
├──────────────────────────────┬──────────────────────────────────┤
│  🔍 이메일 또는 이름으로 검색  │  [상태 (전체) ▼]                 │
├──────────────────────────────┴──────────────────────────────────┤
│  [테이블] (로딩 중 opacity-50)                                   │
├─────────────────────────────────────────────────────────────────┤
│  총 83건          [◀]  1 2 3 ... 5  [▶]           [20건씩 ▼]    │
└─────────────────────────────────────────────────────────────────┘
```

**상태 드롭다운 항목**:

| 표시 | 값 |
|------|-----|
| 상태 (전체) | `''` |
| 활성 | `ACTIVE` |
| 비활성 | `INACTIVE` |
| 잠김 | `LOCKED` |

---

## 5. 변경 파일 목록

| 파일 | 내용 |
|------|------|
| `backend/src/users/users.service.ts` | `UserListQuery`, `UserPage` 인터페이스 추가, `findAll` QueryBuilder로 재작성 |
| `backend/src/users/users.controller.ts` | `page`, `limit`, `search`, `status` 파라미터 추가 |
| `frontend/src/api/users.ts` | `UserListQuery`, `UserPage` 타입 추가, `findAll` 파라미터 확장 |
| `frontend/src/views/tenant/users/UserListView.vue` | 페이징·검색/필터 상태, `loadPage`, `syncUrl`, `visiblePages`, 검색 UI, 페이지 컨트롤 UI 추가 |

DB 마이그레이션 불필요.

---

## 6. 엣지 케이스

| 상황 | 처리 |
|------|------|
| 검색 결과 없음 | `total: 0`, "등록된 사용자가 없습니다" 표시 |
| 검색어 입력 | 300ms 디바운스 후 자동 조회 (별도 검색 버튼 없음) |
| 상태 변경 | 즉시 1페이지로 리셋 후 조회 |
| 비활성화 후 현재 페이지의 마지막 항목 삭제 | `loadPage()`로 재조회, 빈 페이지 허용 |
| `limit=200` 초과 | 백엔드에서 100으로 클램핑 |
| `search` XSS | 백엔드 ILIKE 파라미터 바인딩으로 처리, 프론트는 Vue 템플릿 자동 이스케이프 |
| URL `page=999` | 빈 `items` 반환, "등록된 사용자가 없습니다" 표시 |
