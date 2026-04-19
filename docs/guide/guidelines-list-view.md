# 목록 화면 개발 규칙

목록을 표시하는 모든 화면(사용자 목록, 감사 로그 등)에 공통 적용되는 규칙이다.

---

## 1. 백엔드

### 1-1. 응답 인터페이스

목록 API는 반드시 `Page` 형태로 반환한다. 배열만 반환하는 것은 금지.

```typescript
interface XxxPage {
  items: Xxx[];
  total: number;  // 필터 조건을 포함한 전체 건수
  page:  number;  // 실제 반영된 페이지 번호
  limit: number;  // 실제 반영된 페이지당 건수
}
```

### 1-2. 쿼리 파라미터 인터페이스

```typescript
interface XxxQuery {
  page?:  number;  // 1-based, 기본값 1
  limit?: number;  // 기본값 20, 최대 100
  // 도메인별 필터 파라미터 추가
}
```

### 1-3. QueryBuilder 패턴

`find` / `findAndCount` 대신 QueryBuilder + `getManyAndCount`를 사용한다.

```typescript
async findXxx(tenantId: string, query: XxxQuery = {}): Promise<XxxPage> {
  const { page = 1, limit: rawLimit = 20, /* 기타 필터 */ } = query;
  const limit  = Math.min(rawLimit, 100);   // 최대 100 클램핑
  const offset = (page - 1) * limit;

  const qb = this.repo
    .createQueryBuilder('x')
    .where('x.tenantId = :tenantId', { tenantId })  // ← 엔티티 프로퍼티명 사용
    .orderBy('x.createdAt', 'DESC')
    .take(limit)
    .skip(offset);

  // 동적 필터 조건 추가
  if (filter) qb.andWhere('x.column = :value', { value });

  const [items, total] = await qb.getManyAndCount();
  return { items, total, page, limit };
}
```

> **중요**: QueryBuilder의 조건에는 DB 컬럼명(`tenant_id`, `created_at`)이 아니라 **엔티티 프로퍼티명**(`tenantId`, `createdAt`)을 사용한다. 컬럼명을 사용하면 TypeORM이 조건을 무시하여 0건이 반환된다.

### 1-4. 컨트롤러 파라미터 규칙

| 파라미터 | 타입 처리 | 기본값 처리 |
|---------|----------|-----------|
| `page` | `parseInt(page, 10)` | 서비스에서 기본값 1 |
| `limit` | `parseInt(limit, 10)` | 서비스에서 기본값 20 |
| `boolean` 필터 | `value === 'true'`로 변환 | `undefined`로 미전달 |
| `string` 필터 | `value \|\| undefined` | `undefined`로 미전달 |
| 날짜 필터 | `new Date(value)` | `undefined`로 미전달 |

날짜 필터에서 종료일은 해당 일 끝까지 포함:

```typescript
if (to) {
  const toEnd = new Date(to);
  toEnd.setHours(23, 59, 59, 999);
  qb.andWhere('x.createdAt <= :to', { to: toEnd });
}
```

---

## 2. 프론트엔드

### 2-1. API 클라이언트 타입

```typescript
export interface XxxQuery {
  page?:  number;
  limit?: number;
  // 필터 파라미터
}

export interface XxxPage {
  items: Xxx[];
  total: number;
  page:  number;
  limit: number;
}

export const xxxApi = {
  findAll(tenantId: string, query?: XxxQuery) {
    return http.get<XxxPage>(`/admin/tenants/${tenantId}/xxx`, { params: query })
  },
}
```

### 2-2. 뷰 상태 구조

```typescript
// 페이징 상태 (모든 목록 화면 공통)
const currentPage = ref(1)
const pageLimit   = ref(20)
const total       = ref(0)
const totalPages  = computed(() => Math.ceil(total.value / pageLimit.value))

// 로딩 상태
const loading = ref(true)

// 필터 상태 (도메인별로 추가)
const filterXxx = ref('')
```

### 2-3. `loadPage` 함수

```typescript
async function loadPage() {
  loading.value = true
  try {
    const { data } = await xxxApi.findAll(tenantId, {
      page:   currentPage.value,
      limit:  pageLimit.value,
      filter: filterXxx.value || undefined,
    })
    items.value = data.items
    total.value = data.total
  } finally {
    loading.value = false
  }
}
```

### 2-4. URL 파라미터 연동

기본값(page=1, limit=20)은 URL에서 생략한다. 설정된 값만 포함.

```typescript
function syncUrl() {
  router.replace({
    query: {
      page:   currentPage.value > 1   ? currentPage.value : undefined,
      limit:  pageLimit.value !== 20  ? pageLimit.value   : undefined,
      filter: filterXxx.value         || undefined,
    },
  })
}
```

마운트 시 URL에서 상태 복원 후 즉시 데이터 로드:

```typescript
onMounted(() => {
  currentPage.value = Number(route.query.page  ?? 1)
  pageLimit.value   = Number(route.query.limit ?? 20)
  filterXxx.value   = String(route.query.filter ?? '')
  loadPage()
})
```

### 2-5. 필터/검색 변경 핸들러

필터가 변경되면 반드시 **1페이지로 리셋**한다.

```typescript
function onFilterChange() {
  currentPage.value = 1
  syncUrl()
  loadPage()
}
```

