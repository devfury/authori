# Tenant Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 테넌트 관리 화면에서 테넌트를 영구 삭제(hard delete)할 수 있는 기능을 구현한다.

**Architecture:** 백엔드의 기존 `DELETE /admin/tenants/:id` 엔드포인트를 비활성화 대신 영구 삭제로 교체하고, 프론트엔드의 비활성화는 기존 PATCH 엔드포인트를 활용하도록 변경한다. 삭제 시 FK 제약 조건이 `ON DELETE NO ACTION`인 관련 데이터를 수동으로 올바른 순서로 삭제하는 트랜잭션을 사용한다.

**Tech Stack:** NestJS + TypeORM (queryRunner 직접 사용), Vue 3 + Pinia, PostgreSQL (ENUM 마이그레이션 필요)

---

## 삭제 순서 (FK 제약 근거)

DB FK 제약이 `ON DELETE NO ACTION`인 테이블들은 수동 삭제가 필요하다. CASCADE 테이블 (`tenant_scopes`, `tenant_roles`, `tenant_permissions`, `role_permissions`, `user_roles`)은 `tenants` 삭제 시 자동 삭제된다.

수동 삭제 순서:
1. `authorization_codes` (users + oauth_clients FK)
2. `access_tokens` (users + oauth_clients FK)
3. `refresh_tokens` (users + oauth_clients FK)
4. `consents` (users + oauth_clients FK)
5. `oauth_client_redirect_uris` (oauth_clients FK)
6. `oauth_clients` (tenants FK)
7. `user_profiles` (users + profile_schema_versions FK)
8. `users` (tenants FK)
9. `profile_schema_versions` (tenants FK)
10. `external_auth_providers` (tenants FK)
11. `signing_keys` (tenants FK)
12. `audit_logs` — tenant_id를 NULL로 설정 (기록 보존, nullable FK)
13. `tenant_settings` (tenants FK)
14. `tenants` — 삭제 (나머지 CASCADE 테이블 자동 처리)

---

## 파일 변경 목록

| 역할 | 파일 경로 |
|---|---|
| 수정 | `backend/src/database/entities/audit-log.entity.ts` |
| 생성 | `backend/src/database/migrations/1777000000000-AddTenantDeletedAuditAction.ts` |
| 수정 | `backend/src/tenants/tenants.service.ts` |
| 수정 | `backend/src/tenants/tenants.controller.ts` |
| 수정 | `frontend/src/api/tenants.ts` |
| 수정 | `frontend/src/views/platform/tenants/TenantListView.vue` |

---

## Task 1: AuditAction 열거형에 TENANT_DELETED 추가

**Files:**
- Modify: `backend/src/database/entities/audit-log.entity.ts:31-32`

- [ ] **Step 1: AuditAction 열거형에 값 추가**

`audit-log.entity.ts`의 `// 테넌트/클라이언트` 블록:

```typescript
  // 테넌트/클라이언트
  TENANT_CREATED = 'TENANT.CREATED',
  TENANT_UPDATED = 'TENANT.UPDATED',
  TENANT_DELETED = 'TENANT.DELETED',
  CLIENT_CREATED = 'CLIENT.CREATED',
  CLIENT_SECRET_ROTATED = 'CLIENT.SECRET_ROTATED',
```

- [ ] **Step 2: 마이그레이션 파일 생성**

`backend/src/database/migrations/1777000000000-AddTenantDeletedAuditAction.ts` 파일 생성:

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantDeletedAuditAction1777000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."audit_log_action_enum" ADD VALUE IF NOT EXISTS 'TENANT.DELETED'`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL은 ENUM 값 제거를 지원하지 않으므로 down은 no-op
  }
}
```

- [ ] **Step 3: 마이그레이션 실행**

```bash
cd backend
bun run migration:run
```

Expected: `AddTenantDeletedAuditAction1777000000000 has been executed successfully.`

- [ ] **Step 4: Commit**

