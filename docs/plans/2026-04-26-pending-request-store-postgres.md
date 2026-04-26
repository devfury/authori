# PendingRequestStore PostgreSQL 마이그레이션 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `PendingRequestStore`의 인메모리 Map을 PostgreSQL `pending_oauth_requests` 테이블로 교체하여 서버 재시작과 다중 인스턴스 환경에서도 OAuth 인증 흐름을 유지한다.

**Architecture:** `IPendingRequestStore` 인터페이스를 추출하고 `TypeOrmPendingRequestStore`로 구현체를 교체한다. `@nestjs/schedule` Cron 잡이 5분마다 만료된 레코드를 정리한다. `AuthorizeService`는 기존의 인라인 인스턴스 생성 대신 DI를 통해 주입받는다.

**Tech Stack:** NestJS TypeORM (PostgreSQL), `@nestjs/schedule`, Jest (unit tests with mocked repositories)

---

## 파일 구조

| 작업 | 파일 |
|------|------|
| 수정 | `backend/src/oauth/authorize/pending-request.store.ts` |
| 생성 | `backend/src/database/entities/pending-oauth-request.entity.ts` |
| 수정 | `backend/src/database/entities/index.ts` |
| 수정 | `backend/src/database/data-source.ts` |
| 생성 | `backend/src/database/migrations/1777100000000-CreatePendingOAuthRequests.ts` |
| 생성 | `backend/src/oauth/authorize/typeorm-pending-request.store.ts` |
| 생성 | `backend/src/oauth/authorize/typeorm-pending-request.store.spec.ts` |
| 생성 | `backend/src/oauth/authorize/pending-request-cleanup.service.ts` |
| 생성 | `backend/src/oauth/authorize/pending-request-cleanup.service.spec.ts` |
| 수정 | `backend/src/oauth/authorize/authorize.module.ts` |
| 수정 | `backend/src/oauth/authorize/authorize.service.ts` |
| 수정 | `backend/src/app.module.ts` |

---

## Task 1: `@nestjs/schedule` 설치 및 AppModule 등록

**Files:**
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: 패키지 설치**

```bash
cd backend && bun add @nestjs/schedule
```

Expected: `node_modules/@nestjs/schedule` 디렉터리 생성.

- [ ] **Step 2: AppModule에 ScheduleModule 추가**

`backend/src/app.module.ts`에서 imports 배열에 `ScheduleModule.forRoot()` 추가:

```typescript
import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from './common/config/config.module';
import { DatabaseModule } from './database/database.module';
import { AuditModule } from './common/audit/audit.module';
import { TenantMiddleware } from './common/tenant/tenant.middleware';
import { RequestIdMiddleware } from './common/security/request-id.middleware';
import { Tenant } from './database/entities';
// Phase 2
import { TenantsModule } from './tenants/tenants.module';
import { ClientsModule } from './oauth/clients/clients.module';
import { ProfileSchemaModule } from './profile-schema/profile-schema.module';
import { UsersModule } from './users/users.module';
// Phase 3
import { KeysModule } from './oauth/keys/keys.module';
import { AuthorizeModule } from './oauth/authorize/authorize.module';
import { TokenModule } from './oauth/token/token.module';
import { RevokeModule } from './oauth/revoke/revoke.module';
import { DiscoveryModule } from './oauth/discovery/discovery.module';
// Phase 4
import { AdminAuthModule } from './admin/auth/admin-auth.module';
// Phase 5
import { ExternalAuthModule } from './external-auth/external-auth.module';
import { RbacModule } from './rbac/rbac.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuditModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    TypeOrmModule.forFeature([Tenant]),
    // Phase 2
    TenantsModule,
    ClientsModule,
    ProfileSchemaModule,
    UsersModule,
    // Phase 3
    KeysModule,
    AuthorizeModule,
    TokenModule,
    RevokeModule,
    DiscoveryModule,
    // Phase 4
    AdminAuthModule,
    // Phase 5
    ExternalAuthModule,
    RbacModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
    consumer
      .apply(TenantMiddleware)
      .forRoutes({ path: '/t/:tenantSlug/*path', method: RequestMethod.ALL });
  }
}
```

- [ ] **Step 3: 빌드 확인**

```bash
cd backend && bun run build 2>&1 | tail -5
```

Expected: 오류 없이 `dist/` 생성.

- [ ] **Step 4: 커밋**

```bash
git add backend/src/app.module.ts backend/package.json backend/bun.lockb
git commit -m "feat: install @nestjs/schedule and register ScheduleModule"
```

