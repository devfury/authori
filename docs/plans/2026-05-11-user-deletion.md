# User Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `DELETE /admin/tenants/:tenantId/users/:id` 엔드포인트를 실제 Hard Delete로 변경하고, 관련 OAuth 데이터(토큰, 콤센트, 인가코드)를 트랜잭션으로 함께 삭제한다.

**Architecture:** 서비스 레이어에서 단일 트랜잭션으로 Consent → AccessToken → RefreshToken → AuthorizationCode → User 순서로 삭제한다. `dataSource.transaction` 패턴을 기존 코드와 동일하게 사용하며 `manager.delete()` 로 각 엔티티를 처리한다. 트랜잭션 커밋 후 `USER.DELETED` 감사 로그를 기록한다.

**Tech Stack:** NestJS, TypeORM, Vue 3, TypeScript

---

### Task 1: AuditAction에 USER_DELETED 추가

**Files:**
- Modify: `backend/src/database/entities/audit-log.entity.ts`
- Test: `backend/src/users/users.service.spec.ts`

- [ ] **Step 1: 실패 테스트 작성**

`backend/src/users/users.service.spec.ts` 파일 끝(316번째 줄 `});` 앞)에 추가:

```typescript
  it('AuditAction has USER_DELETED value', () => {
    expect(AuditAction.USER_DELETED).toBe('USER.DELETED');
  });
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd backend && bun run test --testPathPattern=users.service.spec
```

Expected: `expect(received).toBe(expected)` — `AuditAction.USER_DELETED` is undefined

- [ ] **Step 3: AuditAction에 USER_DELETED 추가**

`backend/src/database/entities/audit-log.entity.ts`의 `USER_UNLOCKED = 'USER.UNLOCKED',` 다음 줄에 추가:

```typescript
  USER_DELETED = 'USER.DELETED',
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd backend && bun run test --testPathPattern=users.service.spec
```

Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add backend/src/database/entities/audit-log.entity.ts backend/src/users/users.service.spec.ts
git commit -m "feat: add USER_DELETED audit action"
```

---

### Task 2: UsersService.delete() 구현

**Files:**
- Modify: `backend/src/users/users.service.ts`
- Test: `backend/src/users/users.service.spec.ts`

- [ ] **Step 1: 실패 테스트 작성**

`backend/src/users/users.service.spec.ts`의 `describe('unlock', ...)` 블록 뒤에 새 describe 블록 추가:

```typescript
  describe('delete', () => {
    let userRepoMock: { findOne: jest.Mock };
    let auditSvc: { record: jest.Mock };
    let dataSource: { transaction: jest.Mock };
    let managerMock: { delete: jest.Mock; remove: jest.Mock };

    const userToDelete = {
      id: userId,
      tenantId,
      email: 'lee@example.com',
      status: UserStatus.ACTIVE,
      failedLoginAttempts: 0,
      lockedUntil: null,
      profile: { profileJsonb: {} },
    };

    beforeEach(() => {
      userRepoMock = {
        findOne: jest.fn().mockResolvedValue(structuredClone(userToDelete)),
      };
      auditSvc = { record: jest.fn().mockResolvedValue(undefined) };
      managerMock = {
        delete: jest.fn().mockResolvedValue(undefined),
        remove: jest.fn().mockResolvedValue(undefined),
      };
      dataSource = {
        transaction: jest.fn().mockImplementation(async (cb) => cb(managerMock)),
      };

      service = new UsersService(
        userRepoMock as never,
        {} as never,
        dataSource as never,
        {} as never,
        auditSvc as never,
      );
    });

    it('deletes Consent, AccessToken, RefreshToken, AuthorizationCode then User in a transaction', async () => {
      await service.delete(tenantId, userId);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(managerMock.delete).toHaveBeenCalledTimes(4);
      expect(managerMock.remove).toHaveBeenCalledTimes(1);
    });

    it('records USER_DELETED audit event after transaction', async () => {
      await service.delete(tenantId, userId, {
        actorId: 'admin-1',
        actorType: 'admin',
        ipAddress: '10.0.0.1',
        userAgent: 'test-agent',
        requestId: 'req-1',
      });

      expect(auditSvc.record).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          action: AuditAction.USER_DELETED,
          targetType: 'user',
          targetId: userId,
          metadata: { email: 'lee@example.com' },
          actorId: 'admin-1',
        }),
      );
    });

    it('throws NotFoundException when user does not exist', async () => {
      userRepoMock.findOne.mockResolvedValue(null);

      await expect(service.delete(tenantId, userId)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd backend && bun run test --testPathPattern=users.service.spec
```

Expected: FAIL — `service.delete is not a function`

- [ ] **Step 3: UsersService에 delete() 구현**

`backend/src/users/users.service.ts`에서 import 줄을 수정:

```typescript
import {
  AuditAction,
  AuthorizationCode,
  AccessToken,
  Consent,
  RefreshToken,
  User,
  UserProfile,
  UserStatus,
} from '../database/entities';
```

그 다음 `unlock()` 메서드 뒤에 추가:

```typescript
  async delete(
    tenantId: string,
    id: string,
    ctx?: AuditContext,
  ): Promise<void> {
    const user = await this.findOne(tenantId, id);

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(Consent, { tenantId, userId: id });
      await manager.delete(AccessToken, { tenantId, userId: id });
      await manager.delete(RefreshToken, { tenantId, userId: id });
      await manager.delete(AuthorizationCode, { tenantId, userId: id });
      await manager.remove(User, user);
    });

    await this.auditService.record({
      tenantId,
      action: AuditAction.USER_DELETED,
      targetType: 'user',
      targetId: id,
      metadata: { email: user.email },
      ...ctx,
    });
  }
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd backend && bun run test --testPathPattern=users.service.spec
```

Expected: PASS (전체 테스트 통과)

- [ ] **Step 5: 커밋**

```bash
git add backend/src/users/users.service.ts backend/src/users/users.service.spec.ts
git commit -m "feat: implement UsersService.delete() with transactional cascade"
```

---

### Task 3: UsersController DELETE 핸들러 변경

**Files:**
- Modify: `backend/src/users/users.controller.ts`

- [ ] **Step 1: DELETE 핸들러를 delete()로 변경**

`backend/src/users/users.controller.ts`의 `@Delete(':id')` 핸들러 전체를 교체:

```typescript
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '사용자 영구 삭제' })
  remove(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.usersService.delete(tenantId, id, {
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
cd backend && bun run build 2>&1 | tail -5
```

Expected: 오류 없이 빌드 성공

- [ ] **Step 3: 커밋**

```bash
git add backend/src/users/users.controller.ts
git commit -m "feat: wire DELETE /users/:id to UsersService.delete()"
```

---

### Task 4: 프론트엔드 API 클라이언트 수정

**Files:**
- Modify: `frontend/src/api/users.ts`

- [ ] **Step 1: deactivate()를 PATCH로 변경하고 delete() 추가**

`frontend/src/api/users.ts`의 `usersApi` 객체에서 `deactivate` 메서드를 교체하고 `delete`를 추가:

```typescript
  deactivate(tenantId: string, userId: string) {
    return http.patch(`/admin/tenants/${tenantId}/users/${userId}`, { status: 'INACTIVE' })
  },
  delete(tenantId: string, userId: string) {
    return http.delete(`/admin/tenants/${tenantId}/users/${userId}`)
  },
```

- [ ] **Step 2: 타입 체크**

```bash
cd frontend && bun run build 2>&1 | tail -5
```

Expected: 오류 없이 빌드 성공

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/api/users.ts
git commit -m "feat: add usersApi.delete(), change deactivate() to PATCH"
```

---

### Task 5: UserDetailView에 삭제 버튼 및 확인 다이얼로그 추가

**Files:**
- Modify: `frontend/src/views/tenant/users/UserDetailView.vue`

- [ ] **Step 1: script setup에 router import 및 반응형 변수 추가**

`frontend/src/views/tenant/users/UserDetailView.vue`의 script setup 상단 import를 수정:

```typescript
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
```

`const route = useRoute()` 다음 줄에 추가:

```typescript
const router = useRouter()
```

`showPasswordDialog` ref 선언 다음 줄에 추가:

```typescript
const showDelete = ref(false)
```

- [ ] **Step 2: deleteUser 함수 추가**

`activate()` 함수 뒤에 추가:

```typescript
async function deleteUser() {
  await usersApi.delete(tenantId, userId)
  showDelete.value = false
  router.push({ name: 'user-list', params: { tenantId } })
}
```

- [ ] **Step 3: 삭제 버튼 추가**

`UserDetailView.vue` 템플릿의 기본 정보 카드 하단 버튼 영역 (`<div class="mt-5 pt-4 border-t border-gray-100 flex gap-3">`)에서 마지막 버튼 뒤에 삭제 버튼 추가:

```html
            <button
              class="px-4 py-2 text-sm border border-red-600 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors ml-auto"
              @click="showDelete = true"
            >
              영구 삭제
            </button>
```

- [ ] **Step 4: 삭제 확인 다이얼로그 추가**

기존 `ConfirmDialog`(activate용) 블록 뒤에 추가:

```html
    <ConfirmDialog
      :open="showDelete"
      title="사용자 영구 삭제"
      :message="`'${user?.email}' 사용자를 영구 삭제합니다. 이 작업은 되돌릴 수 없습니다.`"
      confirm-label="삭제"
      danger
      @confirm="deleteUser"
      @cancel="showDelete = false"
    />
```

- [ ] **Step 5: 개발 서버에서 동작 확인**

```bash
cd frontend && bun run dev
```

브라우저에서 `/admin/tenants/:tenantId/users/:userId` 페이지 접속 후:
1. "영구 삭제" 버튼이 표시되는지 확인
2. 버튼 클릭 시 확인 다이얼로그가 열리는지 확인
3. 취소 시 다이얼로그가 닫히는지 확인
4. 실제 삭제 후 사용자 목록으로 이동하는지 확인 (백엔드 실행 중일 때)

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/views/tenant/users/UserDetailView.vue
git commit -m "feat: add permanent delete button and confirmation dialog to UserDetailView"
```
