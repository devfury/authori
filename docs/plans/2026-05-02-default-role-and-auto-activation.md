# 기본 역할 및 회원가입 자동 활성화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 테넌트 관리자가 기본 역할과 회원가입 자동 활성화를 설정하고, 공개 회원가입으로 생성된 사용자에게 해당 설정을 자동 적용한다.

**Architecture:** `tenant_roles.is_default`와 `tenant_settings.auto_activate_registration` 컬럼을 추가한다. 역할 기본값 UI는 기존 OAuth2 스코프의 `isDefault` 목록/폼 UX를 그대로 따르고, 회원가입 저장 직후 `RbacService`가 기본 역할을 `user_roles`에 부여한다.

**Tech Stack:** NestJS, TypeORM migrations/entities, Vue 3 Composition API, Axios API wrappers, Vitest/e2e where practical.

---

## Current Code Map

- Graphify 핵심 노드: `RbacService`, `UsersService`, `RbacController`, `ScopesService`, `AuthorizeService`.
- 기본값 UX 참고: `frontend/src/views/tenant/scopes/ScopeListView.vue`, `frontend/src/views/tenant/scopes/ScopeFormDialog.vue`.
- 역할 관리 UI/API: `frontend/src/views/tenant/rbac/RoleListView.vue`, `frontend/src/views/tenant/rbac/RoleFormDialog.vue`, `frontend/src/api/rbac.ts`.
- 역할 백엔드: `backend/src/database/entities/tenant-role.entity.ts`, `backend/src/rbac/dto/create-role.dto.ts`, `backend/src/rbac/dto/update-role.dto.ts`, `backend/src/rbac/rbac.service.ts`.
- 회원가입 설정: `backend/src/database/entities/tenant-settings.entity.ts`, `backend/src/tenants/dto/create-tenant.dto.ts`, `frontend/src/views/platform/tenants/TenantDetailView.vue`, `frontend/src/api/tenants.ts`.
- 공개 회원가입 처리: `backend/src/oauth/authorize/authorize.service.ts`의 `register()`.

## Scope Decisions

- 기본 역할은 여러 개 허용한다. OAuth2 스코프의 기본값 UX가 다중 기본값 모델이므로 역할도 동일하게 처리한다.
- 자동 활성화는 공개 회원가입에만 적용한다. 관리자 사용자 생성(`UsersService.create`)의 기본 상태 동작은 변경하지 않는다.
- 기본 역할이 없으면 회원가입은 정상 완료되고 역할 부여만 생략한다.
- `isDefault` 역할 삭제는 허용한다. 삭제 시 FK cascade로 기존 사용자 역할 매핑은 제거되며, 이후 신규 가입자에게는 더 이상 부여되지 않는다.

## Files

- Create: `backend/src/database/migrations/1777200000000-AddDefaultRolesAndAutoActivation.ts`
- Modify: `backend/src/database/entities/tenant-role.entity.ts`
- Modify: `backend/src/database/entities/tenant-settings.entity.ts`
- Modify: `backend/src/rbac/dto/create-role.dto.ts`
- Modify: `backend/src/rbac/dto/update-role.dto.ts`
- Modify: `backend/src/rbac/rbac.service.ts`
- Modify: `backend/src/oauth/authorize/authorize.module.ts`
- Modify: `backend/src/oauth/authorize/authorize.service.ts`
- Modify: `backend/src/tenants/dto/create-tenant.dto.ts`
- Modify: `frontend/src/api/rbac.ts`
- Modify: `frontend/src/api/tenants.ts`
- Modify: `frontend/src/views/tenant/rbac/RoleListView.vue`
- Modify: `frontend/src/views/tenant/rbac/RoleFormDialog.vue`
- Modify: `frontend/src/views/platform/tenants/TenantDetailView.vue`
- Test: `backend/test/app.e2e-spec.ts` or a new focused `backend/test/registration-default-role.e2e-spec.ts`
- Test: `frontend/src/App.spec.ts` can remain smoke-only; add component tests only if a frontend test harness for routed views is added later.

---

### Task 1: Database Schema

