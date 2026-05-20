# OAuth Verify Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `CONFIDENTIAL` `client_credentials` 토큰과 사용자 `authorization_code` 토큰을 모두 검증할 수 있는 `POST /t/:tenantSlug/oauth/verify` 엔드포인트를 추가한다.

**Architecture:** 토큰 검증은 새 `OAuthTokenVerifierService`로 추출해 `verify` 엔드포인트, `OAuthAccessTokenGuard`, `DiscoveryController.userinfo()`가 같은 검증 규칙을 공유하게 한다. `/oauth/verify`는 `Authorization: Bearer <access_token>`으로 받은 토큰을 검증하고, 성공 시 토큰 주체가 `user`인지 `client`인지 구분한 표준 claims 응답을 반환한다. `userinfo`는 계속 사용자 토큰 전용으로 유지하고, M2M 토큰 검증은 `/oauth/verify` 또는 기존 M2M API 가드에서 처리한다.

**Tech Stack:** NestJS 11, TypeORM, `jsonwebtoken`, existing `KeysService`, `AccessToken` repository, Jest, Supertest.

---

## Background

현재 `GET /t/:tenantSlug/oauth/userinfo`는 JWT를 검증한 뒤 `sub`를 사용자 ID로 간주하고 `users` 테이블을 조회한다. `client_credentials`로 발급된 M2M 토큰은 `sub = clientId`, `access_tokens.userId = null`이므로 `userinfo`에서 `user_not_found`가 발생하는 것이 정상 동작이다.

새 endpoint의 목적은 `userinfo` 의미를 바꾸지 않고, 리소스 서버나 외부 백엔드가 Authori 토큰의 서명, 만료, 폐기, 테넌트 일치를 검증할 수 있게 하는 것이다.

---

## API Contract

### Verify Access Token

```http
POST /t/:tenantSlug/oauth/verify
Authorization: Bearer <access_token>
```

성공 응답: `200 OK`

```json
{
  "active": true,
  "subjectType": "client",
  "sub": "client-id",
  "clientId": "client-id",
  "tenantId": "tenant-uuid",
  "scope": "users:read rbac:read",
  "scopes": ["users:read", "rbac:read"],
  "jti": "token-jti",
  "expiresAt": "2026-05-20T12:34:56.000Z"
}
```

사용자 토큰 성공 응답:

```json
{
  "active": true,
  "subjectType": "user",
  "sub": "user-uuid",
  "clientId": "client-id",
  "tenantId": "tenant-uuid",
  "scope": "openid profile email",
  "scopes": ["openid", "profile", "email"],
  "jti": "token-jti",
  "expiresAt": "2026-05-20T12:34:56.000Z"
}
```

실패 응답:

| Case | Status | Message |
|---|---:|---|
| Bearer header 없음 | 401 | `Bearer token required` |
| JWT 서명/형식/만료 실패 | 401 | `invalid_token` |
| URL tenant와 token `tenant_id` 불일치 | 401 | `tenant_mismatch` |
| DB에 `jti` 없음 | 401 | `token_revoked` |
| DB 토큰 `revoked = true` | 401 | `token_revoked` |
| DB `expiresAt` 만료 | 401 | `token_revoked` |

`active: false` 형태의 RFC 7662 introspection 응답은 이번 범위에서 제외한다. 이 API는 "presented bearer token 검증" 용도이며, 실패는 기존 Authori guard 패턴처럼 401로 처리한다.

---

## File Structure

- Create: `backend/src/oauth/token/oauth-token-verifier.service.ts`
  - Bearer header 파싱, JWT 검증, tenant 일치 확인, DB `access_tokens` 조회, revocation/expiry 확인, response shape 생성.
- Create: `backend/src/oauth/token/oauth-token-verifier.service.spec.ts`
  - 서비스 단위 테스트. 서명 성공, client token subject type, user token subject type, tenant mismatch, revoked/expired token을 검증.