---

## Task 2: `IPendingRequestStore` 인터페이스 추출

**Files:**
- Modify: `backend/src/oauth/authorize/pending-request.store.ts`

- [ ] **Step 1: 인터페이스 추가 및 기존 클래스 구현 선언**

`backend/src/oauth/authorize/pending-request.store.ts` 전체를 아래로 교체:

```typescript
import { randomUUID } from 'crypto';

export interface PendingAuthRequest {
  tenantId: string;
  tenantSlug: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  expiresAt: number;
}

export interface IPendingRequestStore {
  save(request: Omit<PendingAuthRequest, 'expiresAt'>): Promise<string>;
  get(id: string): Promise<PendingAuthRequest | null>;
  delete(id: string): Promise<void>;
}

export const PENDING_REQUEST_STORE = Symbol('PENDING_REQUEST_STORE');

/** 로컬 개발 전용 인메모리 구현체 */
export class InMemoryPendingRequestStore implements IPendingRequestStore {
  private readonly store = new Map<string, PendingAuthRequest>();
  private readonly TTL_MS = 10 * 60 * 1000;

  async save(request: Omit<PendingAuthRequest, 'expiresAt'>): Promise<string> {
    const id = randomUUID();
    this.store.set(id, { ...request, expiresAt: Date.now() + this.TTL_MS });
    return id;
  }

  async get(id: string): Promise<PendingAuthRequest | null> {
    const req = this.store.get(id);
    if (!req) return null;
    if (Date.now() > req.expiresAt) {
      this.store.delete(id);
      return null;
    }
    return req;
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}
```

- [ ] **Step 2: 빌드 확인**

```bash
cd backend && bun run build 2>&1 | grep -E 'error|Error' | head -20
```

Expected: 출력 없음 (에러 없음). `AuthorizeService`가 아직 동기 호출을 사용하므로 타입 오류가 발생할 수 있다 — Task 9에서 수정한다.

- [ ] **Step 3: 커밋**

```bash
git add backend/src/oauth/authorize/pending-request.store.ts
git commit -m "refactor: extract IPendingRequestStore interface, rename class to InMemory"
```

---

## Task 3: `PendingOAuthRequest` 엔티티 생성

**Files:**
- Create: `backend/src/database/entities/pending-oauth-request.entity.ts`
- Modify: `backend/src/database/entities/index.ts`
- Modify: `backend/src/database/data-source.ts`

- [ ] **Step 1: 엔티티 파일 생성**

`backend/src/database/entities/pending-oauth-request.entity.ts`:

```typescript
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity('pending_oauth_requests')
export class PendingOAuthRequest {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'tenant_slug' })
  tenantSlug: string;

  @Column({ name: 'client_id' })
  clientId: string;

  @Column({ name: 'redirect_uri' })
  redirectUri: string;

  @Column({ type: 'text', array: true })
  scopes: string[];

  @Column({ type: 'varchar', nullable: true })
  state: string | null;

  @Column({ name: 'code_challenge', type: 'varchar', nullable: true })
  codeChallenge: string | null;

  @Column({ name: 'code_challenge_method', type: 'varchar', nullable: true })
  codeChallengeMethod: string | null;

  @Index()
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
```

- [ ] **Step 2: index.ts에 export 추가**

`backend/src/database/entities/index.ts` 마지막 줄에 추가:

```typescript
export { PendingOAuthRequest } from './pending-oauth-request.entity';
```

- [ ] **Step 3: data-source.ts에 엔티티 등록**

`backend/src/database/data-source.ts`에서 import와 entities 배열 수정:

import 추가:
```typescript
import { PendingOAuthRequest } from './entities';
```

`entities` 배열에 `PendingOAuthRequest` 추가 (마지막 항목 뒤):
```typescript
entities: [
  Tenant,
  TenantSettings,
  TenantScope,
  TenantRole,
  TenantPermission,
  User,
  UserProfile,
  RolePermission,
  UserRole,
  ProfileSchemaVersion,
  OAuthClient,
  OAuthClientRedirectUri,
  AuthorizationCode,
  AccessToken,
  RefreshToken,
  Consent,
  SigningKey,
  AuditLog,
  AdminUser,
  ExternalAuthProvider,
  PendingOAuthRequest,
],
```

- [ ] **Step 4: 빌드 확인**

```bash
cd backend && bun run build 2>&1 | grep -E 'error|Error' | head -20
```

Expected: 출력 없음.

