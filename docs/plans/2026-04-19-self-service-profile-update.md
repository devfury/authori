# Self-Service Profile Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 엔드유저가 자신에게 발급된 OAuth access token(+`profile:write` scope)만으로 외부 앱에서 본인 프로필(loginId, profileJsonb)을 수정할 수 있게 한다.

**Architecture:** 기존 `GET /t/:tenantSlug/oauth/userinfo` 가 사는 `DiscoveryController` 에 동일 경로의 `PATCH` 핸들러를 추가한다. Bearer JWT 검증 + revocation 체크 로직은 private 헬퍼로 추출하여 GET/PATCH가 공유한다. `profile:write` 스코프가 토큰 scope 에 포함된 경우에만 허용하며, 실제 수정은 `UsersService.updateSelf()` 에 위임해 기존 schema validation/JSON merge/audit 패턴을 재사용한다. `profile:write` 는 테넌트 생성 시 seeding 되는 비-기본 스코프로 등록하고, 기존 테넌트에는 마이그레이션으로 주입한다.

**Tech Stack:** NestJS (backend), TypeORM (PostgreSQL), class-validator DTO, `jsonwebtoken` RS256 검증, Jest 단위 테스트 + supertest e2e.

---

## File Structure

**Create:**
- `backend/src/users/dto/self-update-user.dto.ts` — 사용자 본인 수정용 DTO (profile + loginId만 허용)
- `backend/src/database/migrations/<timestamp>-SeedProfileWriteScope.ts` — 기존 테넌트에 `profile:write` scope 삽입

**Modify:**
- `backend/src/oauth/scopes/scopes.service.ts` — `DEFAULT_TENANT_SCOPES` 에 `profile:write` 추가 (`isDefault: false`)
- `backend/src/users/users.service.ts` — `updateSelf(tenantId, userId, dto, ctx)` 메서드 추가
- `backend/src/users/users.service.spec.ts` — `updateSelf` 단위 테스트 추가
- `backend/src/oauth/discovery/discovery.controller.ts` — `verifyAccessToken()` private 헬퍼 추출 + `PATCH oauth/userinfo` 핸들러 추가
- `backend/src/oauth/discovery/discovery.module.ts` — `UsersModule` import (service 재사용)

**Test:**
- `backend/test/oauth-userinfo-patch.e2e-spec.ts` — PATCH /oauth/userinfo 엔드-투-엔드 테스트

---

## Task 1: `profile:write` 기본 스코프 카탈로그 등록

**Files:**
- Modify: `backend/src/oauth/scopes/scopes.service.ts:8-29`

- [ ] **Step 1: `DEFAULT_TENANT_SCOPES` 에 항목 추가**

`backend/src/oauth/scopes/scopes.service.ts` 의 상수 배열 끝에 추가:

```typescript
export const DEFAULT_TENANT_SCOPES: ReadonlyArray<
  Pick<TenantScope, 'name' | 'displayName' | 'description' | 'isDefault'>
> = [
  {
    name: 'openid',
    displayName: 'OpenID',
    description: 'Authenticate the user and issue an OpenID Connect subject.',
    isDefault: true,
  },
  {
    name: 'profile',
    displayName: 'Profile',
    description: 'Read the user profile claims.',
    isDefault: true,
  },
  {
    name: 'email',
    displayName: 'Email',
    description: 'Read the user email address.',
    isDefault: true,
  },
  {
    name: 'profile:write',
    displayName: 'Profile (Write)',
    description: 'Update the authenticated user profile.',
    isDefault: false,
  },
];
```

- [ ] **Step 2: 빌드 확인**

Run: `cd backend && bun run build`
Expected: 컴파일 에러 없이 종료.

- [ ] **Step 3: 커밋**

```bash
git add backend/src/oauth/scopes/scopes.service.ts
git commit -m "feat(scopes): register profile:write as opt-in default scope"
```

---

## Task 2: 기존 테넌트에 `profile:write` scope 주입 마이그레이션

