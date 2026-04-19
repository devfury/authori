# User Profile Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자 목록에 프로필의 `name` 필드 값을 이름 컬럼으로 표시하고, 사용자 상세 화면에 프로필 스키마 기반 전체 프로필 정보를 카드로 표시한다.

**Architecture:** 백엔드 `findAll` / `findOne`은 이미 profile 관계를 eager load해서 반환한다. 프론트엔드 `User` 타입에 `profile` 필드만 추가하면 런타임에서 이미 오는 데이터를 TypeScript가 인식할 수 있다. 상세 화면은 활성 스키마를 병렬로 추가 로드하여 필드 레이블과 순서를 가져온다.

**Tech Stack:** Vue 3, TypeScript, axios

---

## 배경 지식

- `usersApi.findAll()` 응답의 각 `item`에는 이미 `profile: { profileJsonb: {...} }` 가 포함됨 (backend `leftJoinAndSelect('u.profile', 'profile')`, users.service.ts:102)
- `usersApi.findOne()` 응답에도 `relations: ['profile']` 로 profile이 포함됨 (users.service.ts:125)
- 다만 `frontend/src/api/users.ts`의 `User` 인터페이스에 `profile` 필드가 없어 TypeScript가 모름 → `as any` 없이 접근하려면 타입 수정 필요
- 활성 스키마 조회 엔드포인트: `GET /admin/tenants/:tenantId/schemas/active` (backend에 존재하나 frontend schemasApi에 미구현)
- 스키마의 `x-order` 배열로 필드 표시 순서 결정. `x-order`가 없으면 `Object.entries` 순서 사용.

---

## File Map

### Frontend — Modified
- `frontend/src/api/users.ts` — `UserProfile` 인터페이스 추가, `User`에 `profile` 필드 추가
- `frontend/src/api/schemas.ts` — `findActive()` 메서드 추가
- `frontend/src/views/tenant/users/UserListView.vue` — 이름 컬럼 추가
- `frontend/src/views/tenant/users/UserDetailView.vue` — 프로필 카드 섹션 추가

---

## Task 1: `User` 타입에 profile 필드 추가

**Files:**
- Modify: `frontend/src/api/users.ts`

- [ ] **Step 1: `UserProfile` 인터페이스 및 `User.profile` 필드 추가**

`frontend/src/api/users.ts`를 열어 `User` 인터페이스 위에 `UserProfile`을 추가하고, `User`에 `profile` 필드를 추가한다.

```typescript
import http from './http'
import { type UserStatus } from './enums'

export interface UserProfile {
  id: string
  userId: string
  tenantId: string
  schemaVersionId: string | null
  profileJsonb: Record<string, unknown>
  updatedAt: string
}

export interface User {
  id: string
  tenantId: string
  email: string
  loginId: string | null
  status: UserStatus
  failedLoginAttempts: number
  lastLoginAt: string | null
  createdAt: string
  profile?: UserProfile
}
```

나머지 (`CreateUserPayload`, `UpdateUserPayload`, `UserListQuery`, `UserPage`, `usersApi`) 는 그대로 유지.

- [ ] **Step 2: 빌드로 타입 오류 확인**

```bash
cd frontend && bun run build 2>&1 | grep -E "error TS" | head -20
```

Expected: `UserEditView.vue`의 `as any` 캐스트가 불필요해지나 오류는 아님. 새로운 타입 오류 없어야 함.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/users.ts
git commit -m "feat: add UserProfile type and profile field to User interface"
```

---

## Task 2: schemasApi에 `findActive` 추가

**Files:**
- Modify: `frontend/src/api/schemas.ts`

- [ ] **Step 1: `findActive` 메서드 추가**

`frontend/src/api/schemas.ts`의 `schemasApi` 객체에 메서드 추가:

```typescript
export const schemasApi = {
  findAll(tenantId: string) {
    return http.get<ProfileSchemaVersion[]>(`/admin/tenants/${tenantId}/schemas`)
  },
  findActive(tenantId: string) {
    return http.get<ProfileSchemaVersion | null>(`/admin/tenants/${tenantId}/schemas/active`)
  },
  publish(tenantId: string, payload: PublishSchemaPayload) {
    return http.post<ProfileSchemaVersion>(`/admin/tenants/${tenantId}/schemas`, payload)
  },
}
```

- [ ] **Step 2: 빌드 확인**

```bash
cd frontend && bun run build 2>&1 | grep -E "error TS" | head -10
```

Expected: 오류 없음.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/schemas.ts
git commit -m "feat: add findActive to schemasApi"
```

