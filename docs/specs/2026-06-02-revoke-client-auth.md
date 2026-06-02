# Revoke 엔드포인트 클라이언트 인증 설계

**날짜**: 2026-06-02  
**상태**: 승인됨

## 개요

현재 `POST /t/:tenantSlug/oauth/revoke` 엔드포인트는 `client_secret`이 있는 Confidential Client의 요청도 클라이언트 인증 없이 처리한다. RFC 7009 §2.1은 Confidential Client에 대해 토큰 엔드포인트와 동일한 클라이언트 인증을 요구한다.

`Authorization: Basic` 헤더(또는 body의 `client_id`/`client_secret`)를 검증하도록 `RevokeService`를 수정한다. Public Client는 인증 없이 그대로 동작한다.

---

## 동작 설계

| 클라이언트 타입 | client_id 제공 | 동작 |
| --- | --- | --- |
| CONFIDENTIAL | Basic Auth 또는 body | secret 일치 검증. 불일치 시 `401 invalid_client` |
| CONFIDENTIAL | 미제공 | `401 invalid_client` |
| PUBLIC | client_id (body) | secret 없이 통과 |
| PUBLIC | 미제공 | 토큰에서 clientId를 추출해 처리 (기존 동작 유지) |

---

## 변경 범위

### 1. `RevokeController` — Basic Auth 파싱 및 전달

`backend/src/oauth/revoke/revoke.controller.ts`

`revoke()` 핸들러에서 Basic Auth 헤더를 파싱하여 service로 전달한다.

```typescript
@Post('revoke')
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: '토큰 폐기 (RFC 7009)' })
revoke(
  @CurrentTenant() tenant: TenantContext,
  @Body() dto: RevokeRequestDto,
  @Req() req: Request,
) {
  const basicAuth = this.parseBasicAuth(req.headers['authorization']);
  return this.revokeService.revoke(tenant.tenantId, dto, basicAuth, {
    ipAddress: req.ip ?? null,
    userAgent: (req.headers['user-agent'] as string) ?? null,
    requestId: (req.headers['x-request-id'] as string) ?? null,
  });
}

private parseBasicAuth(header?: string): { id?: string; secret?: string } {
  if (!header?.startsWith('Basic ')) return {};
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf-8');
  const [id, ...rest] = decoded.split(':');
  return { id, secret: rest.join(':') };
}
```

---

### 2. `RevokeService` — 클라이언트 인증 로직 추가

`backend/src/oauth/revoke/revoke.service.ts`

**의존성 추가**: `OAuthClient` 리포지토리, `CryptoUtil`

```typescript
constructor(
  @InjectRepository(AccessToken)
  private readonly accessTokenRepo: Repository<AccessToken>,
  @InjectRepository(RefreshToken)
  private readonly refreshTokenRepo: Repository<RefreshToken>,
  @InjectRepository(OAuthClient)          // 추가
  private readonly clientRepo: Repository<OAuthClient>,
  private readonly auditService: AuditService,
) {}
```

**`revoke()` 시그니처 변경**:

```typescript
async revoke(
  tenantId: string,
  dto: RevokeRequestDto,
  basicAuth: { id?: string; secret?: string },  // 추가
  ctx?: AuditContext,
): Promise<void>
```

**클라이언트 인증 로직** (기존 토큰 처리 전에 수행):

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

> `clientId`가 없으면 인증을 건너뛴다. RFC 7009는 client identification이 불가능한 경우 폐기를 그대로 수행하도록 허용한다. 폐기 자체는 토큰 보유자가 자신의 토큰을 폐기하는 정상 행위이므로 clientId 미제공을 차단하지 않는다.

---

### 3. `RevokeModule` — OAuthClient 리포지토리 등록

`backend/src/oauth/revoke/revoke.module.ts`

```typescript
TypeOrmModule.forFeature([AccessToken, RefreshToken, OAuthClient])
```

---

## 영향 범위

| 파일 | 변경 종류 |
| --- | --- |
| `revoke/revoke.controller.ts` | Basic Auth 파싱, service 호출 시그니처 변경 |
| `revoke/revoke.service.ts` | 의존성 추가, 클라이언트 인증 로직 추가 |
| `revoke/revoke.module.ts` | `OAuthClient` 엔티티 등록 |

마이그레이션 없음.

---

## 완료 조건

- Confidential Client가 잘못된 secret으로 revoke 요청 시 `401 invalid_client` 반환
- Confidential Client가 올바른 Basic Auth로 revoke 요청 시 정상 처리
- Public Client는 `client_id`만 body에 담아 revoke 가능 (기존 동작 유지)
- client_id 없이 revoke 요청 시 기존과 동일하게 처리 (RFC 7009 멱등성 유지)
- 기존 revoke 멱등성(토큰 없어도 200 OK) 동작 회귀 없음
