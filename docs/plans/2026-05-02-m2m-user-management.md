# M2M 사용자 관리 API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** M2M(client_credentials) 클라이언트가 `users:read` / `users:write` 스코프로 사용자 목록 조회·활성화·비활성화·잠금·해제를 수행할 수 있는 API 엔드포인트를 추가한다.

**Architecture:** 기존 `m2m-rbac.controller.ts` 패턴(OAuthAccessTokenGuard + ScopeGuard, prefix `t/:tenantSlug/api`)을 그대로 따르는 신규 `m2m-users.controller.ts`를 `rbac/` 디렉터리에 생성. 사용자 목록 조회는 `UsersService.findAll()`(이미 roles·status·pagination 지원)을 재사용하고, lock/unlock은 `UsersService`에 메서드를 신규 추가한다.

**Tech Stack:** NestJS, TypeORM, bun test (Jest 호환)

---

## File Map

| 작업 | 파일 |
|---|---|
| Modify | `backend/src/database/entities/audit-log.entity.ts` |
| Modify | `backend/src/users/users.service.ts` |
| Modify | `backend/src/users/users.service.spec.ts` |
| Create | `backend/src/rbac/m2m-users.controller.ts` |
| Create | `backend/src/rbac/m2m-users.controller.spec.ts` |
| Modify | `backend/src/rbac/rbac.module.ts` |

---

## API 엔드포인트 요약

| Method | Path | Scope | 설명 |
|---|---|---|---|
| GET | `/t/:tenantSlug/api/users` | `users:read` | 사용자 목록 (역할·상태 포함, 페이징) |
| POST | `/t/:tenantSlug/api/users/:userId/activate` | `users:write` | 사용자 활성화 |
| POST | `/t/:tenantSlug/api/users/:userId/deactivate` | `users:write` | 사용자 비활성화 |
| POST | `/t/:tenantSlug/api/users/:userId/lock` | `users:write` | 계정 잠금 |
| POST | `/t/:tenantSlug/api/users/:userId/unlock` | `users:write` | 계정 잠금 해제 |

---

### Task 1: USER_UNLOCKED AuditAction 추가

**Files:**
- Modify: `backend/src/database/entities/audit-log.entity.ts` (현재 29번째 줄 `USER_LOCKED` 바로 다음)

- [ ] **Step 1: Write the failing test**

`backend/src/users/users.service.spec.ts` 파일 맨 아래에 추가 (Task 2에서 완성하지만 미리 작성해둔다):

```typescript
it('unlock records USER_UNLOCKED audit action', async () => {
  const auditSvc = { record: jest.fn().mockResolvedValue(undefined) };
  const repo = {
    findOne: jest.fn().mockResolvedValue({
      ...user,
      status: UserStatus.LOCKED,
      failedLoginAttempts: 3,
      lockedUntil: new Date(),
    }),
    save: jest.fn().mockImplementation(async (u: unknown) => u),
  };
  const svc = new UsersService(
    repo as never,
    {} as never,
    {} as never,
    {} as never,
    auditSvc as never,
  );

  await svc.unlock(tenantId, userId);

  expect(auditSvc.record).toHaveBeenCalledWith(
    expect.objectContaining({ action: AuditAction.USER_UNLOCKED }),
  );
});
```

파일 상단 import에 `AuditAction`이 없다면 추가:
```typescript
import { AuditAction, UserStatus } from '../database/entities';
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && bun run test src/users/users.service.spec.ts
```
Expected: FAIL — `svc.unlock is not a function` (또는 `USER_UNLOCKED` 없음)

- [ ] **Step 3: Add USER_UNLOCKED to AuditAction**

`backend/src/database/entities/audit-log.entity.ts` 의 `USER_LOCKED = 'USER.LOCKED',` 다음 줄에 추가:

```typescript
  USER_UNLOCKED = 'USER.UNLOCKED',
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/database/entities/audit-log.entity.ts
git commit -m "feat: add USER_UNLOCKED audit action"
```

---

### Task 2: UsersService에 lock / unlock 메서드 추가

**Files:**
- Modify: `backend/src/users/users.service.ts`
- Modify: `backend/src/users/users.service.spec.ts`

- [ ] **Step 1: Write failing tests**

`backend/src/users/users.service.spec.ts` 에서 Task 1에서 추가한 테스트를 포함하여 아래 블록으로 교체·확장한다 (기존 describe 블록 바깥, 파일 끝에 추가):