**Files:**
- Create: `backend/src/database/migrations/1777200000000-AddDefaultRolesAndAutoActivation.ts`
- Modify: `backend/src/database/entities/tenant-role.entity.ts`
- Modify: `backend/src/database/entities/tenant-settings.entity.ts`

- [ ] **Step 1: Create migration**

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDefaultRolesAndAutoActivation1777200000000
  implements MigrationInterface
{
  name = 'AddDefaultRolesAndAutoActivation1777200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_roles"
      ADD COLUMN "is_default" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_settings"
      ADD COLUMN "auto_activate_registration" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_settings"
      DROP COLUMN "auto_activate_registration"
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_roles"
      DROP COLUMN "is_default"
    `);
  }
}
```

- [ ] **Step 2: Update `TenantRole` entity**

Add this field after `description`:

```ts
  @Column({ name: 'is_default', default: false })
  isDefault: boolean;
```

- [ ] **Step 3: Update `TenantSettings` entity**

Add this field after `allowRegistration`:

```ts
  /** 공개 회원가입으로 생성된 사용자를 즉시 활성화할지 여부 */
  @Column({ name: 'auto_activate_registration', default: false })
  autoActivateRegistration: boolean;
```

- [ ] **Step 4: Run backend type check**

Run:

```bash
cd backend && bunx tsc --noEmit
```

Expected: PASS.

---

### Task 2: Role DTO and Service Support

**Files:**
- Modify: `backend/src/rbac/dto/create-role.dto.ts`
- Modify: `backend/src/rbac/dto/update-role.dto.ts`
- Modify: `backend/src/rbac/rbac.service.ts`

- [ ] **Step 1: Add `isDefault` to role DTOs**

In `create-role.dto.ts`, import `IsBoolean` and add:

```ts
  @ApiPropertyOptional({
    description: '회원가입 사용자에게 자동 부여할 기본 역할 여부',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
```

In `update-role.dto.ts`, import `IsBoolean` and add:

```ts
  @ApiPropertyOptional({
    description: '회원가입 사용자에게 자동 부여할 기본 역할 여부',
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
```

- [ ] **Step 2: Persist `isDefault` in `RbacService.createRole()`**

Use an explicit field assignment so undefined becomes false:

```ts
return this.roleRepo.save(
  this.roleRepo.create({
    tenantId,
    name: dto.name,
    displayName: dto.displayName,
    description: dto.description ?? null,
    isDefault: dto.isDefault ?? false,
  }),
);
```

- [ ] **Step 3: Persist `isDefault` in `RbacService.updateRole()`**

Add after description handling:

```ts
if (dto.isDefault !== undefined) role.isDefault = dto.isDefault;
```

- [ ] **Step 4: Sort default roles first**

Update `findRoles()` order:

```ts
order: { isDefault: 'DESC', name: 'ASC' },
```

- [ ] **Step 5: Add default-role assignment helper**

Add this method to `RbacService`:

```ts
async assignDefaultRolesToUser(
  tenantId: string,
  userId: string,
): Promise<TenantRole[]> {
  await this.assertUserBelongsToTenant(tenantId, userId);

  const defaultRoles = await this.roleRepo.find({
    where: { tenantId, isDefault: true },
    order: { name: 'ASC' },
  });

  if (defaultRoles.length === 0) return [];

  await this.userRoleRepo
    .createQueryBuilder()
    .insert()
    .into(UserRole)
    .values(defaultRoles.map((role) => ({ userId, roleId: role.id })))
    .orIgnore()
    .execute();

  return defaultRoles;
}
```

- [ ] **Step 6: Run backend type check**

Run:

```bash
cd backend && bunx tsc --noEmit
```

Expected: PASS.

---

### Task 3: Registration Behavior

**Files:**
- Modify: `backend/src/oauth/authorize/authorize.module.ts`
- Modify: `backend/src/oauth/authorize/authorize.service.ts`

- [ ] **Step 1: Import `RbacModule` into `AuthorizeModule`**

Add:

```ts
import { RbacModule } from '../../rbac/rbac.module';
```

Then include `RbacModule` in `imports`.

- [ ] **Step 2: Inject `RbacService`**

Add:

```ts
import { RbacService } from '../../rbac/rbac.service';
```

Then add the constructor dependency after `scopesService`:

```ts
private readonly rbacService: RbacService,
```

- [ ] **Step 3: Apply auto activation and default roles in `register()`**

Replace the fixed `UserStatus.INACTIVE` initial status with:

```ts
const initialStatus = settings.autoActivateRegistration
  ? UserStatus.ACTIVE
  : UserStatus.INACTIVE;
```

Then pass `initialStatus`.

After `usersService.create(...)` succeeds, add:

```ts
await this.rbacService.assignDefaultRolesToUser(tenantId, savedUser.id);
```

The resulting registration path must create an active user only when both `allowRegistration` is true and `autoActivateRegistration` is true.

- [ ] **Step 4: Run backend type check**

Run:

```bash
cd backend && bunx tsc --noEmit
```

Expected: PASS.

---

### Task 4: Tenant Settings API Contract

**Files:**
- Modify: `backend/src/tenants/dto/create-tenant.dto.ts`
- Modify: `frontend/src/api/tenants.ts`
- Modify: `frontend/src/views/platform/tenants/TenantDetailView.vue`

- [ ] **Step 1: Add `autoActivateRegistration` to backend settings DTO**

Add to `CreateTenantSettingsDto`:

```ts
  @ApiPropertyOptional({
    description: 'OAuth 공개 회원가입 시 사용자 자동 활성화 여부',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  autoActivateRegistration?: boolean;
```

- [ ] **Step 2: Add frontend tenant API fields**

Add to `TenantSettings`:

```ts
autoActivateRegistration: boolean
```

Add to `UpdateTenantPayload.settings`:

```ts
autoActivateRegistration?: boolean
```

- [ ] **Step 3: Send setting from `TenantDetailView.vue`**

Add to `saveSettings()` payload:

```ts
autoActivateRegistration: tenant.value.settings.autoActivateRegistration,
```

- [ ] **Step 4: Add checkbox to the right of `회원가입 허용`**

Change the checkbox row so `자동 활성화` appears immediately after `회원가입 허용`:

```vue
<label class="flex items-center gap-2 cursor-pointer">
  <input v-model="tenant.settings.allowRegistration" type="checkbox" class="rounded" />
  <span class="text-sm text-gray-700">회원가입 허용</span>
</label>
<label class="flex items-center gap-2 cursor-pointer">
  <input
    v-model="tenant.settings.autoActivateRegistration"
    type="checkbox"
    class="rounded"
    :disabled="!tenant.settings.allowRegistration"
  />
  <span class="text-sm text-gray-700">자동 활성화</span>
</label>
```

- [ ] **Step 5: Reset disabled auto activation before save**

At the start of `saveSettings()`, before sending the request:

```ts
if (!tenant.value.settings.allowRegistration) {
  tenant.value.settings.autoActivateRegistration = false;
}
```

This prevents an invisible active state when public registration is disabled.

---

### Task 5: Role Management UI Contract

**Files:**
- Modify: `frontend/src/api/rbac.ts`
- Modify: `frontend/src/views/tenant/rbac/RoleListView.vue`
- Modify: `frontend/src/views/tenant/rbac/RoleFormDialog.vue`

- [ ] **Step 1: Add `isDefault` to role API types**

Add to `Role`:

```ts
isDefault: boolean
```

Add to `CreateRolePayload` and `UpdateRolePayload`:

```ts
isDefault?: boolean
```

- [ ] **Step 2: Show default column in role list**

Import `CheckCircle2` from `lucide-vue-next`, add a `기본값` header before `생성일`, then add:

```vue
<td class="px-4 py-3 text-center">
  <CheckCircle2 v-if="role.isDefault" class="w-4 h-4 text-green-500 mx-auto" />
</td>
```

- [ ] **Step 3: Add default checkbox state to role form**

Add:

```ts
const isDefault = ref(false)
```

When editing:

```ts
isDefault.value = props.role.isDefault
```

When creating:

```ts
isDefault.value = false
```

- [ ] **Step 4: Submit default flag**

For update:

```ts
await rbacApi.updateRole(props.tenantId, props.role.id, {
  displayName: displayName.value,
  description: description.value,
  isDefault: isDefault.value,
})
```

For create:

```ts
await rbacApi.createRole(props.tenantId, {
  name: name.value,
  displayName: displayName.value,
  description: description.value,
  isDefault: isDefault.value,
})
```

- [ ] **Step 5: Add checkbox UI matching OAuth2 scope form**

Add below description:

```vue
<div class="flex items-start">
  <div class="flex items-center h-5">
    <input
      id="isDefaultRole"
      v-model="isDefault"
      type="checkbox"
      class="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
    />
  </div>
  <div class="ml-3 text-sm">
    <label for="isDefaultRole" class="font-medium text-gray-700">기본 역할</label>
    <p class="text-gray-500">회원가입 사용자에게 자동으로 부여됩니다.</p>
  </div>
</div>
```

---

### Task 6: Backend E2E Coverage

**Files:**
- Test: `backend/test/registration-default-role.e2e-spec.ts`

- [ ] **Step 1: Add an e2e test file for registration defaults**

Use the existing e2e setup style from `backend/test/app.e2e-spec.ts` and `backend/test/m2m-rbac.e2e-spec.ts`. The important assertions are:

```ts
expect(createdUser.status).toBe(UserStatus.ACTIVE);
expect(userRoles.map((role) => role.name).sort()).toEqual([
  'member',
  'viewer',
]);
```

- [ ] **Step 2: Test inactive default when auto activation is false**

Create tenant settings with:

```ts
allowRegistration: true,
autoActivateRegistration: false,
```

Register a user and assert:

```ts
expect(createdUser.status).toBe(UserStatus.INACTIVE);
```

- [ ] **Step 3: Test default role assignment**

Create two roles with `isDefault: true` and one with `isDefault: false`, register a user, then query `user_roles` joined to `tenant_roles`. Assert only default roles were assigned.

- [ ] **Step 4: Test registration still works with no default roles**

Register a user in a tenant with no `isDefault` roles and assert the response is `201` or the current registration success status, with zero `user_roles` rows.

- [ ] **Step 5: Run e2e tests**

Run:

```bash
cd backend && bun test --config test/jest-e2e.json registration-default-role.e2e-spec.ts
```

Expected: PASS. If the project uses npm for e2e in this environment, run the equivalent `npm run test:e2e -- registration-default-role.e2e-spec.ts`.

---

### Task 7: Verification and Graph Update

**Files:**
- Generated graph files under `graphify-out/`

- [ ] **Step 1: Run full backend checks**

Run:

```bash
cd backend && bunx tsc --noEmit
cd backend && bun test
```

Expected: PASS.

- [ ] **Step 2: Run frontend checks**

Run:

```bash
cd frontend && bunx vue-tsc --noEmit
cd frontend && bun run build
```

Expected: PASS.

- [ ] **Step 3: Update graphify after code changes**

Run from repo root:

```bash
graphify update .
```

Expected: graph update completes without API cost.

## Acceptance Criteria

- [ ] 역할 목록에서 기본값 여부가 보인다.
- [ ] 역할 생성/수정 모달에서 기본 역할 체크박스를 설정할 수 있다.
- [ ] 역할 API 응답과 생성/수정 요청이 `isDefault`를 포함한다.
- [ ] 회원가입 시 `isDefault = true` 역할이 신규 사용자에게 부여된다.
- [ ] 테넌트 설정의 `회원가입 허용` 오른쪽에 `자동 활성화` 체크박스가 있다.
- [ ] `자동 활성화`가 켜진 테넌트의 공개 회원가입 사용자는 `ACTIVE`로 생성된다.
- [ ] `자동 활성화`가 꺼진 테넌트의 공개 회원가입 사용자는 기존처럼 `INACTIVE`로 생성된다.
- [ ] `allowRegistration = false`이면 기존처럼 공개 회원가입이 `registration_disabled`로 거절된다.
