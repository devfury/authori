# id_token 발급 / nonce 지원 / email_verified 클레임 설계

**날짜**: 2026-06-02  
**상태**: 승인됨

## 개요

현재 토큰 엔드포인트가 `access_token`과 `refresh_token`만 반환하고 OIDC 필수 응답인 `id_token`을 발급하지 않는다. `scope=openid`를 포함한 `authorization_code` 교환 시 `id_token`을 발급하고, 인가 요청의 `nonce`를 `id_token`에 포함한다. 아울러 `userinfo` 엔드포인트에 `email_verified` 클레임을 추가한다.

---

## 변경 범위

### 1. `AuthorizeQueryDto` — nonce 필드 추가

`backend/src/oauth/authorize/dto/authorize-query.dto.ts`

```typescript
@ApiPropertyOptional({ example: 'random_nonce_value' })
@IsOptional()
@IsString()
nonce?: string;
```

---

### 2. `PendingAuthRequest` 인터페이스 — nonce 필드 추가

`backend/src/oauth/authorize/pending-request.store.ts`

```typescript
export interface PendingAuthRequest {
  // 기존 필드 유지 ...
  nonce?: string;   // 추가
}
```

`InMemoryPendingRequestStore.save()`도 nonce를 저장하도록 확인 (스프레드로 전달되므로 자동 반영).

---

### 3. `PendingOAuthRequest` 엔티티 — nonce 컬럼 추가

`backend/src/database/entities/pending-oauth-request.entity.ts`

```typescript
@Column({ type: 'varchar', nullable: true })
nonce: string | null;
```

---

### 4. `TypeOrmPendingRequestStore` — nonce 저장/조회

`backend/src/oauth/authorize/typeorm-pending-request.store.ts`

`save()`:
```typescript
nonce: request.nonce ?? null,
```

`get()` 반환값:
```typescript
...(row.nonce != null && { nonce: row.nonce }),
```

---

### 5. `AuthorizationCode` 엔티티 — nonce 컬럼 추가

`backend/src/database/entities/authorization-code.entity.ts`

```typescript
@Column({ type: 'varchar', nullable: true })
nonce: string | null;
```

---

### 6. `authorize.service.ts` — nonce 흐름 연결

`initiateAuthorize()` — pending store 저장 시 nonce 포함:

```typescript
const requestId = await this.pendingStore.save({
  // 기존 필드 ...
  nonce: query.nonce,
});
```

`issueAuthCode()` — AuthorizationCode 생성 시 nonce 포함:

```typescript
const authCode = this.codeRepo.create({
  // 기존 필드 ...
  nonce: pending.nonce ?? null,
});
```

---

### 7. `TokenResponse` 인터페이스 — id_token 추가

`backend/src/oauth/token/token.service.ts`

```typescript
export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token?: string;
  scope: string;
  id_token?: string;   // 추가
}
```

---

### 8. `token.service.ts` — id_token 생성

`issueTokenPairInTx()` 내부에서 `authorization_code` 교환 시, scope에 `openid`가 포함되고 `userId`가 있으면 id_token을 생성한다.

```typescript
if (userId && scopes.includes('openid')) {
  // userId로 User 조회 (email 획득)
  const user = await manager.findOne(User, { where: { id: userId } });

  const idTokenPayload: Record<string, unknown> = {
    sub: userId,
    nonce: authCode?.nonce ?? undefined,   // 아래 설명 참조
  };

  if (scopes.includes('email') && user?.email) {
    idTokenPayload['email'] = user.email;
    idTokenPayload['email_verified'] = user.status === UserStatus.ACTIVE;
  }

  const idToken = sign(idTokenPayload, activeKey.privateKeyPem, {
    algorithm: 'RS256',
    issuer,
    audience: clientId,
    expiresIn: accessTtl,
    keyid: activeKey.kid,
  });

  response.id_token = idToken;
}
```

**nonce 전달 방법**: `issueTokenPairInTx()`는 현재 `authCode` 객체를 받지 않는다. nonce를 전달하는 두 가지 방법 중 하나를 선택한다.

- **방법 A (권장)**: `issueTokenPairInTx()` 시그니처에 `nonce?: string | null` 파라미터를 추가한다.
- **방법 B**: `handleAuthorizationCode()`에서 id_token 생성 로직을 인라인으로 처리한다.

방법 A가 인터페이스가 더 명확하므로 권장한다.

`handleAuthorizationCode()`에서 호출 시:
```typescript
return this.issueTokenPairInTx(
  manager, tenantId, client.clientId, authCode.userId,
  authCode.scopes, accessTtl, refreshTtl,
  { nonce: authCode.nonce },   // 추가
);
```

`handleRefreshToken()`과 `handleClientCredentials()`는 nonce를 전달하지 않으므로 id_token이 발급되지 않는다 (OIDC 표준에 맞음).

---

### 9. `userinfo.controller.ts` — email_verified 추가

`backend/src/oauth/userinfo/userinfo.controller.ts`

`email` scope 처리 블록:

```typescript
if (scopes.has('email')) {
  claims['email'] = user.email;
  claims['email_verified'] = user.status === UserStatus.ACTIVE;  // 추가
}
```

---

## DB 마이그레이션

`bun run migration:generate -- src/database/migrations/AddNonceToOAuthRequests`

생성될 마이그레이션이 커버할 변경:

| 테이블 | 변경 |
| --- | --- |
| `pending_oauth_requests` | `nonce VARCHAR NULL` 컬럼 추가 |
| `authorization_codes` | `nonce VARCHAR NULL` 컬럼 추가 |

---

## 영향 범위

| 파일 | 변경 종류 |
| --- | --- |
| `authorize/dto/authorize-query.dto.ts` | nonce 필드 추가 |
| `authorize/pending-request.store.ts` | 인터페이스 nonce 추가, InMemory store 확인 |
| `database/entities/pending-oauth-request.entity.ts` | nonce 컬럼 추가 |
| `authorize/typeorm-pending-request.store.ts` | nonce save/get |
| `database/entities/authorization-code.entity.ts` | nonce 컬럼 추가 |
| `authorize/authorize.service.ts` | nonce 전달 2곳 |
| `oauth/token/token.service.ts` | TokenResponse + id_token 생성 |
| `oauth/userinfo/userinfo.controller.ts` | email_verified 추가 |
| 마이그레이션 파일 (신규) | pending_oauth_requests, authorization_codes |

---

## 완료 조건

- `scope=openid`로 발급된 `authorization_code` 교환 응답에 `id_token` 포함
- `id_token` JWT에 `sub`, `iss`, `aud`, `exp`, `iat` 포함
- `nonce`를 인가 요청에 전달하면 `id_token.nonce`에 그대로 반영
- `scope=openid email`이면 `id_token`과 `userinfo` 모두에 `email`, `email_verified` 포함
- `refresh_token` grant, `client_credentials` grant에서는 `id_token` 미발급
- 기존 `access_token`, `refresh_token` 발급 동작 회귀 없음
