# 구현 계획: id_token/nonce/email_verified + revoke 클라이언트 인증

## Context

OIDC 표준 준수를 위해 두 가지 기능을 추가한다.
1. `authorization_code` 교환 시 `id_token` 발급, `nonce` 지원, `userinfo`에 `email_verified` 추가
2. Confidential Client의 revoke 요청에 클라이언트 인증 적용 (RFC 7009 §2.1)

설계 문서: `docs/specs/2026-06-02-id-token-nonce-email-verified.md`, `docs/specs/2026-06-02-revoke-client-auth.md`

---

## 구현 A: id_token / nonce / email_verified

### A-1. 마이그레이션 생성

```bash
bun run migration:generate -- src/database/migrations/AddNonceToOAuthRequests
```

생성된 마이그레이션에 두 테이블의 변경을 담는다:
- `pending_oauth_requests`: `nonce VARCHAR NULL` 추가
- `authorization_codes`: `nonce VARCHAR NULL` 추가

> User 엔티티에 `email_verified` 컬럼은 추가하지 않는다.  
> `status === ACTIVE`로 파생하므로 마이그레이션 불필요.

### A-2. 엔티티 & 인터페이스 변경

**`PendingOAuthRequest` 엔티티** (`database/entities/pending-oauth-request.entity.ts`):
```typescript
@Column({ type: 'varchar', nullable: true })
nonce: string | null;
```

**`AuthorizationCode` 엔티티** (`database/entities/authorization-code.entity.ts`):
```typescript
@Column({ type: 'varchar', nullable: true })
nonce: string | null;
```

**`PendingAuthRequest` 인터페이스** (`authorize/pending-request.store.ts`):
```typescript
nonce?: string;
```

### A-3. authorize 흐름 — nonce 전달

**`AuthorizeQueryDto`** (`authorize/dto/authorize-query.dto.ts`):
```typescript
@ApiPropertyOptional()
@IsOptional()
@IsString()
nonce?: string;
```

**`TypeOrmPendingRequestStore.save()`** (`authorize/typeorm-pending-request.store.ts`):
```typescript
nonce: request.nonce ?? null,
```

**`TypeOrmPendingRequestStore.get()`**:
```typescript
...(row.nonce != null && { nonce: row.nonce }),
```

**`authorize.service.ts` `initiateAuthorize()`**:
```typescript
await this.pendingStore.save({ ..., nonce: query.nonce });
```

**`authorize.service.ts` `issueAuthCode()`** — AuthorizationCode 생성:
```typescript
const authCode = this.codeRepo.create({
  ...,
  nonce: pending.nonce ?? null,
});
```

### A-4. token.service.ts — id_token 생성

**`TokenResponse` 인터페이스**에 `id_token?: string` 추가.

**`issueTokenPairInTx()` 시그니처**에 optional 파라미터 추가:
```typescript
private async issueTokenPairInTx(
  ...,
  options: { nonce?: string | null } = {}
): Promise<IssueResult>
```

**`handleAuthorizationCode()`**에서 호출 시 nonce 전달:
```typescript
return this.issueTokenPairInTx(
  manager, tenantId, client.clientId, authCode.userId,
  authCode.scopes, accessTtl, refreshTtl,
  { nonce: authCode.nonce },
);
```

**`issueTokenPairInTx()` 내부** — access_token 생성 후, userId + openid scope 조건:
```typescript
if (userId && scopes.includes('openid')) {
  const user = await manager.findOne(User, { where: { id: userId } });

  const idPayload: Record<string, unknown> = {
    sub: userId,
    ...(options.nonce ? { nonce: options.nonce } : {}),
  };

  if (scopes.includes('email') && user?.email) {
    idPayload['email'] = user.email;
    idPayload['email_verified'] = user?.status === UserStatus.ACTIVE;
  }

  response.id_token = sign(idPayload, activeKey.privateKeyPem, {
    algorithm: 'RS256',
    issuer,
    audience: clientId,
    expiresIn: accessTtl,
    keyid: activeKey.kid,
  });
}
```

> `handleRefreshToken()`/`handleClientCredentials()`는 options를 전달하지 않으므로 id_token 미발급.

### A-5. userinfo — email_verified 추가

**`userinfo.controller.ts`** `userinfo()`:
```typescript
if (scopes.has('email')) {
  claims['email'] = user.email;
  claims['email_verified'] = user.status === UserStatus.ACTIVE;  // 추가
}
```