**Files:**
- Create: `backend/src/database/migrations/1776600000000-SeedProfileWriteScope.ts`

- [ ] **Step 1: 마이그레이션 파일 작성**

파일명은 현재 시각 타임스탬프 접두사로 실제 값을 사용하되, 아래 코드를 그대로 사용:

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedProfileWriteScope1776600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO tenant_scopes (tenant_id, name, display_name, description, is_default)
      SELECT t.id, 'profile:write', 'Profile (Write)',
             'Update the authenticated user profile.', false
      FROM tenants t
      WHERE NOT EXISTS (
        SELECT 1 FROM tenant_scopes s
        WHERE s.tenant_id = t.id AND s.name = 'profile:write'
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM tenant_scopes WHERE name = 'profile:write'`,
    );
  }
}
```

> 컬럼명은 `backend/src/database/entities/tenant-scope.entity.ts` 의 snake_case 매핑을 따른다. 불확실하면 해당 엔티티를 먼저 열어 컬럼 이름을 확인한 뒤 쿼리를 조정한다.

- [ ] **Step 2: 마이그레이션 실행 및 롤백 동작 검증 (로컬 DB)**

Run:
```bash
cd backend && bun run migration:run
bun run migration:revert
bun run migration:run
```
Expected: 세 명령 모두 에러 없이 끝나고, 최종적으로 모든 테넌트의 `tenant_scopes` 에 `profile:write` 한 행씩 존재.

- [ ] **Step 3: 커밋**

```bash
git add backend/src/database/migrations/1776600000000-SeedProfileWriteScope.ts
git commit -m "feat(db): backfill profile:write scope for existing tenants"
```

---

## Task 3: `SelfUpdateUserDto` 생성

**Files:**
- Create: `backend/src/users/dto/self-update-user.dto.ts`

- [ ] **Step 1: DTO 작성**

```typescript
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

/**
 * 엔드유저가 본인 계정을 수정할 때 사용하는 DTO.
 * status 는 의도적으로 제외한다 — 본인이 자신을 잠그거나 활성화/비활성화할 수 없다.
 */
export class SelfUpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  loginId?: string;

  @ApiPropertyOptional({
    description: '업데이트할 프로필 필드 (기존 값과 병합)',
    example: { nickname: 'Johnny' },
  })
  @IsOptional()
  @IsObject()
  profile?: Record<string, unknown>;
}
```

- [ ] **Step 2: 빌드 확인**

Run: `cd backend && bun run build`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add backend/src/users/dto/self-update-user.dto.ts
git commit -m "feat(users): add SelfUpdateUserDto for end-user profile edits"
```

---

## Task 4: `UsersService.updateSelf` 테스트부터 작성 (실패 테스트)

**Files:**
- Modify: `backend/src/users/users.service.spec.ts`

- [ ] **Step 1: 실패 테스트 추가**

`backend/src/users/users.service.spec.ts` 의 `describe('UsersService', () => { ... })` 블록 마지막에 추가:

```typescript
  describe('updateSelf', () => {
    let profileSchemaService: {
      validate: jest.Mock;
      findActive: jest.Mock;
    };
    let auditService: { record: jest.Mock };
    let dataSource: { transaction: jest.Mock };
    let profileRepoMock: { save: jest.Mock };
    let userRepoMock: {
      findOne: jest.Mock;
      save: jest.Mock;
    };

    beforeEach(() => {
      profileSchemaService = {
        validate: jest.fn().mockResolvedValue(undefined),
        findActive: jest.fn().mockResolvedValue({ id: 'schema-2' }),
      };
      auditService = { record: jest.fn().mockResolvedValue(undefined) };

      profileRepoMock = { save: jest.fn() };
      userRepoMock = {
        findOne: jest.fn().mockResolvedValue(structuredClone(user)),
        save: jest.fn().mockImplementation(async (u) => u),
      };

      const manager = {
        save: jest
          .fn()
          .mockImplementation(async (_entity, value) => value),
      };
      dataSource = {
        transaction: jest.fn().mockImplementation(async (cb) => cb(manager)),
      };

      service = new UsersService(
        userRepoMock as never,
        profileRepoMock as never,
        dataSource as never,
        profileSchemaService as never,
        auditService as never,
      );
    });

    it('merges profile fields and validates against the active schema', async () => {
      const result = await service.updateSelf(tenantId, userId, {
        profile: { nickname: 'Johnny' },
      });

      expect(profileSchemaService.validate).toHaveBeenCalledWith(tenantId, {
        name: 'Lee Jin Ho',
        department: 'Engineering',
        nickname: 'Johnny',
      });
      expect(result.profile.profileJsonb).toEqual({
        name: 'Lee Jin Ho',
        department: 'Engineering',
        nickname: 'Johnny',
      });
      expect(result.profile.schemaVersionId).toBe('schema-2');
    });

    it('updates loginId when provided', async () => {
      const result = await service.updateSelf(tenantId, userId, {
        loginId: 'lee-jinho',
      });

      expect(result.loginId).toBe('lee-jinho');
    });

    it('records a USER_UPDATED audit event with actorType=user', async () => {
      await service.updateSelf(
        tenantId,
        userId,
        { profile: { nickname: 'J' } },
        { actorId: userId, ipAddress: '10.0.0.1' },
      );

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          action: 'USER.UPDATED',
          actorType: 'user',
          actorId: userId,
          targetType: 'user',
          targetId: userId,
          metadata: expect.objectContaining({ source: 'self_service' }),
          ipAddress: '10.0.0.1',
        }),
      );
    });

    it('throws NotFoundException when the user does not exist', async () => {
      userRepoMock.findOne.mockResolvedValue(null);

      await expect(
        service.updateSelf(tenantId, userId, { loginId: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
```

> `structuredClone` 은 Node 18+/Bun 에서 글로벌. 테스트 환경에서 사용 가능.

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `cd backend && bun run test -- users.service`
Expected: `updateSelf is not a function` 또는 타입 에러로 FAIL.

- [ ] **Step 3: 커밋 (red 커밋)**

```bash
git add backend/src/users/users.service.spec.ts
git commit -m "test(users): cover self-service profile update contract"
```

---

## Task 5: `UsersService.updateSelf` 구현

**Files:**
- Modify: `backend/src/users/users.service.ts:17-18,133-170`

- [ ] **Step 1: import 에 DTO 추가**

`backend/src/users/users.service.ts` 상단 import 영역에서 `UpdateUserDto` 아래에 추가:

```typescript
import { SelfUpdateUserDto } from './dto/self-update-user.dto';
```

- [ ] **Step 2: `update` 메서드 뒤에 `updateSelf` 추가**

`activate(...)` 메서드 바로 위에 삽입:

```typescript
  /**
   * 엔드유저가 본인 프로필/loginId 를 수정한다.
   * 관리자용 update() 와 분리한 이유:
   *  - status 필드는 본인이 변경할 수 없어야 한다.
   *  - audit actorType 이 'user' 고정이다.
   *  - 호출부가 TenantAdminGuard 없이 access_token 만으로 도달한다.
   */
  async updateSelf(
    tenantId: string,
    userId: string,
    dto: SelfUpdateUserDto,
    ctx?: AuditContext,
  ): Promise<User> {
    const user = await this.findOne(tenantId, userId);

    if (dto.loginId !== undefined) user.loginId = dto.loginId;

    if (dto.profile) {
      const merged = { ...user.profile.profileJsonb, ...dto.profile };
      await this.profileSchemaService.validate(tenantId, merged);

      const activeSchema = await this.profileSchemaService.findActive(tenantId);
      user.profile.profileJsonb = merged;
      user.profile.schemaVersionId = activeSchema?.id ?? null;
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      if (dto.profile) {
        await manager.save(UserProfile, user.profile);
      }
      return manager.save(User, user);
    });

    await this.auditService.record({
      tenantId,
      action: AuditAction.USER_UPDATED,
      actorType: 'user',
      actorId: ctx?.actorId ?? userId,
      targetType: 'user',
      targetId: userId,
      metadata: { source: 'self_service', dto },
      ipAddress: ctx?.ipAddress ?? null,
      userAgent: ctx?.userAgent ?? null,
      requestId: ctx?.requestId ?? null,
    });

    return saved;
  }
```

> `actorType` 은 `ctx` 에 있더라도 `'user'` 로 하드코딩한다 — self-service 임을 감사 로그에서 명확히 구분한다. 중복 actorId 전달 시에도 userId fallback 으로 일관성 보장.

- [ ] **Step 3: 테스트 재실행하여 통과 확인**

Run: `cd backend && bun run test -- users.service`
Expected: 4개 신규 케이스 포함 전체 PASS.

- [ ] **Step 4: 커밋**

```bash
git add backend/src/users/users.service.ts
git commit -m "feat(users): implement UsersService.updateSelf"
```

---

## Task 6: `DiscoveryModule` 에 `UsersModule` 연결

**Files:**
- Modify: `backend/src/oauth/discovery/discovery.module.ts:9-18`

- [ ] **Step 1: import 추가**

파일 상단에 추가:

```typescript
import { UsersModule } from '../../users/users.module';
```

그리고 `@Module.imports` 배열을 다음으로 변경:

```typescript
  imports: [
    TypeOrmModule.forFeature([Tenant, AccessToken, User, UserProfile]),
    KeysModule,
    ScopesModule,
    UsersModule,
  ],
```

- [ ] **Step 2: 컴파일 확인**

Run: `cd backend && bun run build`
Expected: 순환 의존성 경고 없이 빌드 성공.

> `UsersModule` 은 `AdminAuthModule` 를 import 하지만 `DiscoveryModule` 과의 순환은 없다. 만약 순환 에러가 나오면 `forwardRef()` 대신 문제 원인을 먼저 분석한다.

- [ ] **Step 3: 커밋**

```bash
git add backend/src/oauth/discovery/discovery.module.ts
git commit -m "chore(discovery): wire UsersModule for userinfo write path"
```

---

## Task 7: `DiscoveryController` 에 토큰 검증 헬퍼 추출 (리팩터, 동작 동일)

**Files:**
- Modify: `backend/src/oauth/discovery/discovery.controller.ts:87-136`

- [ ] **Step 1: private 메서드 `verifyAccessToken` 추가**

컨트롤러 클래스 내부 `userinfo()` 메서드 뒤에 추가:

```typescript
  private async verifyAccessToken(
    tenantId: string,
    authHeader: string | undefined,
  ): Promise<{ sub: string; jti: string; scopes: Set<string> }> {
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Bearer token required');
    }
    const rawToken = authHeader.slice(7);

    const activeKey = await this.keysService.getActiveKey(null);
    let payload: { sub: string; jti: string; scope: string };
    try {
      const publicKey = createPublicKey(activeKey.publicKeyPem);
      payload = verify(rawToken, publicKey, {
        algorithms: ['RS256'],
      }) as typeof payload;
    } catch {
      throw new UnauthorizedException('invalid_token');
    }

    const tokenRecord = await this.accessTokenRepo.findOne({
      where: { tenantId, jti: payload.jti },
    });
    if (!tokenRecord || tokenRecord.revoked) {
      throw new UnauthorizedException('token_revoked');
    }

    return {
      sub: payload.sub,
      jti: payload.jti,
      scopes: new Set((payload.scope ?? '').split(' ').filter(Boolean)),
    };
  }
```

- [ ] **Step 2: 기존 `userinfo()` 를 헬퍼로 교체**

기존 `userinfo()` 메서드 본문 (87-136행) 을 아래로 대체:

```typescript
  @Get('oauth/userinfo')
  @UseGuards(RequireTenantGuard)
  @ApiOperation({ summary: 'UserInfo (Bearer 액세스 토큰 필요)' })
  async userinfo(
    @CurrentTenant() tenant: TenantContext,
    @Headers('authorization') authHeader?: string,
  ) {
    const { sub, scopes } = await this.verifyAccessToken(
      tenant.tenantId,
      authHeader,
    );

    const user = await this.userRepo.findOne({
      where: { id: sub, tenantId: tenant.tenantId },
    });
    if (!user) throw new UnauthorizedException('user_not_found');

    const profile = await this.profileRepo.findOne({
      where: { userId: user.id },
    });

    const claims: Record<string, unknown> = { sub: user.id };
    if (scopes.has('email')) claims['email'] = user.email;
    if (scopes.has('profile') && profile) {
      claims['profile'] = profile.profileJsonb;
    }

    return claims;
  }
```

- [ ] **Step 3: 기존 테스트 재확인 (행동 동일)**

Run: `cd backend && bun run test:e2e`
Expected: 기존 e2e 스펙 GREEN. (아직 PATCH 테스트는 없음.)

- [ ] **Step 4: 커밋**

```bash
git add backend/src/oauth/discovery/discovery.controller.ts
git commit -m "refactor(discovery): extract verifyAccessToken helper for reuse"
```

---

## Task 8: `PATCH /oauth/userinfo` e2e 테스트 작성 (실패)

**Files:**
- Create: `backend/test/oauth-userinfo-patch.e2e-spec.ts`

- [ ] **Step 1: 테스트 파일 작성**

```typescript
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { sign } from 'jsonwebtoken';
import { createPrivateKey } from 'crypto';
import { AppModule } from '../src/app.module';
import {
  AccessToken,
  Tenant,
  User,
  UserProfile,
  UserStatus,
  SigningKey,
} from '../src/database/entities';

describe('PATCH /t/:slug/oauth/userinfo (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let tenantSlug = 'acme';
  let userId: string;
  let tenantId: string;
  let privateKeyPem: string;

  const signToken = (payload: Record<string, unknown>) =>
    sign(payload, createPrivateKey(privateKeyPem), {
      algorithm: 'RS256',
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    dataSource = moduleRef.get(DataSource);

    const tenant = await dataSource
      .getRepository(Tenant)
      .save({ slug: tenantSlug, name: 'Acme' });
    tenantId = tenant.id;

    // 테스트용 RSA 키 쌍 (간단히 기존 fixture 사용 또는 직접 생성)
    const { generateKeyPairSync } = await import('crypto');
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    privateKeyPem = privateKey;

    await dataSource.getRepository(SigningKey).save({
      tenantId: null,
      publicKeyPem: publicKey,
      privateKeyPem: privateKey,
      isActive: true,
      algorithm: 'RS256',
    });

    const userRepo = dataSource.getRepository(User);
    const profileRepo = dataSource.getRepository(UserProfile);
    const saved = await userRepo.save({
      tenantId,
      email: 'jin@example.com',
      passwordHash: 'x',
      status: UserStatus.ACTIVE,
    });
    userId = saved.id;
    await profileRepo.save({
      tenantId,
      userId,
      profileJsonb: { nickname: 'Jin' },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const storeToken = async (jti: string, scope: string) => {
    await dataSource.getRepository(AccessToken).save({
      tenantId,
      jti,
      userId,
      clientId: null,
      scope,
      revoked: false,
      expiresAt: new Date(Date.now() + 60_000),
    });
  };

  it('rejects requests without Bearer token', async () => {
    await request(app.getHttpServer())
      .patch(`/t/${tenantSlug}/oauth/userinfo`)
      .send({ profile: { nickname: 'X' } })
      .expect(401);
  });

  it('rejects tokens missing profile:write scope', async () => {
    const jti = 'jti-readonly';
    await storeToken(jti, 'openid profile');
    const token = signToken({ sub: userId, jti, scope: 'openid profile' });

    await request(app.getHttpServer())
      .patch(`/t/${tenantSlug}/oauth/userinfo`)
      .set('Authorization', `Bearer ${token}`)
      .send({ profile: { nickname: 'X' } })
      .expect(403);
  });

  it('merges profile fields when profile:write is granted', async () => {
    const jti = 'jti-write';
    await storeToken(jti, 'openid profile profile:write');
    const token = signToken({
      sub: userId,
      jti,
      scope: 'openid profile profile:write',
    });

    const res = await request(app.getHttpServer())
      .patch(`/t/${tenantSlug}/oauth/userinfo`)
      .set('Authorization', `Bearer ${token}`)
      .send({ profile: { nickname: 'Johnny', city: 'Seoul' } })
      .expect(200);

    expect(res.body.profile).toEqual({
      nickname: 'Johnny',
      city: 'Seoul',
    });
  });

  it('ignores status field from self-service payload (DTO whitelist)', async () => {
    const jti = 'jti-status';
    await storeToken(jti, 'profile:write');
    const token = signToken({
      sub: userId,
      jti,
      scope: 'profile:write',
    });

    const res = await request(app.getHttpServer())
      .patch(`/t/${tenantSlug}/oauth/userinfo`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'LOCKED', loginId: 'johnny' })
      .expect(200);

    const user = await dataSource
      .getRepository(User)
      .findOne({ where: { id: userId } });
    expect(user?.status).toBe(UserStatus.ACTIVE);
    expect(res.body.loginId).toBe('johnny');
  });
});
```

> DB 스키마/필드명이 엔티티와 다를 경우 테스트를 실행하여 빠르게 피드백을 받는다. `SigningKey` 에 `tenantId: null` 이 허용되는지는 엔티티를 확인 후 필요 시 tenantId 로 변경.

- [ ] **Step 2: 테스트 실행 (FAIL 확인)**

Run: `cd backend && bun run test:e2e -- oauth-userinfo-patch`
Expected: 404 (핸들러 없음) 또는 "Cannot PATCH" 오류로 FAIL.

- [ ] **Step 3: 커밋 (red 커밋)**

```bash
git add backend/test/oauth-userinfo-patch.e2e-spec.ts
git commit -m "test(e2e): cover PATCH /oauth/userinfo self-service contract"
```

---

## Task 9: `PATCH /oauth/userinfo` 핸들러 구현

**Files:**
- Modify: `backend/src/oauth/discovery/discovery.controller.ts`
- Modify: `backend/src/oauth/discovery/discovery.controller.ts` (import 영역)

- [ ] **Step 1: import 보강**

파일 상단 import 영역에 추가:

```typescript
import {
  Body,
  ForbiddenException,
  Ip,
  Patch,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { UsersService } from '../../users/users.service';
import { SelfUpdateUserDto } from '../../users/dto/self-update-user.dto';
```

- [ ] **Step 2: 생성자에 `UsersService` 주입**

생성자 파라미터에 맨 끝으로 추가:

```typescript
    private readonly usersService: UsersService,
```

- [ ] **Step 3: 핸들러 추가**

기존 `userinfo()` GET 핸들러 아래에 삽입:

```typescript
  @Patch('oauth/userinfo')
  @UseGuards(RequireTenantGuard)
  @ApiOperation({
    summary: '본인 프로필 수정 (profile:write scope 필요)',
  })
  async updateUserinfo(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: SelfUpdateUserDto,
    @Req() req: Request,
    @Ip() ip: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const { sub, scopes } = await this.verifyAccessToken(
      tenant.tenantId,
      authHeader,
    );
    if (!scopes.has('profile:write')) {
      throw new ForbiddenException('insufficient_scope');
    }

    const saved = await this.usersService.updateSelf(
      tenant.tenantId,
      sub,
      dto,
      {
        actorId: sub,
        actorType: 'user',
        ipAddress: ip ?? null,
        userAgent: (req.headers['user-agent'] as string) ?? null,
        requestId: (req.headers['x-request-id'] as string) ?? null,
      },
    );

    const profile = await this.profileRepo.findOne({
      where: { userId: saved.id },
    });

    return {
      sub: saved.id,
      loginId: saved.loginId,
      profile: profile?.profileJsonb ?? {},
    };
  }
```

> 응답 body 는 userinfo GET 과 유사한 모양으로 유지해 클라이언트 파싱 로직을 재활용할 수 있게 한다.

- [ ] **Step 4: e2e 테스트 통과 확인**

Run: `cd backend && bun run test:e2e -- oauth-userinfo-patch`
Expected: 4 케이스 모두 PASS.

- [ ] **Step 5: 단위 테스트 전체 실행**

Run: `cd backend && bun run test`
Expected: 기존 케이스 포함 전부 PASS.

- [ ] **Step 6: 커밋**

```bash
git add backend/src/oauth/discovery/discovery.controller.ts
git commit -m "feat(oauth): allow profile self-update via PATCH /oauth/userinfo"
```

---

## Task 10: Discovery 문서에 쓰기 스코프 노출 (선택)

**Files:**
- Modify: `backend/src/oauth/discovery/discovery.controller.ts:54-77`

- [ ] **Step 1: grant/scope 응답 확인**

`discovery()` 핸들러의 응답 `scopes_supported` 는 이미 `scopesService.getSupportedScopes(tenantId)` 로 DB 조회하므로 Task 1+2 적용 후 자동으로 `profile:write` 가 포함된다. 이 Task 에서는 별도 코드 변경 없음을 **확인만** 한다.

Run:
```bash
cd backend && bun run start:dev &
sleep 3
curl -s http://localhost:3000/t/<existing-tenant-slug>/.well-known/openid-configuration | jq .scopes_supported
kill %1
```
Expected: 출력 배열에 `"profile:write"` 포함.

- [ ] **Step 2: 커밋 불필요 — 코드 변경 없음.**

---

## Task 11: 문서 업데이트

**Files:**
- Modify: `docs/` 아래 OAuth 관련 문서 (`docs/oauth-flows.md` 등 존재 시) 또는 새 문서

- [ ] **Step 1: 기존 문서 탐색**

Run: `ls docs/ && grep -r "oauth/userinfo" docs/ || true`
Expected: OAuth 관련 기존 문서 파악.

- [ ] **Step 2: 사용 예시 섹션 추가**

가장 관련 있는 문서(없다면 `docs/oauth-self-service-profile.md` 신규 생성)에 다음 섹션을 추가:

````markdown
## Self-service profile update

외부 앱이 사용자 프로필을 수정하려면 다음 조건을 만족해야 한다.

1. 사용자가 `profile:write` scope 를 포함한 동의를 완료한 access token 발급
2. `PATCH /t/{tenantSlug}/oauth/userinfo` 에 Bearer token 으로 요청

**요청 예시**

```http
PATCH /t/acme/oauth/userinfo HTTP/1.1
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "profile": { "nickname": "Johnny" },
  "loginId": "johnny"
}
```

**응답 예시**

```json
{
  "sub": "b4c2...",
  "loginId": "johnny",
  "profile": { "nickname": "Johnny", "department": "Engineering" }
}
```

**제약**

- `status` 등 관리자 전용 필드는 DTO 에서 제거되어 무시된다.
- 요청 body 의 `profile` 은 기존 값과 shallow-merge 된 뒤 활성 schema 로 검증된다.
- scope 에 `profile:write` 가 없으면 `403 insufficient_scope`.
````

- [ ] **Step 3: 커밋**

```bash
git add docs/
git commit -m "docs: describe self-service profile update endpoint"
```

---

## Final Verification

- [ ] **Step 1: 전체 테스트**

Run: `cd backend && bun run test && bun run test:e2e`
Expected: 모든 스펙 GREEN.

- [ ] **Step 2: 빌드**

Run: `cd backend && bun run build`
Expected: 경고/에러 없이 완료.

- [ ] **Step 3: graphify 업데이트 (CLAUDE.md 규칙)**

Run (프로젝트 루트): `graphify update .`
Expected: 변경 파일 반영.

- [ ] **Step 4: 최종 커밋 (필요 시)**

```bash
git status
git add graphify-out/
git commit -m "chore(graph): refresh after self-service profile feature"
```