```typescript
describe('lock', () => {
  let userRepoMock: { findOne: jest.Mock; save: jest.Mock };
  let auditSvc: { record: jest.Mock };

  beforeEach(() => {
    userRepoMock = {
      findOne: jest.fn().mockResolvedValue({ ...user }),
      save: jest.fn().mockImplementation(async (u: unknown) => u),
    };
    auditSvc = { record: jest.fn().mockResolvedValue(undefined) };
    service = new UsersService(
      userRepoMock as never,
      {} as never,
      {} as never,
      {} as never,
      auditSvc as never,
    );
  });

  it('sets status to LOCKED', async () => {
    await service.lock(tenantId, userId);
    expect(userRepoMock.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: UserStatus.LOCKED }),
    );
  });

  it('records USER_LOCKED audit action', async () => {
    await service.lock(tenantId, userId);
    expect(auditSvc.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.USER_LOCKED }),
    );
  });

  it('throws NotFoundException when user not found', async () => {
    userRepoMock.findOne.mockResolvedValue(null);
    await expect(service.lock(tenantId, userId)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('unlock', () => {
  let userRepoMock: { findOne: jest.Mock; save: jest.Mock };
  let auditSvc: { record: jest.Mock };

  beforeEach(() => {
    userRepoMock = {
      findOne: jest.fn().mockResolvedValue({
        ...user,
        status: UserStatus.LOCKED,
        failedLoginAttempts: 5,
        lockedUntil: new Date('2026-06-01'),
      }),
      save: jest.fn().mockImplementation(async (u: unknown) => u),
    };
    auditSvc = { record: jest.fn().mockResolvedValue(undefined) };
    service = new UsersService(
      userRepoMock as never,
      {} as never,
      {} as never,
      {} as never,
      auditSvc as never,
    );
  });

  it('sets status to ACTIVE, resets failedLoginAttempts and lockedUntil', async () => {
    await service.unlock(tenantId, userId);
    expect(userRepoMock.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: UserStatus.ACTIVE,
        failedLoginAttempts: 0,
        lockedUntil: null,
      }),
    );
  });

  it('records USER_UNLOCKED audit action', async () => {
    await service.unlock(tenantId, userId);
    expect(auditSvc.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.USER_UNLOCKED }),
    );
  });

  it('throws NotFoundException when user not found', async () => {
    userRepoMock.findOne.mockResolvedValue(null);
    await expect(service.unlock(tenantId, userId)).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 2: Run to verify failures**

```bash
cd backend && bun run test src/users/users.service.spec.ts
```
Expected: FAIL — `service.lock is not a function`, `service.unlock is not a function`

- [ ] **Step 3: Implement lock() and unlock() in UsersService**

`backend/src/users/users.service.ts` — `deactivate()` 메서드 닫는 `}` 바로 다음에 추가:

```typescript
  async lock(tenantId: string, id: string, ctx?: AuditContext): Promise<void> {
    const user = await this.findOne(tenantId, id);
    user.status = UserStatus.LOCKED;
    await this.userRepo.save(user);
    await this.auditService.record({
      tenantId,
      action: AuditAction.USER_LOCKED,
      targetType: 'user',
      targetId: id,
      ...ctx,
    });
  }

  async unlock(tenantId: string, id: string, ctx?: AuditContext): Promise<void> {
    const user = await this.findOne(tenantId, id);
    user.status = UserStatus.ACTIVE;
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    await this.userRepo.save(user);
    await this.auditService.record({
      tenantId,
      action: AuditAction.USER_UNLOCKED,
      targetType: 'user',
      targetId: id,
      ...ctx,
    });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && bun run test src/users/users.service.spec.ts
```
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/users/users.service.ts backend/src/users/users.service.spec.ts
git commit -m "feat: add lock/unlock methods to UsersService"
```

---

### Task 3: m2m-users.controller.ts 생성

**Files:**
- Create: `backend/src/rbac/m2m-users.controller.ts`
- Create: `backend/src/rbac/m2m-users.controller.spec.ts`

- [ ] **Step 1: Write failing tests**

신규 파일 `backend/src/rbac/m2m-users.controller.spec.ts` 생성:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { M2mUsersController } from './m2m-users.controller';
import { UsersService } from '../users/users.service';
import { UserStatus } from '../database/entities';

describe('M2mUsersController', () => {
  let controller: M2mUsersController;
  let usersService: {
    findAll: jest.Mock;
    activate: jest.Mock;
    deactivate: jest.Mock;
    lock: jest.Mock;
    unlock: jest.Mock;
  };

  const tenant = { tenantId: 'tenant-1', tenantSlug: 'acme' };
  const userId = 'user-1';
  const mockReq = {
    ip: '127.0.0.1',
    headers: { 'user-agent': 'test-agent' },
    accessToken: { sub: 'client-1' },
    requestId: 'req-abc',
  } as any;

  beforeEach(async () => {
    usersService = {
      findAll: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 }),
      activate: jest.fn().mockResolvedValue(undefined),
      deactivate: jest.fn().mockResolvedValue(undefined),
      lock: jest.fn().mockResolvedValue(undefined),
      unlock: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [M2mUsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    }).compile();

    controller = module.get(M2mUsersController);
  });

  describe('listUsers', () => {
    it('passes parsed page and limit to usersService.findAll', async () => {
      await controller.listUsers(tenant as any, '2', '10', 'alice', UserStatus.ACTIVE);
      expect(usersService.findAll).toHaveBeenCalledWith('tenant-1', {
        page: 2,
        limit: 10,
        search: 'alice',
        status: UserStatus.ACTIVE,
      });
    });

    it('passes undefined for omitted query params', async () => {
      await controller.listUsers(tenant as any, undefined, undefined, undefined, undefined);
      expect(usersService.findAll).toHaveBeenCalledWith('tenant-1', {
        page: undefined,
        limit: undefined,
        search: undefined,
        status: undefined,
      });
    });
  });

  describe('activateUser', () => {
    it('calls usersService.activate with tenantId, userId, and oauth_client ctx', async () => {
      await controller.activateUser(tenant as any, userId, mockReq);
      expect(usersService.activate).toHaveBeenCalledWith(
        'tenant-1',
        userId,
        expect.objectContaining({ actorId: 'client-1', actorType: 'oauth_client' }),
      );
    });
  });

  describe('deactivateUser', () => {
    it('calls usersService.deactivate with tenantId, userId, and oauth_client ctx', async () => {
      await controller.deactivateUser(tenant as any, userId, mockReq);
      expect(usersService.deactivate).toHaveBeenCalledWith(
        'tenant-1',
        userId,
        expect.objectContaining({ actorId: 'client-1', actorType: 'oauth_client' }),
      );
    });
  });

  describe('lockUser', () => {
    it('calls usersService.lock with tenantId, userId, and oauth_client ctx', async () => {
      await controller.lockUser(tenant as any, userId, mockReq);
      expect(usersService.lock).toHaveBeenCalledWith(
        'tenant-1',
        userId,
        expect.objectContaining({ actorId: 'client-1', actorType: 'oauth_client' }),
      );
    });
  });

  describe('unlockUser', () => {
    it('calls usersService.unlock with tenantId, userId, and oauth_client ctx', async () => {
      await controller.unlockUser(tenant as any, userId, mockReq);
      expect(usersService.unlock).toHaveBeenCalledWith(
        'tenant-1',
        userId,
        expect.objectContaining({ actorId: 'client-1', actorType: 'oauth_client' }),
      );
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && bun run test src/rbac/m2m-users.controller.spec.ts
```
Expected: FAIL — `Cannot find module './m2m-users.controller'`

- [ ] **Step 3: Create m2m-users.controller.ts**

신규 파일 `backend/src/rbac/m2m-users.controller.ts` 생성:

```typescript
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { RequireScopes } from '../common/decorators/require-scopes.decorator';
import { OAuthAccessTokenGuard } from '../common/guards/oauth-access-token.guard';
import { ScopeGuard } from '../common/guards/scope.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import type { TenantContext } from '../common/tenant/tenant-context';
import { UserStatus } from '../database/entities';
import { UsersService } from '../users/users.service';

@ApiTags('M2M / Users')
@ApiBearerAuth()
@ApiParam({ name: 'tenantSlug', description: '테넌트 슬러그' })
@UseGuards(OAuthAccessTokenGuard, ScopeGuard)
@Controller('t/:tenantSlug/api')
export class M2mUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('users')
  @RequireScopes('users:read')
  @ApiOperation({ summary: 'M2M 사용자 목록 조회 (역할·상태 포함, 페이징)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '페이지 번호 (1-based, 기본값: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '페이지당 건수 (기본값: 20, 최대: 100)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: '이메일 부분 검색' })
  @ApiQuery({ name: 'status', required: false, enum: UserStatus, description: '상태 필터' })
  listUsers(
    @CurrentTenant() tenant: TenantContext,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: UserStatus,
  ) {
    return this.usersService.findAll(tenant.tenantId, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search: search || undefined,
      status: status || undefined,
    });
  }

  @Post('users/:userId/activate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireScopes('users:write')
  @ApiOperation({ summary: 'M2M 사용자 활성화' })
  activateUser(
    @CurrentTenant() tenant: TenantContext,
    @Param('userId') userId: string,
    @Req() req: Request,
  ) {
    return this.usersService.activate(tenant.tenantId, userId, this.buildCtx(req));
  }

  @Post('users/:userId/deactivate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireScopes('users:write')
  @ApiOperation({ summary: 'M2M 사용자 비활성화' })
  deactivateUser(
    @CurrentTenant() tenant: TenantContext,
    @Param('userId') userId: string,
    @Req() req: Request,
  ) {
    return this.usersService.deactivate(tenant.tenantId, userId, this.buildCtx(req));
  }

  @Post('users/:userId/lock')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireScopes('users:write')
  @ApiOperation({ summary: 'M2M 계정 잠금' })
  lockUser(
    @CurrentTenant() tenant: TenantContext,
    @Param('userId') userId: string,
    @Req() req: Request,
  ) {
    return this.usersService.lock(tenant.tenantId, userId, this.buildCtx(req));
  }

  @Post('users/:userId/unlock')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireScopes('users:write')
  @ApiOperation({ summary: 'M2M 계정 잠금 해제' })
  unlockUser(
    @CurrentTenant() tenant: TenantContext,
    @Param('userId') userId: string,
    @Req() req: Request,
  ) {
    return this.usersService.unlock(tenant.tenantId, userId, this.buildCtx(req));
  }

  private buildCtx(req: Request) {
    return {
      actorId: req.accessToken?.sub ?? null,
      actorType: 'oauth_client' as const,
      ipAddress: req.ip ?? null,
      userAgent: (req.headers['user-agent'] as string) ?? null,
      requestId: req.requestId ?? null,
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && bun run test src/rbac/m2m-users.controller.spec.ts
```
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/rbac/m2m-users.controller.ts backend/src/rbac/m2m-users.controller.spec.ts
git commit -m "feat: create M2mUsersController for M2M user management API"
```

---

### Task 4: RbacModule 업데이트

**Files:**
- Modify: `backend/src/rbac/rbac.module.ts`

- [ ] **Step 1: Update rbac.module.ts**

`backend/src/rbac/rbac.module.ts` 전체를 다음으로 교체:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  RolePermission,
  AccessToken,
  TenantPermission,
  TenantRole,
  User,
  UserRole,
} from '../database/entities';
import { AdminAuthModule } from '../admin/auth/admin-auth.module';
import { AuditModule } from '../common/audit/audit.module';
import { KeysModule } from '../oauth/keys/keys.module';
import { UsersModule } from '../users/users.module';
import { M2mRbacController } from './m2m-rbac.controller';
import { M2mUsersController } from './m2m-users.controller';
import { RbacController } from './rbac.controller';
import { RbacService } from './rbac.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TenantRole,
      TenantPermission,
      RolePermission,
      UserRole,
      User,
      AccessToken,
    ]),
    AdminAuthModule,
    KeysModule,
    AuditModule,
    UsersModule,
  ],
  controllers: [RbacController, M2mRbacController, M2mUsersController],
  providers: [RbacService],
  exports: [RbacService],
})
export class RbacModule {}
```

- [ ] **Step 2: TypeScript 빌드 확인**

```bash
cd backend && bun run build
```
Expected: 빌드 성공, TypeScript 오류 없음

- [ ] **Step 3: 전체 테스트 실행**

```bash
cd backend && bun run test
```
Expected: 기존 테스트 포함 전체 PASS

- [ ] **Step 4: Swagger에서 엔드포인트 확인**

```bash
cd backend && bun run start:dev
```

`http://localhost:3000/docs` 접속 → **M2M / Users** 태그 아래 다음 5개 엔드포인트 확인:

| Method | Path |
|---|---|
| GET | `/t/{tenantSlug}/api/users` |
| POST | `/t/{tenantSlug}/api/users/{userId}/activate` |
| POST | `/t/{tenantSlug}/api/users/{userId}/deactivate` |
| POST | `/t/{tenantSlug}/api/users/{userId}/lock` |
| POST | `/t/{tenantSlug}/api/users/{userId}/unlock` |

- [ ] **Step 5: Commit**

```bash
git add backend/src/rbac/rbac.module.ts
git commit -m "feat: register M2mUsersController and import UsersModule in RbacModule"
```

---

## 스코프 참고

이 API를 사용하는 M2M 클라이언트는 테넌트 내 OAuthClient에 `users:read` / `users:write` 스코프가 허용되어 있어야 한다. 테넌트 스코프 관리는 `/admin/tenants/:tenantId/scopes` 엔드포인트를 통해 추가할 수 있다.