---

## Task 3: 사용자 목록 — 이름 컬럼 추가

**Files:**
- Modify: `frontend/src/views/tenant/users/UserListView.vue`

프로필의 `name` 키 값을 이메일 오른쪽 컬럼에 표시한다.

- [ ] **Step 1: 테이블 헤더에 이름 컬럼 추가**

`UserListView.vue` template의 `<thead>` 부분 수정.

기존:
```html
<th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">이메일</th>
<th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">상태</th>
```

수정 후:
```html
<th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">이메일</th>
<th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">이름</th>
<th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">상태</th>
```

- [ ] **Step 2: 테이블 바디에 이름 셀 추가**

기존 이메일 셀 바로 다음에 이름 셀 추가:

```html
<td class="px-4 py-3 text-gray-900">
  <RouterLink
    :to="{ name: 'user-detail', params: { tenantId, userId: user.id } }"
    class="hover:text-indigo-600"
  >
    {{ user.email }}
  </RouterLink>
</td>
<!-- 이 아래에 추가 -->
<td class="px-4 py-3 text-gray-500">
  {{ (user.profile?.profileJsonb?.['name'] as string) ?? '—' }}
</td>
<td class="px-4 py-3"><StatusBadge :status="user.status" /></td>
```

- [ ] **Step 3: 빌드 확인**

```bash
cd frontend && bun run build 2>&1 | grep -E "error TS" | head -10
```

Expected: 오류 없음. (`User.profile`이 Task 1에서 추가되었으므로 타입 안전)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views/tenant/users/UserListView.vue
git commit -m "feat: show profile name field in user list"
```

---

## Task 4: 사용자 상세 — 프로필 카드 추가

**Files:**
- Modify: `frontend/src/views/tenant/users/UserDetailView.vue`

활성 스키마를 병렬로 로드하여, 스키마 정의 순서대로 프로필 필드를 카드로 표시한다.

- [ ] **Step 1: script — import 및 상태 추가**

`<script setup>` 상단 import에 schemasApi 추가:

```typescript
import { schemasApi, type ProfileSchemaVersion } from '@/api/schemas'
```

상태 변수 추가 (기존 `const roles = ref<Role[]>([])` 아래):

```typescript
const activeSchema = ref<ProfileSchemaVersion | null>(null)
```

- [ ] **Step 2: script — load() 수정 (스키마 병렬 로드)**

기존:
```typescript
async function load() {
  loading.value = true
  try {
    const [userRes, rolesRes] = await Promise.all([
      usersApi.findOne(tenantId, userId),
      rbacApi.getUserRoles(tenantId, userId),
    ])
    user.value = userRes.data
    roles.value = rolesRes.data || []
  } finally {
    loading.value = false
  }
}
```

수정 후:
```typescript
async function load() {
  loading.value = true
  try {
    const [userRes, rolesRes, schemaRes] = await Promise.all([
      usersApi.findOne(tenantId, userId),
      rbacApi.getUserRoles(tenantId, userId),
      schemasApi.findActive(tenantId).catch(() => ({ data: null })),
    ])
    user.value = userRes.data
    roles.value = rolesRes.data || []
    activeSchema.value = schemaRes.data
  } finally {
    loading.value = false
  }
}
```

- [ ] **Step 3: script — profileFields computed 추가**

`load()` 함수 아래에 추가:

```typescript
import { ref, onMounted, computed } from 'vue'