```bash
git add backend/src/database/entities/audit-log.entity.ts \
        backend/src/database/migrations/1777000000000-AddTenantDeletedAuditAction.ts
git commit -m "feat: add TENANT_DELETED audit action and migration"
```

---

## Task 2: TenantsService에 deletePermanently 메서드 추가

**Files:**
- Modify: `backend/src/tenants/tenants.service.ts`

- [ ] **Step 1: `deletePermanently` 메서드 작성**

`tenants.service.ts`의 `deactivate` 메서드 아래에 추가:

```typescript
  async deletePermanently(id: string, ctx?: AuditContext): Promise<void> {
    const tenant = await this.findOne(id);

    await this.dataSource.transaction(async (manager) => {
      const qr = manager.queryRunner!;

      // 1. authorization_codes
      await qr.query(
        `DELETE FROM authorization_codes
         WHERE user_id IN (SELECT id FROM users WHERE tenant_id = $1)
            OR client_id IN (SELECT client_id FROM oauth_clients WHERE tenant_id = $1)`,
        [id],
      );

      // 2. access_tokens
      await qr.query(
        `DELETE FROM access_tokens
         WHERE user_id IN (SELECT id FROM users WHERE tenant_id = $1)
            OR client_id IN (SELECT client_id FROM oauth_clients WHERE tenant_id = $1)`,
        [id],
      );

      // 3. refresh_tokens
      await qr.query(
        `DELETE FROM refresh_tokens
         WHERE user_id IN (SELECT id FROM users WHERE tenant_id = $1)
            OR client_id IN (SELECT client_id FROM oauth_clients WHERE tenant_id = $1)`,
        [id],
      );

      // 4. consents
      await qr.query(
        `DELETE FROM consents
         WHERE user_id IN (SELECT id FROM users WHERE tenant_id = $1)
            OR client_id IN (SELECT client_id FROM oauth_clients WHERE tenant_id = $1)`,
        [id],
      );

      // 5. oauth_client_redirect_uris
      await qr.query(
        `DELETE FROM oauth_client_redirect_uris
         WHERE client_id IN (SELECT client_id FROM oauth_clients WHERE tenant_id = $1)`,
        [id],
      );

      // 6. oauth_clients
      await qr.query(`DELETE FROM oauth_clients WHERE tenant_id = $1`, [id]);

      // 7. user_profiles
      await qr.query(
        `DELETE FROM user_profiles
         WHERE user_id IN (SELECT id FROM users WHERE tenant_id = $1)`,
        [id],
      );

      // 8. users
      await qr.query(`DELETE FROM users WHERE tenant_id = $1`, [id]);

      // 9. profile_schema_versions
      await qr.query(`DELETE FROM profile_schema_versions WHERE tenant_id = $1`, [id]);

      // 10. external_auth_providers
      await qr.query(`DELETE FROM external_auth_providers WHERE tenant_id = $1`, [id]);

      // 11. signing_keys
      await qr.query(`DELETE FROM signing_keys WHERE tenant_id = $1`, [id]);

      // 12. audit_logs — tenant_id를 NULL로 설정 (기록 보존)
      await qr.query(`UPDATE audit_logs SET tenant_id = NULL WHERE tenant_id = $1`, [id]);

      // 13. tenant_settings
      await qr.query(`DELETE FROM tenant_settings WHERE tenant_id = $1`, [id]);

      // 14. tenants (tenant_scopes, tenant_roles, tenant_permissions은 CASCADE)
      await qr.query(`DELETE FROM tenants WHERE id = $1`, [id]);
    });

    // 트랜잭션 커밋 후 감사 로그 기록 (테넌트가 삭제됐으므로 tenantId는 null)
    await this.auditService.record({
      tenantId: null,
      action: AuditAction.TENANT_DELETED,
      targetType: 'tenant',
      targetId: id,
      metadata: { slug: tenant.slug, name: tenant.name },
      ...ctx,
    });
  }
```