- [ ] **Step 5: 커밋**

```bash
git add backend/src/database/entities/pending-oauth-request.entity.ts \
        backend/src/database/entities/index.ts \
        backend/src/database/data-source.ts
git commit -m "feat: add PendingOAuthRequest entity"
```

---

## Task 4: `TypeOrmPendingRequestStore` 구현 (TDD)

**Files:**
- Create: `backend/src/oauth/authorize/typeorm-pending-request.store.spec.ts`
- Create: `backend/src/oauth/authorize/typeorm-pending-request.store.ts`

- [ ] **Step 1: 테스트 파일 작성**

`backend/src/oauth/authorize/typeorm-pending-request.store.spec.ts`:

```typescript
import { TypeOrmPendingRequestStore } from './typeorm-pending-request.store';

const BASE_REQUEST = {
  tenantId: 'tenant-1',
  tenantSlug: 'acme',
  clientId: 'client-1',
  redirectUri: 'https://app.example.com/callback',
  scopes: ['openid', 'profile'],
};

describe('TypeOrmPendingRequestStore', () => {
  let repo: {
    save: jest.Mock;
    findOne: jest.Mock;
    delete: jest.Mock;
  };
  let store: TypeOrmPendingRequestStore;

  beforeEach(() => {
    repo = {
      save: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn(),
    };
    store = new TypeOrmPendingRequestStore(repo as never);
  });

  describe('save', () => {
    it('persists a new row and returns a UUID string', async () => {
      repo.save.mockResolvedValue(undefined);

      const id = await store.save(BASE_REQUEST);

      expect(typeof id).toBe('string');
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id,
          tenantId: 'tenant-1',
          scopes: ['openid', 'profile'],
          expiresAt: expect.any(Date),
        }),
      );
    });
  });

  describe('get', () => {
    it('returns null when the row does not exist', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await store.get('non-existent-id');

      expect(result).toBeNull();
    });

    it('returns null and deletes the row when expired', async () => {
      const expiredRow = {
        id: 'req-1',
        ...BASE_REQUEST,
        state: null,
        codeChallenge: null,
        codeChallengeMethod: null,
        expiresAt: new Date(Date.now() - 1000),
      };
      repo.findOne.mockResolvedValue(expiredRow);
      repo.delete.mockResolvedValue(undefined);

      const result = await store.get('req-1');

      expect(result).toBeNull();
      expect(repo.delete).toHaveBeenCalledWith('req-1');
    });

    it('returns PendingAuthRequest when row is valid', async () => {
      const validRow = {
        id: 'req-2',
        ...BASE_REQUEST,
        state: 'xyz',
        codeChallenge: 'abc123',
        codeChallengeMethod: 'S256',
        expiresAt: new Date(Date.now() + 60_000),
      };
      repo.findOne.mockResolvedValue(validRow);

      const result = await store.get('req-2');

      expect(result).toMatchObject({
        tenantId: 'tenant-1',
        tenantSlug: 'acme',
        clientId: 'client-1',
        scopes: ['openid', 'profile'],
        state: 'xyz',
        codeChallenge: 'abc123',
        codeChallengeMethod: 'S256',
      });
      expect(typeof result!.expiresAt).toBe('number');
    });

    it('returns undefined for state/codeChallenge when DB columns are null', async () => {
      const validRow = {
        id: 'req-3',
        ...BASE_REQUEST,
        state: null,
        codeChallenge: null,
        codeChallengeMethod: null,
        expiresAt: new Date(Date.now() + 60_000),
      };
      repo.findOne.mockResolvedValue(validRow);

      const result = await store.get('req-3');

      expect(result!.state).toBeUndefined();
      expect(result!.codeChallenge).toBeUndefined();
      expect(result!.codeChallengeMethod).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('calls repo.delete with the given id', async () => {
      repo.delete.mockResolvedValue(undefined);

      await store.delete('req-x');

      expect(repo.delete).toHaveBeenCalledWith('req-x');
    });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd backend && bun run test --testPathPattern=typeorm-pending-request.store 2>&1 | tail -10
```

Expected: `Cannot find module './typeorm-pending-request.store'` 오류로 실패.

- [ ] **Step 3: 구현 파일 작성**