- Create: `backend/src/oauth/token/dto/verify-token-response.dto.ts`
  - Swagger 응답 DTO.
- Modify: `backend/src/oauth/token/token.controller.ts`
  - `POST /verify` 핸들러 추가.
- Modify: `backend/src/oauth/token/token.module.ts`
  - `OAuthTokenVerifierService` provider/export 등록.
- Modify: `backend/src/common/guards/oauth-access-token.guard.ts`
  - 새 verifier service를 사용해 M2M API와 verify endpoint 검증 규칙을 공유.
- Modify: `backend/src/oauth/discovery/discovery.controller.ts`
  - private `verifyAccessToken()` 제거 또는 얇은 wrapper로 변경해 새 verifier service 사용.
- Modify: `backend/src/oauth/discovery/discovery.module.ts`
  - `TokenModule` 또는 verifier provider 의존성 연결. 순환 의존이 생기면 `OAuthTokenVerifierService`를 `backend/src/oauth/token-verifier/` 같은 독립 모듈로 옮긴다.
- Create: `backend/test/oauth-verify.e2e-spec.ts`
  - 실제 Nest app에서 `/oauth/verify` 성공/실패 계약 테스트.
- Modify: `docs/guide/authori-integration-guide.md`
  - `userinfo`는 사용자 토큰용, `/oauth/verify`는 사용자/M2M 토큰 검증용임을 문서화.

---

## Design Decisions

1. **Endpoint method:** `POST`를 사용한다. 토큰 검증은 캐시되면 안 되고 Authorization header를 다루므로 `GET`보다 `POST`가 안전하다.
2. **Token input:** body token 파라미터는 받지 않는다. `Authorization: Bearer`만 지원해 토큰이 로그/폼 body에 섞이는 경로를 줄인다.
3. **Subject type:** DB `AccessToken.userId`가 있으면 `user`, 없으면 `client`로 판단한다. JWT의 `sub`만으로 추론하지 않는다.
4. **Tenant check:** JWT `tenant_id`와 URL의 `tenantSlug`가 해석한 `tenantId`를 반드시 비교한다.
5. **Expiry check:** `jsonwebtoken.verify()`의 `exp` 검증과 DB `access_tokens.expiresAt` 검증을 모두 수행한다.
6. **No user lookup:** `/oauth/verify`는 `users` 테이블을 조회하지 않는다. 그래서 `client_credentials` 토큰도 정상 검증된다.

---

## Task 1: Add Token Verifier Service Tests

**Files:**
- Create: `backend/src/oauth/token/oauth-token-verifier.service.spec.ts`
- Later implementation: `backend/src/oauth/token/oauth-token-verifier.service.ts`

- [ ] **Step 1: Write the failing service spec**

Create `backend/src/oauth/token/oauth-token-verifier.service.spec.ts`:

```typescript
import { UnauthorizedException } from '@nestjs/common';
import { generateKeyPairSync } from 'crypto';
import { sign } from 'jsonwebtoken';
import { OAuthTokenVerifierService } from './oauth-token-verifier.service';

describe('OAuthTokenVerifierService', () => {
  const tenantId = 'tenant-1';
  const clientId = 'client-1';
  const jti = 'token-jti';
  let privateKeyPem: string;
  let publicKeyPem: string;
  let service: OAuthTokenVerifierService;
  let accessTokenRepo: {
    findOne: jest.Mock;
  };

  beforeEach(() => {
    const keyPair = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    privateKeyPem = keyPair.privateKey;
    publicKeyPem = keyPair.publicKey;

    accessTokenRepo = { findOne: jest.fn() };
    service = new OAuthTokenVerifierService(
      { getActiveKey: jest.fn().mockResolvedValue({ publicKeyPem }) } as any,
      accessTokenRepo as any,
    );
  });

  function token(payload: Record<string, unknown>) {
    return sign(payload, privateKeyPem, {
      algorithm: 'RS256',
      expiresIn: 3600,
      issuer: 'https://auth.example.com/t/acme',
      audience: clientId,
    });
  }

  it('verifies a client_credentials token as subjectType=client', async () => {
    const rawToken = token({
      sub: clientId,
      client_id: clientId,
      tenant_id: tenantId,
      scope: 'users:read rbac:read',
      jti,
    });
    const expiresAt = new Date(Date.now() + 3600_000);
    accessTokenRepo.findOne.mockResolvedValue({
      tenantId,
      clientId,
      userId: null,
      jti,
      scopes: ['users:read', 'rbac:read'],
      revoked: false,
      expiresAt,
    });

    await expect(
      service.verifyBearer(tenantId, `Bearer ${rawToken}`),
    ).resolves.toEqual({
      active: true,
      subjectType: 'client',
      sub: clientId,
      clientId,
      tenantId,
      scope: 'users:read rbac:read',
      scopes: ['users:read', 'rbac:read'],
      jti,
      expiresAt: expiresAt.toISOString(),
      roles: undefined,
      permissions: undefined,
    });
  });

  it('verifies an authorization_code token as subjectType=user', async () => {
    const rawToken = token({
      sub: 'user-1',
      client_id: clientId,
      tenant_id: tenantId,
      scope: 'openid email',
      roles: ['member'],
      permissions: ['profile:read'],
      jti,
    });
    const expiresAt = new Date(Date.now() + 3600_000);
    accessTokenRepo.findOne.mockResolvedValue({
      tenantId,
      clientId,
      userId: 'user-1',
      jti,
      scopes: ['openid', 'email'],
      revoked: false,
      expiresAt,
    });

    await expect(
      service.verifyBearer(tenantId, `Bearer ${rawToken}`),
    ).resolves.toMatchObject({
      active: true,
      subjectType: 'user',
      sub: 'user-1',
      clientId,
      tenantId,
      scopes: ['openid', 'email'],
      roles: ['member'],
      permissions: ['profile:read'],
    });
  });

  it('rejects missing bearer header', async () => {
    await expect(service.verifyBearer(tenantId, undefined)).rejects.toThrow(
      new UnauthorizedException('Bearer token required'),
    );
  });

  it('rejects tenant mismatch', async () => {
    const rawToken = token({
      sub: clientId,
      client_id: clientId,
      tenant_id: 'other-tenant',
      scope: 'users:read',
      jti,
    });

    await expect(
      service.verifyBearer(tenantId, `Bearer ${rawToken}`),
    ).rejects.toThrow(new UnauthorizedException('tenant_mismatch'));
  });

  it('rejects revoked or expired database token records', async () => {
    const rawToken = token({
      sub: clientId,
      client_id: clientId,
      tenant_id: tenantId,
      scope: 'users:read',
      jti,
    });
    accessTokenRepo.findOne.mockResolvedValue({
      tenantId,
      clientId,
      userId: null,
      jti,
      scopes: ['users:read'],
      revoked: true,
      expiresAt: new Date(Date.now() + 3600_000),
    });

    await expect(
      service.verifyBearer(tenantId, `Bearer ${rawToken}`),
    ).rejects.toThrow(new UnauthorizedException('token_revoked'));
  });
});
```

- [ ] **Step 2: Run the failing service spec**

Run:

```bash
cd backend && bun run test -- oauth-token-verifier.service
```

Expected: FAIL because `oauth-token-verifier.service.ts` does not exist.

---

## Task 2: Implement OAuthTokenVerifierService

**Files:**
- Create: `backend/src/oauth/token/oauth-token-verifier.service.ts`
- Create: `backend/src/oauth/token/dto/verify-token-response.dto.ts`

- [ ] **Step 1: Add the response DTO**

