# Remove User.name Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** User 테이블의 `name` 컬럼을 완전히 제거하고, 이름 정보는 UserProfile(JSONB)로만 관리한다.

**Architecture:** DB 마이그레이션으로 컬럼을 삭제하고, 백엔드 엔티티/DTO/서비스/컨트롤러에서 name 참조를 제거한다. 프론트엔드 API 타입, 폼, 목록/상세 화면에서도 name 필드를 제거한다. 감사 로그에서 사용자 이름 표시는 email fallback으로 단순화한다.

**Tech Stack:** NestJS (TypeORM, class-validator), Vue 3, Bun, TypeScript

---

## File Map

### Backend — Modified
- `backend/src/database/entities/user.entity.ts` — `name` 컬럼 제거
- `backend/src/users/dto/create-user.dto.ts` — `name` 필드 제거
- `backend/src/users/dto/update-user.dto.ts` — `name` 필드 제거
- `backend/src/oauth/authorize/dto/register.dto.ts` — `name` 필드 제거
- `backend/src/users/users.service.ts` — create/findAll/update에서 name 참조 제거
- `backend/src/users/users.controller.ts` — ApiQuery 설명 수정
- `backend/src/oauth/authorize/authorize.service.ts` — register 및 외부 인증 싱크에서 name 제거
- `backend/src/external-auth/external-auth.service.ts` — 필드 매핑에서 name 제거

### Backend — Created
- `backend/src/database/migrations/<timestamp>-RemoveUserName.ts` — 마이그레이션 파일

### Frontend — Modified
- `frontend/src/api/users.ts` — User 인터페이스 및 payload에서 name 제거
- `frontend/src/views/tenant/users/UserListView.vue` — 이름 컬럼 및 검색 placeholder 수정
- `frontend/src/views/tenant/users/UserCreateView.vue` — name 입력 필드 제거
- `frontend/src/views/tenant/users/UserEditView.vue` — name 입력 필드 제거
- `frontend/src/views/tenant/users/UserDetailView.vue` — name 표시 제거
- `frontend/src/views/tenant/audit/AuditLogView.vue` — name fallback → email only

---

## Task 1: DB 마이그레이션 생성 및 실행

**Files:**
- Create: `backend/src/database/migrations/<timestamp>-RemoveUserName.ts`

- [ ] **Step 1: 마이그레이션 생성**

```bash
cd backend
bun run migration:generate -- src/database/migrations/RemoveUserName
```

생성된 파일을 열어 `up()`에 아래 내용이 있는지 확인:
```sql
ALTER TABLE "users" DROP COLUMN "name"
```
없다면 수동으로 작성:
```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveUserName1234567890000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "name"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "name" character varying`,
    );
  }
}
```

- [ ] **Step 2: 마이그레이션 실행**

```bash
bun run migration:run
```

Expected: `RemoveUserName...` 마이그레이션이 실행됨.

- [ ] **Step 3: Commit**

```bash
git add backend/src/database/migrations/
git commit -m "chore: add migration to drop users.name column"
```

---

## Task 2: 백엔드 엔티티 및 DTO 수정

**Files:**
- Modify: `backend/src/database/entities/user.entity.ts`
- Modify: `backend/src/users/dto/create-user.dto.ts`
- Modify: `backend/src/users/dto/update-user.dto.ts`
- Modify: `backend/src/oauth/authorize/dto/register.dto.ts`

- [ ] **Step 1: user.entity.ts에서 name 컬럼 제거**

`backend/src/database/entities/user.entity.ts`를 열어 아래 라인을 삭제:
```typescript
// 제거할 코드 (정확한 라인 번호는 파일 확인)
@Column({ type: 'varchar', nullable: true })
name: string | null;
```

- [ ] **Step 2: create-user.dto.ts에서 name 필드 제거**

`backend/src/users/dto/create-user.dto.ts`에서 아래 블록 삭제:
```typescript
@ApiPropertyOptional({ example: '홍길동' })
@IsString()
@IsOptional()
name?: string;
```

- [ ] **Step 3: update-user.dto.ts에서 name 필드 제거**

`backend/src/users/dto/update-user.dto.ts`에서 동일한 name 블록 삭제.

- [ ] **Step 4: register.dto.ts에서 name 필드 제거**

`backend/src/oauth/authorize/dto/register.dto.ts`에서 name 관련 필드 삭제.

- [ ] **Step 5: 빌드로 타입 오류 확인**

```bash
cd backend
bun run build
```

Expected: name 참조가 남아 있으면 오류가 나타남. 오류가 있으면 다음 Task에서 수정.

- [ ] **Step 6: Commit**

```bash
git add backend/src/database/entities/user.entity.ts \
        backend/src/users/dto/ \
        backend/src/oauth/authorize/dto/register.dto.ts