const profileFields = computed<{ key: string; label: string; value: unknown }[]>(() => {
  if (!activeSchema.value || !user.value?.profile) return []
  const schema = activeSchema.value.schemaJsonb
  const props = (schema.properties as Record<string, Record<string, unknown>>) ?? {}
  const order = (schema['x-order'] as string[]) ?? []
  const profileData = user.value.profile.profileJsonb

  const entries = Object.entries(props)
  if (order.length > 0) {
    entries.sort(([a], [b]) => {
      const ai = order.indexOf(a)
      const bi = order.indexOf(b)
      return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi)
    })
  }
  return entries.map(([key, def]) => ({
    key,
    label: (def.title as string) || key,
    value: profileData[key] ?? null,
  }))
})
```

(`import { ref, onMounted }` → `import { ref, onMounted, computed }` 로 변경 필요)

- [ ] **Step 4: template — 프로필 카드 추가**

`<div class="lg:col-span-2 space-y-6">` 안의 기본 정보 카드(`</div>`) 바로 다음에 프로필 카드 추가:

```html
<!-- 프로필 카드 (스키마가 있고 프로필 데이터가 있을 때) -->
<div
  v-if="profileFields.length > 0"
  class="bg-white rounded-xl border border-gray-200 p-5"
>
  <h3 class="text-sm font-semibold text-gray-900 mb-4">프로필</h3>
  <dl class="grid grid-cols-2 gap-4 text-sm">
    <div v-for="field in profileFields" :key="field.key">
      <dt class="text-xs text-gray-400 mb-0.5">{{ field.label }}</dt>
      <dd class="text-gray-800">
        {{ field.value !== null && field.value !== undefined ? field.value : '—' }}
      </dd>
    </div>
  </dl>
</div>

<!-- 스키마는 있지만 프로필 데이터가 없을 때 -->
<div
  v-else-if="activeSchema"
  class="bg-white rounded-xl border border-gray-200 p-5"
>
  <h3 class="text-sm font-semibold text-gray-900 mb-2">프로필</h3>
  <p class="text-xs text-gray-400">등록된 프로필 정보가 없습니다.</p>
</div>
```

- [ ] **Step 5: 빌드 확인**

```bash
cd frontend && bun run build 2>&1 | grep -E "error TS" | head -20
```

Expected: 오류 없음.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/tenant/users/UserDetailView.vue
git commit -m "feat: display profile schema fields in user detail view"
```

---

## Task 5: 수동 검증

- [ ] **Step 1: 개발 서버 시작**

터미널 1:
```bash
cd backend && bun run start:dev
```

터미널 2:
```bash
cd frontend && bun run dev
```

- [ ] **Step 2: 사용자 목록 검증**

브라우저에서 `/admin/tenants/:tenantId/users` 접속.

- [ ] 이메일 오른쪽에 "이름" 컬럼이 표시되는가
- [ ] 프로필의 `name` 값이 있는 사용자는 해당 값이 표시되는가
- [ ] 프로필에 `name` 값이 없는 사용자는 `—` 로 표시되는가

- [ ] **Step 3: 사용자 상세 검증**

사용자 행 클릭 → 상세 화면 접속.

- [ ] "프로필" 카드가 기본 정보 카드 아래에 표시되는가
- [ ] 스키마에 정의된 필드 레이블(title)이 표시되는가
- [ ] 각 필드의 값이 올바르게 표시되는가
- [ ] 프로필 데이터가 없으면 "등록된 프로필 정보가 없습니다." 메시지가 표시되는가
- [ ] 스키마 자체가 없는 테넌트(활성 스키마 없음)에서는 프로필 카드가 아예 렌더되지 않는가

- [ ] **Step 4: 네트워크 탭 확인**

개발자 도구 Network 탭에서 사용자 상세 진입 시:
- `GET /admin/tenants/:tenantId/users/:userId` 응답에 `profile.profileJsonb` 포함 확인
- `GET /admin/tenants/:tenantId/schemas/active` 요청이 발생하는지 확인
- 활성 스키마가 없으면 404 응답이 와도 화면이 깨지지 않는지 확인 (`.catch(() => ({ data: null }))` 처리)