Create `backend/src/oauth/token/dto/verify-token-response.dto.ts`:

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VerifyTokenResponseDto {
  @ApiProperty({ example: true })
  active: true;

  @ApiProperty({ enum: ['user', 'client'] })
  subjectType: 'user' | 'client';

  @ApiProperty()
  sub: string;

  @ApiProperty()
  clientId: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty()
  scope: string;

  @ApiProperty({ type: [String] })
  scopes: string[];

  @ApiProperty()
  jti: string;

  @ApiProperty()
  expiresAt: string;

  @ApiPropertyOptional({ type: [String] })
  roles?: string[];

  @ApiPropertyOptional({ type: [String] })
  permissions?: string[];
}
```

- [ ] **Step 2: Add the verifier service**

Create `backend/src/oauth/token/oauth-token-verifier.service.ts`:

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createPublicKey } from 'crypto';
import { verify } from 'jsonwebtoken';
import { Repository } from 'typeorm';
import { AccessToken } from '../../database/entities';
import { KeysService } from '../keys/keys.service';
import { VerifyTokenResponseDto } from './dto/verify-token-response.dto';

export interface OAuthAccessTokenPayload {
  sub: string;
  client_id?: string;
  tenant_id: string;
  scope?: string;
  scopes?: string[];
  roles?: string[];
  permissions?: string[];
  jti: string;
}

@Injectable()
export class OAuthTokenVerifierService {
  constructor(
    private readonly keysService: KeysService,
    @InjectRepository(AccessToken)
    private readonly accessTokenRepo: Repository<AccessToken>,
  ) {}

  async verifyBearer(
    tenantId: string,
    authHeader: string | undefined,
  ): Promise<VerifyTokenResponseDto> {
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Bearer token required');
    }

    const payload = await this.verifyJwt(authHeader.slice(7));
    if (!payload.jti || !payload.sub || !payload.tenant_id) {
      throw new UnauthorizedException('invalid_token');
    }
    if (payload.tenant_id !== tenantId) {
      throw new UnauthorizedException('tenant_mismatch');
    }

    const tokenRecord = await this.accessTokenRepo.findOne({
      where: { tenantId, jti: payload.jti },
    });
    if (
      !tokenRecord ||
      tokenRecord.revoked ||
      tokenRecord.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException('token_revoked');
    }

    const scopes = this.resolveScopes(payload, tokenRecord);
    return {
      active: true,
      subjectType: tokenRecord.userId ? 'user' : 'client',
      sub: payload.sub,
      clientId: payload.client_id ?? tokenRecord.clientId,
      tenantId,
      scope: scopes.join(' '),
      scopes,
      jti: payload.jti,
      expiresAt: tokenRecord.expiresAt.toISOString(),
      roles: payload.roles,
      permissions: payload.permissions,
    };
  }

  private async verifyJwt(rawToken: string): Promise<OAuthAccessTokenPayload> {
    const activeKey = await this.keysService.getActiveKey(null);
    try {
      const publicKey = createPublicKey(activeKey.publicKeyPem);
      return verify(rawToken, publicKey, {
        algorithms: ['RS256'],
      }) as OAuthAccessTokenPayload;
    } catch {
      throw new UnauthorizedException('invalid_token');
    }
  }

  private resolveScopes(
    payload: OAuthAccessTokenPayload,
    tokenRecord: AccessToken,
  ): string[] {
    if (Array.isArray(payload.scopes)) return payload.scopes;
    if (payload.scope) return payload.scope.split(' ').filter(Boolean);
    return tokenRecord.scopes ?? [];
  }
}
```

- [ ] **Step 3: Run the service spec**

Run:

```bash
cd backend && bun run test -- oauth-token-verifier.service
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/oauth/token/oauth-token-verifier.service.ts backend/src/oauth/token/oauth-token-verifier.service.spec.ts backend/src/oauth/token/dto/verify-token-response.dto.ts
git commit -m "feat(oauth): add access token verifier service"
```

---

## Task 3: Add POST /oauth/verify Controller Endpoint

**Files:**
- Modify: `backend/src/oauth/token/token.controller.ts`
- Modify: `backend/src/oauth/token/token.module.ts`

- [ ] **Step 1: Write controller unit test if none exists**