git commit -m "feat: remove name field from User entity and DTOs"
```

---

## Task 3: UsersService 수정

**Files:**
- Modify: `backend/src/users/users.service.ts`
- Modify: `backend/src/users/users.controller.ts`

- [ ] **Step 1: users.service.ts — create()에서 name 제거**

`create()` 메서드의 User 생성 객체에서 `name: dto.name ?? null` 라인 삭제.

수정 전:
```typescript
const user = manager.create(User, {
  tenantId,
  email: dto.email,
  name: dto.name ?? null,   // ← 이 줄 삭제
  passwordHash: ...,
  ...
});
```

수정 후:
```typescript
const user = manager.create(User, {
  tenantId,
  email: dto.email,
  passwordHash: ...,
  ...
});
```

- [ ] **Step 2: users.service.ts — findAll() 검색 쿼리에서 name 제거**

```typescript
// 수정 전
qb.andWhere('(u.email ILIKE :search OR u.name ILIKE :search)', { search: `%${search}%` });

// 수정 후
qb.andWhere('u.email ILIKE :search', { search: `%${search}%` });
```

- [ ] **Step 3: users.service.ts — update()에서 name 제거**

```typescript
// 삭제할 라인
if (dto.name !== undefined) user.name = dto.name ?? null;
```

- [ ] **Step 4: users.controller.ts — ApiQuery 설명 수정**

```typescript
// 수정 전
@ApiQuery({ name: 'search', required: false, description: '이메일 또는 이름 부분 검색' })

// 수정 후
@ApiQuery({ name: 'search', required: false, description: '이메일 부분 검색' })
```

- [ ] **Step 5: 빌드 확인**

```bash
cd backend && bun run build
```

Expected: 오류 없음.

- [ ] **Step 6: Commit**

```bash
git add backend/src/users/users.service.ts backend/src/users/users.controller.ts
git commit -m "feat: remove name field from UsersService and controller"
```

---

## Task 4: AuthorizeService / ExternalAuthService 수정

**Files:**
- Modify: `backend/src/oauth/authorize/authorize.service.ts`
- Modify: `backend/src/external-auth/external-auth.service.ts`

- [ ] **Step 1: authorize.service.ts — register()에서 name 제거**

`register()` 메서드 내 User 생성 시:
```typescript
// 수정 전
const user = manager.create(User, {
  tenantId,
  email: dto.email,
  name: dto.name,   // ← 삭제
  ...
});

// 수정 후
const user = manager.create(User, {
  tenantId,
  email: dto.email,
  ...
});
```

- [ ] **Step 2: authorize.service.ts — 외부 인증 싱크에서 name 제거**

```typescript
// 삭제할 라인 (약 line 360)
if (mapped.name !== undefined) user.name = mapped.name ?? null;
```

- [ ] **Step 3: authorize.service.ts — JIT provisioning에서 name 제거**

```typescript
// 수정 전 (약 line 447)
const user = manager.create(User, {
  tenantId,
  email: mapped.email,
  name: mapped.name ?? null,   // ← 삭제
  ...
});
```

- [ ] **Step 4: external-auth.service.ts — 필드 매핑에서 name 제거**

`ExternalAuthService`에서 외부 사용자 데이터를 User 필드로 매핑하는 부분에서 `name` 관련 매핑 코드를 삭제.

- [ ] **Step 5: 빌드 확인**

```bash
cd backend && bun run build
```

Expected: 오류 없음.

- [ ] **Step 6: Commit**

```bash
git add backend/src/oauth/authorize/authorize.service.ts \
        backend/src/external-auth/external-auth.service.ts
git commit -m "feat: remove name field from authorize and external-auth services"
```

---

## Task 5: 프론트엔드 API 타입 수정

**Files:**
- Modify: `frontend/src/api/users.ts`

- [ ] **Step 1: User 인터페이스에서 name 제거**

```typescript
// 수정 전
export interface User {
  id: string;
  tenantId: string;
  email: string;
  name: string | null;   // ← 삭제
  ...
}
```

- [ ] **Step 2: CreateUserPayload에서 name 제거**

```typescript
// 수정 전
export interface CreateUserPayload {
  email: string;
  name?: string;   // ← 삭제
  password?: string;
  ...
}
```

- [ ] **Step 3: UpdateUserPayload에서 name 제거**

```typescript
// 수정 전
export interface UpdateUserPayload {
  name?: string | null;   // ← 삭제
  ...
}
```

- [ ] **Step 4: 타입 오류 확인**

```bash
cd frontend && bun run build
```

Expected: name 참조가 남은 Vue 파일에서 오류. 다음 Task에서 수정.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/users.ts
git commit -m "feat: remove name field from frontend User API types"
```

