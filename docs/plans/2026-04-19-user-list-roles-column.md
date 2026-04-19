# User List Roles Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자 목록 화면의 이름 컬럼 오른쪽에 역할 컬럼을 추가하고, 해당 사용자의 역할 `displayName`을 콤마로 구분하여 표시한다.

**Architecture:** 백엔드 `findAll()` 쿼리에 `userRoles → role` join을 추가해 한 번의 쿼리로 역할 데이터를 포함한 사용자 목록을 반환한다. N+1 없이 처리되며 백엔드 응답 형태만 변경되어 프론트엔드 타입과 템플릿 수정만 추가로 필요하다.

**Tech Stack:** NestJS (TypeORM QueryBuilder), Vue 3, TypeScript

---

## 배경 지식

- `User` 엔티티는 이미 `@OneToMany(() => UserRole, ...) userRoles: UserRole[]` 관계를 가짐 (`user.entity.ts`)
- `UserRole`은 `userId` + `roleId` 복합 PK의 junction 테이블이고, `role: TenantRole` 관계를 가짐
- `TenantRole`의 핵심 필드: `id`, `name`(slug), `displayName`(표시명)
- 현재 `findAll()`은 `u.profile`만 join하고 역할은 join하지 않음 (`users.service.ts:102`)
- 프론트엔드 `User` 인터페이스에 `userRoles` 필드가 없어 타입 추가 필요

---

## File Map

### Backend — Modified
- `backend/src/users/users.service.ts` — `findAll()` 쿼리에 userRoles + role join 추가

### Frontend — Modified
- `frontend/src/api/users.ts` — `UserRoleEntry`, `UserRoleSummary` 타입 추가, `User`에 `userRoles` 필드 추가
- `frontend/src/views/tenant/users/UserListView.vue` — 역할 컬럼(th + td) 추가

---

## Task 1: 백엔드 `findAll()` — userRoles join 추가

**Files:**
- Modify: `backend/src/users/users.service.ts`

- [ ] **Step 1: `findAll()` 쿼리빌더에 join 추가**

`users.service.ts`의 `findAll()` 메서드 내 QueryBuilder 체인을 수정한다.

기존 (`users.service.ts:100-106`):
```typescript
const qb = this.userRepo
  .createQueryBuilder('u')
  .leftJoinAndSelect('u.profile', 'profile')
  .where('u.tenantId = :tenantId', { tenantId })
  .orderBy('u.createdAt', 'DESC')
  .take(limit)
  .skip(offset);
```

수정 후:
```typescript
const qb = this.userRepo
  .createQueryBuilder('u')
  .leftJoinAndSelect('u.profile', 'profile')
  .leftJoinAndSelect('u.userRoles', 'userRole')
  .leftJoinAndSelect('userRole.role', 'role')
  .where('u.tenantId = :tenantId', { tenantId })
  .orderBy('u.createdAt', 'DESC')
  .take(limit)
  .skip(offset);
```

- [ ] **Step 2: 백엔드 빌드 확인**

```bash
cd backend && bun run build 2>&1 | grep -E "error TS" | head -10
```

Expected: 오류 없음. `userRoles`는 User 엔티티에 이미 정의된 관계이므로 TypeScript 오류 없음.

- [ ] **Step 3: API 응답 수동 확인**

백엔드 개발 서버를 실행하고 Swagger(`http://localhost:3000/docs`) 또는 curl로 사용자 목록 API를 호출해 응답에 `userRoles` 배열이 포함되는지 확인:

```bash
cd backend && bun run start:dev &
# 관리자 로그인 후 토큰으로 호출 (토큰은 /admin/auth/login 으로 획득)
curl -s -H "Authorization: Bearer <token>" \
  "http://localhost:3000/admin/tenants/<tenantId>/users?limit=1" \
  | jq '.[0] // .items[0] | { email, userRoles }'
```

Expected 응답 형태:
```json
{
  "email": "user@example.com",
  "userRoles": [
    {
      "userId": "...",
      "roleId": "...",
      "role": {
        "id": "...",
        "name": "admin",
        "displayName": "관리자",
        "description": null,
        "createdAt": "..."
      }
    }
  ]
}
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/users/users.service.ts
git commit -m "feat: include user roles in findAll response via eager join"
```

---

## Task 2: 프론트엔드 타입 수정

**Files:**
- Modify: `frontend/src/api/users.ts`

- [ ] **Step 1: `UserRoleSummary`, `UserRoleEntry` 타입 추가 및 `User`에 `userRoles` 필드 추가**

`frontend/src/api/users.ts`를 열어 `UserProfile` 인터페이스(또는 파일 상단) 아래에 추가:

```typescript
export interface UserRoleSummary {
  id: string
  name: string
  displayName: string
}

export interface UserRoleEntry {
  userId: string
  roleId: string
  role: UserRoleSummary
}
```

그리고 `User` 인터페이스에 `userRoles` 필드 추가:

```typescript
export interface User {
  id: string
  tenantId: string
  email: string
  loginId: string | null
  status: UserStatus
  failedLoginAttempts: number
  lastLoginAt: string | null
  createdAt: string
  profile?: UserProfile          // 이전 플랜에서 추가된 필드
  userRoles?: UserRoleEntry[]    // 추가
}
```

- [ ] **Step 2: 빌드 확인**

```bash
cd frontend && bun run build 2>&1 | grep -E "error TS" | head -10
```

Expected: 오류 없음.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/users.ts
git commit -m "feat: add userRoles typing to User interface"
```

---

## Task 3: 사용자 목록 화면 — 역할 컬럼 추가

**Files:**
- Modify: `frontend/src/views/tenant/users/UserListView.vue`

- [ ] **Step 1: 테이블 헤더에 역할 컬럼 추가**

`UserListView.vue` `<thead>` 에서 이름 컬럼(`<th>이름</th>`) 오른쪽에 추가:

```html
<th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">이름</th>
<th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">역할</th>
<th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">상태</th>
```

- [ ] **Step 2: 테이블 바디에 역할 셀 추가**

이름 셀(`<td>{{ (user.profile?.profileJsonb?.['name'] ...) }}</td>`) 바로 다음에 추가:

```html
<td class="px-4 py-3 text-gray-500 text-xs">
  {{ user.userRoles?.length
      ? user.userRoles.map(ur => ur.role.displayName).join(', ')
      : '—' }}
</td>
```

- [ ] **Step 3: 빌드 확인**

```bash
cd frontend && bun run build 2>&1 | grep -E "error TS" | head -10
```

Expected: 오류 없음.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views/tenant/users/UserListView.vue
git commit -m "feat: add roles column to user list view"
```

---

## Task 4: 수동 검증

- [ ] **Step 1: 개발 서버 시작**

```bash
# 터미널 1
cd backend && bun run start:dev

# 터미널 2
cd frontend && bun run dev
```

- [ ] **Step 2: 사용자 목록 검증**

브라우저에서 `/admin/tenants/:tenantId/users` 접속.

- [ ] 이름 컬럼 오른쪽에 "역할" 컬럼이 표시되는가
- [ ] 역할이 있는 사용자는 `displayName`이 콤마로 구분되어 표시되는가 (예: `관리자, 편집자`)
- [ ] 역할이 없는 사용자는 `—` 로 표시되는가
- [ ] 역할이 2개 이상인 사용자의 경우 모두 표시되는가

- [ ] **Step 3: 네트워크 탭 확인**

개발자 도구 Network 탭에서 `GET /admin/tenants/:tenantId/users` 응답의 각 item에 `userRoles` 배열이 포함되는지 확인.