---

## 구현 B: revoke 클라이언트 인증

### B-1. RevokeModule — OAuthClient 등록

`revoke/revoke.module.ts`:
```typescript
TypeOrmModule.forFeature([AccessToken, RefreshToken, OAuthClient])
```

### B-2. RevokeController — Basic Auth 파싱 추가

`token.controller.ts`의 `parseBasicAuth()` 패턴을 그대로 복제한다.

```typescript
revoke(@CurrentTenant() tenant, @Body() dto, @Req() req) {
  const basicAuth = this.parseBasicAuth(req.headers['authorization']);
  return this.revokeService.revoke(tenant.tenantId, dto, basicAuth, { ... });
}

private parseBasicAuth(header?: string): { id?: string; secret?: string } {
  if (!header?.startsWith('Basic ')) return {};
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf-8');
  const [id, ...rest] = decoded.split(':');
  return { id, secret: rest.join(':') };
}
```

### B-3. RevokeService — 클라이언트 인증 로직 추가

`revoke.service.ts`에 `OAuthClient` 리포지토리 주입 추가.

`revoke()` 시그니처:
```typescript
async revoke(
  tenantId: string,
  dto: RevokeRequestDto,
  basicAuth: { id?: string; secret?: string },
  ctx?: AuditContext,
): Promise<void>
```

기존 토큰 처리 로직 **앞에** 클라이언트 인증 블록 삽입:
```typescript
const clientId = basicAuth.id ?? dto.client_id;

if (clientId) {
  const client = await this.clientRepo.findOne({
    where: { tenantId, clientId, status: ClientStatus.ACTIVE },
  });
  if (!client) throw new UnauthorizedException('invalid_client');

  if (client.type === ClientType.CONFIDENTIAL) {
    const secret = basicAuth.secret ?? dto.client_secret;
    if (!secret || !client.clientSecretHash) {
      throw new UnauthorizedException('invalid_client');
    }
    const valid = await CryptoUtil.verify(secret, client.clientSecretHash);
    if (!valid) throw new UnauthorizedException('invalid_client');
  }
}
// 기존 토큰 처리 로직 이어서 ...
```

> `clientId` 미제공 시 인증 건너뜀 — RFC 7009 멱등성(200 OK) 유지.

---

## 변경 파일 목록

| # | 파일 | 변경 |
|---|------|------|
| 1 | `database/entities/pending-oauth-request.entity.ts` | nonce 컬럼 |
| 2 | `database/entities/authorization-code.entity.ts` | nonce 컬럼 |
| 3 | `database/migrations/AddNonceToOAuthRequests` | 마이그레이션 (신규) |
| 4 | `authorize/pending-request.store.ts` | 인터페이스 nonce |
| 5 | `authorize/dto/authorize-query.dto.ts` | nonce 필드 |
| 6 | `authorize/typeorm-pending-request.store.ts` | nonce save/get |
| 7 | `authorize/authorize.service.ts` | nonce 전달 2곳 |
| 8 | `oauth/token/token.service.ts` | TokenResponse + id_token 생성 |
| 9 | `oauth/userinfo/userinfo.controller.ts` | email_verified |
| 10 | `oauth/revoke/revoke.module.ts` | OAuthClient 등록 |
| 11 | `oauth/revoke/revoke.controller.ts` | Basic Auth 파싱 |
| 12 | `oauth/revoke/revoke.service.ts` | 클라이언트 인증 로직 |

---

## 검증

```bash
# 마이그레이션 실행
bun run migration:run

# 개발 서버 기동 확인
bun run start:dev

# 단위/E2E 테스트
bun run test
bun run test:e2e
```

수동 확인 항목:
- `scope=openid`로 authorization_code 교환 → 응답에 `id_token` 포함
- `nonce` 전달 → `id_token.nonce` 일치
- `scope=openid email` → `id_token.email`, `id_token.email_verified` 포함
- `userinfo` 호출 → `email_verified` 포함
- `refresh_token` grant → `id_token` 미포함
- Confidential Client가 올바른 Basic Auth로 revoke → 200 OK
- Confidential Client가 잘못된 secret으로 revoke → 401 invalid_client
- Public Client가 `client_id`만으로 revoke → 200 OK
- client_id 없이 revoke → 200 OK (멱등성 유지)