---

## Task 6: 프론트엔드 Vue 화면 수정

**Files:**
- Modify: `frontend/src/views/tenant/users/UserListView.vue`
- Modify: `frontend/src/views/tenant/users/UserCreateView.vue`
- Modify: `frontend/src/views/tenant/users/UserEditView.vue`
- Modify: `frontend/src/views/tenant/users/UserDetailView.vue`
- Modify: `frontend/src/views/tenant/audit/AuditLogView.vue`

- [ ] **Step 1: UserListView.vue — 이름 컬럼 및 검색 placeholder 수정**

테이블 헤더에서 이름 컬럼 제거:
```html
<!-- 삭제 -->
<th>이름</th>
```

테이블 바디에서 이름 셀 제거:
```html
<!-- 삭제 -->
<td>{{ user.name ?? '—' }}</td>
```

검색 input의 placeholder 수정:
```html
<!-- 수정 전 -->
placeholder="이메일 또는 이름으로 검색"

<!-- 수정 후 -->
placeholder="이메일로 검색"
```

- [ ] **Step 2: UserCreateView.vue — name 입력 필드 제거**

script에서:
```typescript
// 삭제
const name = ref('')
```

template에서 이름 입력 블록 전체 삭제:
```html
<!-- 삭제 -->
<div>
  <label>이름</label>
  <input v-model="name" placeholder="홍길동" ... />
</div>
```

submit 함수에서:
```typescript
// 수정 전
{ name: name.value || undefined, email: email.value, ... }

// 수정 후
{ email: email.value, ... }
```

- [ ] **Step 3: UserEditView.vue — name 입력 필드 제거**

script에서:
```typescript
// 삭제
const name = ref('')
// 삭제
name.value = user.name ?? ''
```

template에서 이름 입력 블록 전체 삭제.

submit 함수에서:
```typescript
// 수정 전
{ name: name.value === '' ? null : name.value, ... }

// 수정 후
{ ... }  // name 키 제거
```

- [ ] **Step 4: UserDetailView.vue — name 표시 제거**

```html
<!-- 삭제 -->
<dd>{{ user.name ?? '—' }}</dd>
```
(해당 dt 태그도 함께 삭제)

- [ ] **Step 5: AuditLogView.vue — name fallback 단순화**

```typescript
// 수정 전
adminMap.value[log.actorId]?.name ?? adminMap.value[log.actorId]?.email ?? log.actorId

// 수정 후
adminMap.value[log.actorId]?.email ?? log.actorId
```

동일한 패턴을 actorId, targetId 관련 4곳 모두 적용.

- [ ] **Step 6: 빌드 확인**

```bash
cd frontend && bun run build
```

Expected: 오류 없음.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/views/tenant/users/ frontend/src/views/tenant/audit/AuditLogView.vue
git commit -m "feat: remove name field from all user-related frontend views"
```

---

## Task 7: 최종 검증

- [ ] **Step 1: 백엔드 서버 실행**

```bash
cd backend && bun run start:dev
```

Expected: 오류 없이 시작됨 (port 3000).

- [ ] **Step 2: 프론트엔드 서버 실행**

```bash
cd frontend && bun run dev
```

Expected: 오류 없이 시작됨 (port 5173).

- [ ] **Step 3: 수동 검증 체크리스트**

브라우저에서 확인:
- [ ] `/admin/tenants/:tenantId/users` — 목록에 이름 컬럼 없음, 이메일 검색 동작
- [ ] `/admin/tenants/:tenantId/users/new` — 생성 폼에 이름 입력 없음, 저장 성공
- [ ] `/admin/tenants/:tenantId/users/:userId` — 상세 화면에 이름 표시 없음
- [ ] `/admin/tenants/:tenantId/users/:userId/edit` — 편집 폼에 이름 없음, 저장 성공
- [ ] `/admin/tenants/:tenantId/audit` — 감사 로그에 액터/타겟이 이메일로 표시

- [ ] **Step 4: name 참조 잔존 여부 최종 확인**

```bash
grep -r "user\.name\b" backend/src frontend/src --include="*.ts" --include="*.vue" \
  | grep -v "admin" \
  | grep -v "client\.name" \
  | grep -v "scope\.name"
```

Expected: 출력 없음 (잔여 참조 없음).

- [ ] **Step 5: 최종 Commit**

```bash
git add -A
git commit -m "chore: finalize user.name removal - all checks passed"
```