`backend/src/oauth/authorize/typeorm-pending-request.store.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { PendingOAuthRequest } from '../../database/entities';
import {
  IPendingRequestStore,
  PendingAuthRequest,
} from './pending-request.store';

@Injectable()
export class TypeOrmPendingRequestStore implements IPendingRequestStore {
  private readonly TTL_MS = 10 * 60 * 1000;

  constructor(
    @InjectRepository(PendingOAuthRequest)
    private readonly repo: Repository<PendingOAuthRequest>,
  ) {}

  async save(request: Omit<PendingAuthRequest, 'expiresAt'>): Promise<string> {
    const id = randomUUID();
    await this.repo.save({
      id,
      tenantId: request.tenantId,
      tenantSlug: request.tenantSlug,
      clientId: request.clientId,
      redirectUri: request.redirectUri,
      scopes: request.scopes,
      state: request.state ?? null,
      codeChallenge: request.codeChallenge ?? null,
      codeChallengeMethod: request.codeChallengeMethod ?? null,
      expiresAt: new Date(Date.now() + this.TTL_MS),
    });
    return id;
  }

  async get(id: string): Promise<PendingAuthRequest | null> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) return null;
    if (row.expiresAt < new Date()) {
      await this.repo.delete(id);
      return null;
    }
    return {
      tenantId: row.tenantId,
      tenantSlug: row.tenantSlug,
      clientId: row.clientId,
      redirectUri: row.redirectUri,
      scopes: row.scopes,
      ...(row.state != null && { state: row.state }),
      ...(row.codeChallenge != null && { codeChallenge: row.codeChallenge }),
      ...(row.codeChallengeMethod != null && {
        codeChallengeMethod: row.codeChallengeMethod,
      }),
      expiresAt: row.expiresAt.getTime(),
    };
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd backend && bun run test --testPathPattern=typeorm-pending-request.store 2>&1 | tail -10
```

Expected: `Tests: 6 passed, 6 total`.

- [ ] **Step 5: 커밋**

```bash
git add backend/src/oauth/authorize/typeorm-pending-request.store.ts \
        backend/src/oauth/authorize/typeorm-pending-request.store.spec.ts
git commit -m "feat: implement TypeOrmPendingRequestStore with tests"
```

---

## Task 5: `PendingRequestCleanupService` 구현 (TDD)

**Files:**
- Create: `backend/src/oauth/authorize/pending-request-cleanup.service.spec.ts`
- Create: `backend/src/oauth/authorize/pending-request-cleanup.service.ts`

- [ ] **Step 1: 테스트 파일 작성**

`backend/src/oauth/authorize/pending-request-cleanup.service.spec.ts`:

```typescript
import { PendingRequestCleanupService } from './pending-request-cleanup.service';

describe('PendingRequestCleanupService', () => {
  let repo: { createQueryBuilder: jest.Mock };
  let qb: {
    delete: jest.Mock;
    where: jest.Mock;
    execute: jest.Mock;
  };
  let service: PendingRequestCleanupService;

  beforeEach(() => {
    qb = {
      delete: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 3 }),
    };
    repo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };
    service = new PendingRequestCleanupService(repo as never);
  });

  it('deletes rows where expires_at is in the past', async () => {
    await service.cleanup();

    expect(qb.delete).toHaveBeenCalled();
    expect(qb.where).toHaveBeenCalledWith('expires_at < :now', {
      now: expect.any(Date),
    });
    expect(qb.execute).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd backend && bun run test --testPathPattern=pending-request-cleanup 2>&1 | tail -10
```

Expected: `Cannot find module` 오류로 실패.

- [ ] **Step 3: 구현 파일 작성**

`backend/src/oauth/authorize/pending-request-cleanup.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PendingOAuthRequest } from '../../database/entities';

@Injectable()
export class PendingRequestCleanupService {
  private readonly logger = new Logger(PendingRequestCleanupService.name);

  constructor(
    @InjectRepository(PendingOAuthRequest)
    private readonly repo: Repository<PendingOAuthRequest>,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async cleanup(): Promise<void> {
    const result = await this.repo
      .createQueryBuilder()
      .delete()
      .where('expires_at < :now', { now: new Date() })
      .execute();
    this.logger.debug(`Cleaned up ${result.affected ?? 0} expired pending requests`);
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd backend && bun run test --testPathPattern=pending-request-cleanup 2>&1 | tail -10
```

Expected: `Tests: 1 passed, 1 total`.

- [ ] **Step 5: 커밋**

```bash
git add backend/src/oauth/authorize/pending-request-cleanup.service.ts \
        backend/src/oauth/authorize/pending-request-cleanup.service.spec.ts
git commit -m "feat: add PendingRequestCleanupService with 5-minute cron"
```

---