> **주의:** `manager.queryRunner!`는 TypeORM이 트랜잭션 내에서 항상 queryRunner를 제공하므로 non-null assertion이 안전하다.

- [ ] **Step 2: 백엔드 빌드 확인 (타입 오류 없음)**

```bash
cd backend
bun run build 2>&1 | tail -20
```

Expected: 오류 없이 빌드 성공

- [ ] **Step 3: Commit**

```bash
git add backend/src/tenants/tenants.service.ts
git commit -m "feat(tenants): add deletePermanently with cascading hard delete"
```

---

## Task 3: TenantsController의 DELETE 엔드포인트를 영구 삭제로 교체

**Files:**
- Modify: `backend/src/tenants/tenants.controller.ts`

- [ ] **Step 1: `deactivate` 핸들러를 `deletePermanently`로 교체**

컨트롤러의 기존 `@Delete(':id')` 핸들러를 아래로 교체:

```typescript
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '테넌트 영구 삭제' })
  deletePermanently(@Param('id') id: string, @Req() req: Request) {
    return this.tenantsService.deletePermanently(id, {
      actorId: req.admin?.sub ?? null,
      actorType: req.admin ? 'admin' : null,
      ipAddress: req.ip ?? null,
      userAgent: (req.headers['user-agent'] as string) ?? null,
      requestId: (req.headers['x-request-id'] as string) ?? null,
    });
  }
```

- [ ] **Step 2: 빌드 확인**

```bash
cd backend
bun run build 2>&1 | tail -20
```

Expected: 오류 없이 빌드 성공

- [ ] **Step 3: 개발 서버에서 Swagger로 수동 검증**

```bash
cd backend
bun run start:dev
```

브라우저에서 `http://localhost:3000/docs` 접속 → `DELETE /admin/tenants/{id}` 엔드포인트 설명이 "테넌트 영구 삭제"로 표시되는지 확인

- [ ] **Step 4: Commit**

```bash
git add backend/src/tenants/tenants.controller.ts
git commit -m "feat(tenants): wire DELETE endpoint to permanent deletion"
```

---

## Task 4: Frontend API 클라이언트 수정

**Files:**
- Modify: `frontend/src/api/tenants.ts`

- [ ] **Step 1: `tenantsApi` 수정**

`tenants.ts`의 `tenantsApi` 객체에서 `deactivate`와 `delete` 메서드를 수정:

```typescript
export const tenantsApi = {
  findAll(query?: TenantListQuery) {
    return http.get<TenantPage>('/admin/tenants', { params: query })
  },
  findOne(id: string) {
    return http.get<Tenant>(`/admin/tenants/${id}`)
  },
  create(payload: CreateTenantPayload) {
    return http.post<Tenant>('/admin/tenants', payload)
  },
  update(id: string, payload: UpdateTenantPayload) {
    return http.patch<Tenant>(`/admin/tenants/${id}`, payload)
  },
  activate(id: string) {
    return http.patch<Tenant>(`/admin/tenants/${id}`, { status: TenantStatusValues.ACTIVE })
  },
  deactivate(id: string) {
    return http.patch<Tenant>(`/admin/tenants/${id}`, { status: TenantStatusValues.INACTIVE })
  },
  delete(id: string) {
    return http.delete(`/admin/tenants/${id}`)
  },
}
```

> **변경 이유:** 기존 `deactivate`는 `http.delete()`를 호출했는데, 이제 DELETE 엔드포인트는 영구 삭제를 수행한다. 비활성화는 이미 동작하는 PATCH + status 방식으로 변경한다.

- [ ] **Step 2: TypeScript 컴파일 확인**

```bash
cd frontend
bun run build 2>&1 | tail -20
```