검색 입력창은 **300ms 디바운스**를 적용한다 (즉시 조회 금지).

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
```

### 2-6. 새로고침 버튼

서버에서 데이터가 변경되었을 때 사용자가 명시적으로 재조회할 수 있도록 **새로고침 버튼을 반드시 제공**한다. 페이지 상태(현재 페이지, 필터)를 유지한 채 `loadPage()`를 호출한다.

```typescript
function refresh() {
  loadPage()
}
```

버튼은 검색/필터 영역 우측에 배치한다:

```html
<button
  @click="refresh"
  :disabled="loading"
  class="p-2 rounded-lg border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
  title="새로고침"
>
  <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" />
</button>
```

> `lucide-vue-next`의 `RefreshCw` 아이콘을 사용하고, 로딩 중에는 `animate-spin`으로 회전 애니메이션을 적용한다.

### 2-7. 페이지 이동 및 페이지당 건수 변경

```typescript
async function goToPage(page: number) {
  if (page < 1 || page > totalPages.value) return
  currentPage.value = page
  syncUrl()
  await loadPage()
}

async function changeLimit(newLimit: number) {
  pageLimit.value   = newLimit
  currentPage.value = 1  // 반드시 1페이지로 리셋
  syncUrl()
  await loadPage()
}
```

### 2-8. `visiblePages` computed

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

## 3. UI 레이아웃

### 3-1. 기본 구조

```
┌──────────────────────────────────────────────────────────┐
│  [페이지 제목]                           [주요 액션 버튼]  │
├──────────────────────────────────────────────────────────┤
│  [검색/필터 영역]                              [🔄 새로고침] │
├──────────────────────────────────────────────────────────┤
│  [테이블] (로딩 중 opacity-50)                            │
├──────────────────────────────────────────────────────────┤
│  총 N건          [◀]  1 2 ... 18  [▶]        [20건씩 ▼]  │
└──────────────────────────────────────────────────────────┘
```

### 3-2. 페이지 컨트롤 영역 (테이블 하단 고정)

3열 grid 레이아웃:

| 좌측 | 중앙 | 우측 |
|------|------|------|
| `총 N건` | 이전/페이지번호/다음 버튼 | `[20건씩 ▼]` 셀렉터 |

```html
<div class="grid grid-cols-3 items-center px-4 py-4 bg-gray-50 border-t border-gray-200">
  <div class="text-xs text-gray-500">총 <span class="font-medium text-gray-900">{{ total }}</span>건</div>
  <nav class="flex items-center justify-center space-x-1">...</nav>
  <div class="flex items-center justify-end space-x-2">
    <span class="text-xs text-gray-500">표시:</span>
    <select ...>
      <option :value="20">20건씩</option>
      <option :value="50">50건씩</option>
      <option :value="100">100건씩</option>
    </select>
  </div>
</div>
```

### 3-3. 테이블 가로 스크롤

테이블을 감싸는 컨테이너에 `overflow-x-auto`를 적용한다. 창을 좁게 축소해도 가로 스크롤로 모든 컬럼을 확인할 수 있어야 한다.

```html
<div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
  <div class="overflow-x-auto">
    <table class="w-full text-sm min-w-[640px]">
      ...
    </table>
  </div>
  <!-- 페이지 컨트롤은 overflow-x-auto 바깥에 배치 -->
  <div class="px-4 py-4 bg-gray-50 border-t border-gray-200 ...">...</div>
</div>
```

- `overflow-x-auto`: 컨텐츠가 컨테이너 너비를 초과할 때 가로 스크롤바 표시
- `min-w-[640px]` (또는 컬럼 수에 맞는 적절한 값): 테이블이 그 이하로 축소되지 않도록 최소 너비 지정
- 페이지 컨트롤 영역은 `overflow-x-auto` **바깥**에 배치하여 항상 전체 너비로 표시

### 3-4. 로딩 상태

- 테이블 tbody: `loading` 중 `opacity-50` 클래스 적용
- 페이지 이동/변경 버튼: `loading` 중 `disabled`
- 초기 로딩(데이터 없음): "불러오는 중..." 전용 row 표시

### 3-5. 빈 결과

```html
<div v-if="items.length === 0" class="p-8 text-center text-sm text-gray-400">
  데이터가 없습니다.
</div>
```

필터가 활성화된 상태에서 빈 결과일 때는 필터 초기화 안내를 함께 표시한다.

---

## 4. 공통 규칙 요약

| 규칙 | 내용 |
|------|------|
| 페이지 기준 | 1-based (첫 페이지 = 1) |
| 기본 페이지당 건수 | 20 |
| 최대 페이지당 건수 | 100 (백엔드 클램핑) |
| 정렬 기준 | `createdAt DESC` (최신 순) |
| 필터 변경 시 | 반드시 1페이지로 리셋 |
| 검색 입력 | 300ms 디바운스 |
| URL 파라미터 | 기본값 생략, 변경된 값만 포함 |
| 새로고침 | URL에서 상태 복원 후 동일 결과 |
| QueryBuilder 조건 | 엔티티 프로퍼티명 사용 (camelCase) |
| boolean 쿼리파라미터 | `value === 'true'`로 변환 |
| 새로고침 버튼 | 검색/필터 영역 우측에 반드시 배치, 현재 상태 유지하며 재조회 |
| 테이블 가로 스크롤 | `overflow-x-auto` + `min-w-[640px]` 적용, 좁은 화면에서 가로 스크롤로 전체 컬럼 접근 가능 |