## Task 6: 마이그레이션 파일 작성

**Files:**
- Create: `backend/src/database/migrations/1777100000000-CreatePendingOAuthRequests.ts`

- [ ] **Step 1: 마이그레이션 파일 생성**

`backend/src/database/migrations/1777100000000-CreatePendingOAuthRequests.ts`:

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePendingOAuthRequests1777100000000
  implements MigrationInterface
{
  name = 'CreatePendingOAuthRequests1777100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "pending_oauth_requests" (
        "id"                    uuid          NOT NULL,
        "tenant_id"             character varying NOT NULL,
        "tenant_slug"           character varying NOT NULL,
        "client_id"             character varying NOT NULL,
        "redirect_uri"          character varying NOT NULL,
        "scopes"                text[]        NOT NULL,
        "state"                 character varying,
        "code_challenge"        character varying,
        "code_challenge_method" character varying,
        "expires_at"            TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_at"            TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pending_oauth_requests" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_pending_oauth_requests_expires_at"
        ON "pending_oauth_requests" ("expires_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_pending_oauth_requests_expires_at"`,
    );
    await queryRunner.query(`DROP TABLE "pending_oauth_requests"`);
  }
}
```

- [ ] **Step 2: 커밋**

```bash
git add backend/src/database/migrations/1777100000000-CreatePendingOAuthRequests.ts
git commit -m "feat: add migration for pending_oauth_requests table"
```

---

## Task 7: `AuthorizeModule` 업데이트

**Files:**
- Modify: `backend/src/oauth/authorize/authorize.module.ts`

- [ ] **Step 1: 모듈 파일 업데이트**

`backend/src/oauth/authorize/authorize.module.ts` 전체를 아래로 교체:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AuthorizationCode,
  Consent,
  OAuthClient,
  OAuthClientRedirectUri,
  PendingOAuthRequest,
  ProfileSchemaVersion,
  TenantSettings,
  User,
  UserProfile,
} from '../../database/entities';
import { AuditModule } from '../../common/audit/audit.module';
import { ExternalAuthModule } from '../../external-auth/external-auth.module';
import { UsersModule } from '../../users/users.module';
import { ScopesModule } from '../scopes/scopes.module';
import { AuthorizeService } from './authorize.service';
import { AuthorizeController } from './authorize.controller';
import { TypeOrmPendingRequestStore } from './typeorm-pending-request.store';
import { PendingRequestCleanupService } from './pending-request-cleanup.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OAuthClient,
      OAuthClientRedirectUri,
      AuthorizationCode,
      User,
      UserProfile,
      ProfileSchemaVersion,
      Consent,
      TenantSettings,
      PendingOAuthRequest,
    ]),
    AuditModule,
    ExternalAuthModule,
    UsersModule,
    ScopesModule,
  ],
  controllers: [AuthorizeController],
  providers: [AuthorizeService, TypeOrmPendingRequestStore, PendingRequestCleanupService],
})
export class AuthorizeModule {}
```

- [ ] **Step 2: 빌드 확인**

```bash
cd backend && bun run build 2>&1 | grep -E 'error|Error' | head -20
```

Expected: 출력 없음.

- [ ] **Step 3: 커밋**

```bash
git add backend/src/oauth/authorize/authorize.module.ts
git commit -m "feat: wire TypeOrmPendingRequestStore and cleanup service into AuthorizeModule"
```

---

## Task 8: `AuthorizeService` 업데이트 — DI 주입 및 비동기 호출

**Files:**
- Modify: `backend/src/oauth/authorize/authorize.service.ts`

- [ ] **Step 1: pendingStore 인라인 생성 제거 + 생성자 주입 추가**

`authorize.service.ts`에서 다음 변경 수행:

1. import 변경 — `PendingRequestStore` → `TypeOrmPendingRequestStore`:

```typescript
import { TypeOrmPendingRequestStore } from './typeorm-pending-request.store';
```

2. 클래스 내 인라인 선언 제거:

```typescript
// 제거할 줄:
private readonly pendingStore = new PendingRequestStore();
```

3. 생성자 파라미터에 주입 추가 (마지막 파라미터로):

```typescript
private readonly pendingStore: TypeOrmPendingRequestStore,
```

전체 생성자는 아래와 같이 된다:

```typescript
constructor(
  @InjectRepository(OAuthClient)
  private readonly clientRepo: Repository<OAuthClient>,
  @InjectRepository(OAuthClientRedirectUri)
  private readonly redirectUriRepo: Repository<OAuthClientRedirectUri>,
  @InjectRepository(AuthorizationCode)
  private readonly codeRepo: Repository<AuthorizationCode>,
  @InjectRepository(User)
  private readonly userRepo: Repository<User>,
  @InjectRepository(UserProfile)
  private readonly profileRepo: Repository<UserProfile>,
  @InjectRepository(ProfileSchemaVersion)
  private readonly schemaRepo: Repository<ProfileSchemaVersion>,
  @InjectRepository(Consent)
  private readonly consentRepo: Repository<Consent>,
  @InjectRepository(TenantSettings)
  private readonly settingsRepo: Repository<TenantSettings>,
  @InjectDataSource()
  private readonly dataSource: DataSource,
  private readonly auditService: AuditService,
  private readonly externalAuthService: ExternalAuthService,
  private readonly usersService: UsersService,
  private readonly scopesService: ScopesService,
  private readonly pendingStore: TypeOrmPendingRequestStore,
) {}
```

- [ ] **Step 2: `initiateAuthorize`에 await 추가**

`initiateAuthorize` 메서드 내 `pendingStore.save` 호출을 `await` 처리:

```typescript
const requestId = await this.pendingStore.save({
  tenantId,
  tenantSlug,
  clientId: client.clientId,
  redirectUri: query.redirect_uri,
  scopes: requestedScopes,
  state: query.state,
  codeChallenge: query.code_challenge,
  codeChallengeMethod: query.code_challenge_method,
});
```

- [ ] **Step 3: `loginAndAuthorize`에 await 추가**

`loginAndAuthorize` 메서드 내 `pendingStore.get` 호출을 `await` 처리:

```typescript
const pending = await this.pendingStore.get(dto.requestId);
```

- [ ] **Step 4: `issueAuthCode`에 await 추가**

`issueAuthCode` 메서드 내 `pendingStore.delete` 호출을 `await` 처리:

```typescript
await this.pendingStore.delete(dto.requestId);
```

- [ ] **Step 5: `PendingRequestStore` import 제거**

파일 상단에서 아래 import를 제거:

```typescript
import { PendingRequestStore } from './pending-request.store';
```

그리고 `PendingRequest` 타입 별칭도 아래와 같이 업데이트:

```typescript
// 변경 전:
type PendingRequest = NonNullable<ReturnType<PendingRequestStore['get']>>;