Expected: 오류 없이 빌드 성공

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/tenants.ts
git commit -m "fix(api): deactivate uses PATCH, add delete() for permanent deletion"
```

---

## Task 5: TenantListView에 삭제 버튼 및 확인 다이얼로그 추가

**Files:**
- Modify: `frontend/src/views/platform/tenants/TenantListView.vue`

- [ ] **Step 1: `<script setup>` 수정**

기존 `deactivateTarget` ref 아래에 `deleteTarget` ref 추가, `confirmDelete` 함수 추가:

```typescript
const deleteTarget = ref<Tenant | null>(null)
```

`confirmDeactivate` 함수 아래에 추가:

```typescript
async function confirmDelete() {
  if (!deleteTarget.value) return
  await tenantsApi.delete(deleteTarget.value.id)
  deleteTarget.value = null
  await loadPage()
}
```

- [ ] **Step 2: 테이블 행 액션 열에 삭제 버튼 추가**

기존 비활성화 버튼 다음에 삭제 버튼 추가 (테이블 `<td class="px-4 py-3 text-right">` 내부):

```html
<td class="px-4 py-3 text-right">
  <RouterLink
    :to="`/admin/tenants/${tenant.id}/dashboard`"
    class="text-xs text-indigo-600 hover:underline mr-3"
  >
    관리
  </RouterLink>
  <button
    v-if="tenant.status !== TenantStatus.ACTIVE"
    class="text-xs text-green-600 hover:underline mr-3"
    @click="activate(tenant)"
  >
    활성화
  </button>
  <button
    v-if="tenant.status === TenantStatus.ACTIVE"
    class="text-xs text-red-500 hover:underline mr-3"
    @click="deactivateTarget = tenant"
  >
    비활성화
  </button>
  <button
    class="text-xs text-red-700 font-semibold hover:underline"
    @click="deleteTarget = tenant"
  >
    삭제
  </button>
</td>
```

- [ ] **Step 3: 삭제 확인 다이얼로그 추가**

기존 `<ConfirmDialog>` (비활성화용) 아래에 삭제용 다이얼로그 추가:

```html
<ConfirmDialog
  :open="!!deleteTarget"
  title="테넌트 영구 삭제"
  :message="`'${deleteTarget?.name}' 테넌트를 영구 삭제합니다. 이 작업은 되돌릴 수 없으며 테넌트의 모든 데이터(사용자, 클라이언트, 토큰 등)가 삭제됩니다. 계속하시겠습니까?`"
  confirm-label="영구 삭제"
  danger
  @confirm="confirmDelete"
  @cancel="deleteTarget = null"
/>
```

- [ ] **Step 4: 개발 서버 기동 후 UI 수동 검증**

```bash
cd frontend
bun run dev
```

브라우저에서 `http://localhost:5173/admin/tenants` 접속 후 확인:
1. 각 테넌트 행에 "삭제" 버튼이 표시되는지
2. "삭제" 클릭 시 확인 다이얼로그가 표시되는지
3. "취소" 클릭 시 다이얼로그가 닫히는지
4. "영구 삭제" 클릭 시 테넌트가 목록에서 사라지는지
5. "비활성화" 버튼이 여전히 동작하는지 (PATCH 방식으로 상태 변경)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/platform/tenants/TenantListView.vue
git commit -m "feat(ui): add tenant permanent delete button and confirmation dialog"
```

---

## 자가 검토 체크리스트

- [ ] AuditAction.TENANT_DELETED가 `audit-log.entity.ts`에 정의되어 있고 마이그레이션에 포함됨
- [ ] `deletePermanently`가 올바른 순서로 관련 데이터를 삭제함
- [ ] `audit_logs.tenant_id`는 삭제하지 않고 NULL로 설정하여 감사 기록을 보존함
- [ ] 컨트롤러가 AuditContext를 `deletePermanently`에 전달함
- [ ] 프론트엔드의 `deactivate()`가 PATCH를 사용하도록 변경됨
- [ ] 삭제 확인 다이얼로그 메시지가 비가역적 작업임을 명확히 경고함
- [ ] 기존 "비활성화" 기능이 계속 동작함