Create `backend/src/oauth/token/token.controller.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { TokenController } from './token.controller';
import { TokenService } from './token.service';
import { OAuthTokenVerifierService } from './oauth-token-verifier.service';

describe('TokenController', () => {
  it('delegates POST /verify to OAuthTokenVerifierService', async () => {
    const verifyResponse = {
      active: true,
      subjectType: 'client' as const,
      sub: 'client-1',
      clientId: 'client-1',
      tenantId: 'tenant-1',
      scope: 'users:read',
      scopes: ['users:read'],
      jti: 'jti-1',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    };
    const verifier = {
      verifyBearer: jest.fn().mockResolvedValue(verifyResponse),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [TokenController],
      providers: [
        { provide: TokenService, useValue: { issue: jest.fn() } },
        { provide: OAuthTokenVerifierService, useValue: verifier },
      ],
    }).compile();

    const controller = moduleRef.get(TokenController);
    await expect(
      controller.verify(
        { tenantId: 'tenant-1', tenantSlug: 'acme' },
        { headers: { authorization: 'Bearer token' } } as any,
      ),
    ).resolves.toBe(verifyResponse);
    expect(verifier.verifyBearer).toHaveBeenCalledWith(
      'tenant-1',
      'Bearer token',
    );
  });
});
```

- [ ] **Step 2: Run controller spec to verify it fails**

Run:

```bash
cd backend && bun run test -- token.controller
```

Expected: FAIL because `TokenController.verify()` does not exist.

- [ ] **Step 3: Add controller method**

Modify `backend/src/oauth/token/token.controller.ts`:

```typescript
import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBasicAuth,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
```

Inject the verifier:

```typescript
constructor(
  private readonly tokenService: TokenService,
  private readonly tokenVerifier: OAuthTokenVerifierService,
) {}
```

Add the endpoint below `issue()`:

```typescript
@Post('verify')
@ApiBearerAuth()
@ApiOkResponse({ type: VerifyTokenResponseDto })
@ApiOperation({
  summary: '액세스 토큰 검증',
  description:
    'Authorization Bearer 액세스 토큰의 서명, 만료, 폐기, 테넌트 일치를 검증한다. authorization_code와 client_credentials 토큰을 모두 지원한다.',
})
verify(@CurrentTenant() tenant: TenantContext, @Req() req: Request) {
  return this.tokenVerifier.verifyBearer(
    tenant.tenantId,
    req.headers['authorization'],
  );
}
```

Add imports:

```typescript
import { OAuthTokenVerifierService } from './oauth-token-verifier.service';
import { VerifyTokenResponseDto } from './dto/verify-token-response.dto';
```

- [ ] **Step 4: Register provider in module**

Modify `backend/src/oauth/token/token.module.ts`:

```typescript
import { OAuthTokenVerifierService } from './oauth-token-verifier.service';
```

Change providers/exports:

```typescript
providers: [TokenService, OAuthTokenVerifierService],
exports: [TokenService, OAuthTokenVerifierService],
```

- [ ] **Step 5: Run controller spec**

Run:

```bash
cd backend && bun run test -- token.controller
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/oauth/token/token.controller.ts backend/src/oauth/token/token.controller.spec.ts backend/src/oauth/token/token.module.ts
git commit -m "feat(oauth): expose token verify endpoint"
```

---

## Task 4: Reuse Verifier in OAuthAccessTokenGuard

**Files:**
- Modify: `backend/src/common/guards/oauth-access-token.guard.ts`
- Modify: `backend/src/common/guards/oauth-access-token.guard.spec.ts`
- Modify module imports only if tests or runtime dependency injection require it.

- [ ] **Step 1: Update guard spec expectation**

Modify `backend/src/common/guards/oauth-access-token.guard.spec.ts` so guard construction uses a verifier mock:

```typescript
const verifier = {
  verifyBearer: jest.fn().mockResolvedValue({
    active: true,
    subjectType: 'client',
    sub: 'client-1',
    clientId: 'client-1',
    tenantId: 'tenant-1',
    scope: 'rbac:read',
    scopes: ['rbac:read'],
    jti: 'jti-1',
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  }),
};
guard = new OAuthAccessTokenGuard(verifier as any);
```

The test should assert:

```typescript
expect(request.accessToken).toMatchObject({
  sub: 'client-1',
  client_id: 'client-1',
  tenant_id: 'tenant-1',
  scope: 'rbac:read',
  scopes: ['rbac:read'],
  jti: 'jti-1',
});
```

- [ ] **Step 2: Run guard spec to verify it fails**

Run:

```bash
cd backend && bun run test -- oauth-access-token.guard
```

Expected: FAIL while constructor and implementation still expect `KeysService` and `AccessToken` repository.

- [ ] **Step 3: Replace guard internals with verifier service**

Modify `backend/src/common/guards/oauth-access-token.guard.ts`:

```typescript
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { OAuthTokenVerifierService } from '../../oauth/token/oauth-token-verifier.service';
```

Constructor:

```typescript
constructor(private readonly tokenVerifier: OAuthTokenVerifierService) {}
```

`canActivate()` body:

```typescript
async canActivate(context: ExecutionContext): Promise<boolean> {
  const request = context.switchToHttp().getRequest<Request>();
  if (!request.tenantContext) {
    throw new UnauthorizedException('Tenant context is required');
  }

  const verified = await this.tokenVerifier.verifyBearer(
    request.tenantContext.tenantId,
    request.headers.authorization,
  );

  request.accessToken = {
    sub: verified.sub,
    client_id: verified.clientId,
    tenant_id: verified.tenantId,
    scope: verified.scope,
    scopes: verified.scopes,
    roles: verified.roles,
    permissions: verified.permissions,
    jti: verified.jti,
  };
  return true;
}
```

Keep the existing `OAuthAccessTokenPayload` interface exported so `ScopeGuard` and tests remain compatible.

- [ ] **Step 4: Ensure modules can inject the verifier**

`RbacModule` currently imports `KeysModule` and `TypeOrmModule.forFeature([AccessToken])`. After this change it also needs access to `OAuthTokenVerifierService`.

Preferred minimal change:

```typescript
import { TokenModule } from '../oauth/token/token.module';
```

Add `TokenModule` to `RbacModule.imports` only if it does not introduce a Nest circular dependency. If `RbacModule -> TokenModule -> RbacModule` becomes circular because `TokenModule` imports `RbacModule` for `TokenService`, do not use `forwardRef`. Instead move `OAuthTokenVerifierService` into a new independent module:

```text
backend/src/oauth/token-verifier/token-verifier.module.ts
backend/src/oauth/token-verifier/oauth-token-verifier.service.ts
backend/src/oauth/token-verifier/dto/verify-token-response.dto.ts
```

Then import `TokenVerifierModule` from both `TokenModule`, `DiscoveryModule`, and `RbacModule`.

- [ ] **Step 5: Run guard spec**

Run:

```bash
cd backend && bun run test -- oauth-access-token.guard
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/common/guards/oauth-access-token.guard.ts backend/src/common/guards/oauth-access-token.guard.spec.ts backend/src/rbac/rbac.module.ts backend/src/oauth/token
git commit -m "refactor(oauth): share access token verification in guards"
```

---

## Task 5: Reuse Verifier in UserInfo

**Files:**
- Modify: `backend/src/oauth/discovery/discovery.controller.ts`
- Modify: `backend/src/oauth/discovery/discovery.module.ts`
- Existing tests: `backend/test/oauth-userinfo-patch.e2e-spec.ts`

- [ ] **Step 1: Modify DiscoveryController constructor**

Add dependency:

```typescript
private readonly tokenVerifier: OAuthTokenVerifierService,
```

Import:

```typescript
import { OAuthTokenVerifierService } from '../token/oauth-token-verifier.service';
```

If Task 4 created `TokenVerifierModule`, import from:

```typescript
import { OAuthTokenVerifierService } from '../token-verifier/oauth-token-verifier.service';
```

- [ ] **Step 2: Replace private verifyAccessToken() implementation**

Replace the body of `verifyAccessToken()` in `backend/src/oauth/discovery/discovery.controller.ts` with:

```typescript
const verified = await this.tokenVerifier.verifyBearer(tenantId, authHeader);
return {
  sub: verified.sub,
  jti: verified.jti,
  scopes: new Set(verified.scopes),
};
```

Remove unused imports:

```typescript
import { verify } from 'jsonwebtoken';
import { createPublicKey } from 'crypto';
```

If no other code uses `KeysService` in `DiscoveryController`, remove it from constructor and module imports.

- [ ] **Step 3: Keep userinfo user-only behavior**

Do not change:

```typescript
const user = await this.userRepo.findOne({
  where: { id: sub, tenantId: tenant.tenantId },
});
if (!user) throw new UnauthorizedException('user_not_found');
```

This preserves the current contract: `/oauth/userinfo` is not a M2M verification endpoint.

- [ ] **Step 4: Wire module dependency**

If the verifier stays in `TokenModule`, add `TokenModule` to `DiscoveryModule.imports` only if it does not create a circular dependency. If Task 4 created `TokenVerifierModule`, add:

```typescript
import { TokenVerifierModule } from '../token-verifier/token-verifier.module';
```

and include `TokenVerifierModule` in imports.

- [ ] **Step 5: Run userinfo tests**

Run:

```bash
cd backend && bun run test:e2e -- oauth-userinfo-patch
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/oauth/discovery/discovery.controller.ts backend/src/oauth/discovery/discovery.module.ts
git commit -m "refactor(oauth): use shared verifier for userinfo tokens"
```

---

## Task 6: Add E2E Tests for POST /oauth/verify

**Files:**
- Create: `backend/test/oauth-verify.e2e-spec.ts`

- [ ] **Step 1: Write e2e spec**

Create `backend/test/oauth-verify.e2e-spec.ts`. Base it on `backend/test/oauth-userinfo-patch.e2e-spec.ts` setup style and include these cases:

```typescript
describe('POST /t/:slug/oauth/verify (e2e)', () => {
  it('verifies a client_credentials token and returns subjectType=client', async () => {
    // Arrange:
    // - create tenant
    // - create active signing key
    // - create CONFIDENTIAL OAuthClient with allowedGrants ['client_credentials']
    // - issue token through POST /t/:slug/oauth/token using Basic auth
    // Act:
    // - POST /t/:slug/oauth/verify with Authorization Bearer access_token
    // Assert:
    // - 200
    // - body.active === true
    // - body.subjectType === 'client'
    // - body.sub === client.clientId
    // - body.clientId === client.clientId
    // - body.scopes includes requested M2M scope
  });

  it('verifies an authorization_code token and returns subjectType=user', async () => {
    // Arrange:
    // - create tenant, user, client, authorization code
    // - exchange code through POST /t/:slug/oauth/token
    // Act:
    // - POST /t/:slug/oauth/verify with the issued access token
    // Assert:
    // - 200
    // - body.subjectType === 'user'
    // - body.sub === user.id
    // - body.clientId === client.clientId
  });

  it('rejects token from another tenant', async () => {
    // Arrange:
    // - create tenant A and tenant B
    // - issue token for tenant A
    // Act:
    // - POST /t/{tenantB.slug}/oauth/verify
    // Assert:
    // - 401
    // - body.message === 'tenant_mismatch'
  });

  it('rejects revoked access token', async () => {
    // Arrange:
    // - issue token
    // - update access_tokens.revoked = true for its jti
    // Act:
    // - POST /verify
    // Assert:
    // - 401
    // - body.message === 'token_revoked'
  });
});
```

Use real test code, not comments, when implementing. The comments above define exact coverage and assertions.

- [ ] **Step 2: Run e2e spec to verify behavior**

Run:

```bash
cd backend && bun run test:e2e -- oauth-verify
```

Expected: PASS after Tasks 2-5.

- [ ] **Step 3: Commit**

```bash
git add backend/test/oauth-verify.e2e-spec.ts
git commit -m "test(oauth): cover token verify endpoint"
```

---

## Task 7: Document Integration Guidance

**Files:**
- Modify: `docs/guide/authori-integration-guide.md`

- [ ] **Step 1: Add endpoint to endpoint table**

In the integration guide endpoint table near existing OAuth endpoints, add:

```markdown
| Access Token 검증 | `POST` | `/t/:tenantSlug/oauth/verify` |
```

- [ ] **Step 2: Add a section after UserInfo or M2M token issuance**

Add:

```markdown
### Access Token 검증

`/oauth/userinfo`는 사용자 프로필 조회용이며 `authorization_code`로 발급된 사용자 토큰을 전제로 한다. `client_credentials`로 발급된 M2M 토큰은 사용자가 없으므로 `/oauth/userinfo`가 아니라 `/oauth/verify`로 검증한다.

    POST /t/acme/oauth/verify
    Authorization: Bearer <access_token>

응답의 `subjectType`은 `user` 또는 `client`다. `subjectType=client`이면 `sub`는 사용자 ID가 아니라 OAuth `clientId`다.
```

- [ ] **Step 3: Add failure note**

Add:

```markdown
검증 실패는 401로 반환된다. 폐기되었거나 DB에 없는 `jti`는 `token_revoked`, URL 테넌트와 토큰의 `tenant_id`가 다르면 `tenant_mismatch`, 서명/형식/만료 실패는 `invalid_token`이다.
```

- [ ] **Step 4: Commit**

```bash
git add docs/guide/authori-integration-guide.md
git commit -m "docs(oauth): document token verify endpoint"
```

---

## Task 8: Full Verification

**Files:**
- No new files.

- [ ] **Step 1: Run focused tests**

Run:

```bash
cd backend && bun run test -- oauth-token-verifier.service token.controller oauth-access-token.guard
```

Expected: PASS.

- [ ] **Step 2: Run focused e2e tests**

Run:

```bash
cd backend && bun run test:e2e -- oauth-verify oauth-userinfo-patch m2m-rbac
```

Expected: PASS.

- [ ] **Step 3: Run build**

Run:

```bash
cd backend && bun run build
```

Expected: PASS.

- [ ] **Step 4: Update graphify**

Because backend code files changed, run:

```bash
graphify update .
```

Expected: graph update completes without API cost.

- [ ] **Step 5: Final commit if graph changed**

```bash
git add graphify-out
git commit -m "chore(graphify): update knowledge graph"
```

---

## Completion Criteria

- [ ] `POST /t/:tenantSlug/oauth/verify` exists and is documented in Swagger.
- [ ] `client_credentials` token returns `subjectType: "client"` instead of `user_not_found`.
- [ ] `authorization_code` token returns `subjectType: "user"`.
- [ ] Invalid, expired, revoked, and tenant-mismatched tokens return 401.
- [ ] `GET /oauth/userinfo` remains user-profile-only and continues returning `user_not_found` for M2M tokens.
- [ ] `OAuthAccessTokenGuard` and `DiscoveryController` use the same verifier service or an explicitly shared verifier module.
- [ ] Focused unit tests, e2e tests, and backend build pass.
- [ ] `graphify update .` has been run after code changes.

---

## Open Implementation Note

The only expected design fork is Nest module wiring. `TokenModule` currently imports `RbacModule` because `TokenService` needs `RbacService` for user role/permission claims. If importing `TokenModule` from `RbacModule` or `DiscoveryModule` creates a circular dependency, extract the verifier into an independent `TokenVerifierModule` immediately. Do not use `forwardRef` for this unless there is a strong reason; the verifier has a clean dependency set (`KeysModule`, `TypeOrmModule.forFeature([AccessToken])`) and should be easy to isolate.