// 변경 후 (Promise를 unwrap):
import { PendingAuthRequest } from './pending-request.store';
type PendingRequest = PendingAuthRequest;
```

- [ ] **Step 6: 빌드 확인**

```bash
cd backend && bun run build 2>&1 | grep -E 'error|Error' | head -20
```

Expected: 출력 없음.

- [ ] **Step 7: 전체 테스트 통과 확인**

```bash
cd backend && bun run test 2>&1 | tail -15
```

Expected: 모든 테스트 통과. `TypeOrmPendingRequestStore`와 `PendingRequestCleanupService` 테스트 포함.

- [ ] **Step 8: 커밋**

```bash
git add backend/src/oauth/authorize/authorize.service.ts
git commit -m "feat: inject TypeOrmPendingRequestStore into AuthorizeService, await async calls"
```

---

## Task 9: 마이그레이션 실행 및 동작 확인

- [ ] **Step 1: 마이그레이션 실행**

```bash
cd backend && bun run migration:run
```

Expected: `query: CREATE TABLE "pending_oauth_requests"` 로그 출력 후 `Migration CreatePendingOAuthRequests1777100000000 has been executed successfully.`

- [ ] **Step 2: 테이블 존재 확인**

```bash
cd backend && bun run migration:run 2>&1 | grep -i pending
```

Expected: `No migrations are pending` — 이미 적용됨.

- [ ] **Step 3: 개발 서버 기동 및 OAuth 흐름 smoke test**

```bash
cd backend && bun run start:dev
```

브라우저 또는 curl로 아래 흐름을 확인:

1. `GET /t/{tenantSlug}/oauth/authorize?client_id=...&redirect_uri=...&response_type=code&scope=openid` 요청
2. 응답의 `requestId`가 UUID 형식인지 확인
3. DB에서 `SELECT id, expires_at FROM pending_oauth_requests;` 로 행이 저장됨을 확인
4. 로그인 완료 후 `pending_oauth_requests`에서 해당 행이 삭제됨을 확인

- [ ] **Step 4: 최종 커밋**

```bash
git add -A
git commit -m "chore: run pending_oauth_requests migration"
```
