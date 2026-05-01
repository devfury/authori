# M2M 역할 부여/제거 API 구현 계획

## 배경 및 목표

외부 솔루션이 authori의 인증/인가를 사용할 때, 자신의 비즈니스 로직에 따라 사용자 역할을 동적으로 부여하거나 제거해야 하는 경우가 있다. 현재 역할 관리 API는 관리자 JWT 전용이므로, 외부 솔루션이 직접 호출할 수 없다.

**목표**: CONFIDENTIAL OAuth 클라이언트가 `client_credentials` grant로 M2M 액세스 토큰을 발급받아, 사용자 역할 부여/제거 API를 호출할 수 있도록 한다.

---

## 설계 원칙

- **기존 관리자 API 불변**: 기존 `/admin/tenants/:tenantId/` RBAC 엔드포인트는 건드리지 않는다.
- **최소 권한**: M2M 클라이언트는 사용자 역할 부여/제거만 가능. 역할/권한 정의(생성·수정·삭제)는 관리자 전용으로 유지.
- **테넌트 격리**: 토큰의 `tenant_id` 클레임과 URL의 `:tenantSlug`가 일치하는 경우에만 허용.
- **스코프 기반 접근 제어**: `rbac:read`, `rbac:write` 스코프로 읽기/쓰기 권한을 분리.

---

## 스코프 정의

| 스코프 | 허용 작업 |
|---|---|
| `rbac:read` | 사용자 역할 목록 조회, 테넌트 역할 목록 조회 |
| `rbac:write` | 사용자 역할 추가, 제거, 전체 교체 |

OAuthClient의 `allowedGrants`에 `client_credentials`가 포함된 CONFIDENTIAL 클라이언트에만 위 스코프를 부여할 수 있다.

---

## API 엔드포인트

기본 경로: `/t/:tenantSlug/api`  
인증: `Authorization: Bearer <M2M access token>`  
인증 방식: OAuth Bearer 토큰 (RS256 JWT) + 스코프 검사

### 사용자 역할 조회

```
GET /t/:tenantSlug/api/users/:userId/roles
```

- 필요 스코프: `rbac:read`
- 응답: 사용자에게 부여된 역할 목록

### 사용자 역할 추가 (단건)

```
POST /t/:tenantSlug/api/users/:userId/roles/:roleId
```

- 필요 스코프: `rbac:write`
- 이미 부여된 역할이면 멱등하게 200 반환

### 사용자 역할 제거 (단건)

```
DELETE /t/:tenantSlug/api/users/:userId/roles/:roleId
```

- 필요 스코프: `rbac:write`
- 부여되지 않은 역할이면 멱등하게 200 반환

### 사용자 역할 전체 교체

```
PUT /t/:tenantSlug/api/users/:userId/roles
Body: { "roleIds": ["uuid1", "uuid2"] }
```

- 필요 스코프: `rbac:write`
- 기존 역할을 모두 제거하고 새 역할로 교체

### 테넌트 역할 목록 조회

```
GET /t/:tenantSlug/api/roles
```

- 필요 스코프: `rbac:read`
- 부여 가능한 역할 목록 반환 (외부 솔루션이 roleId를 알기 위해 필요)

---

## 구현 단계

### 1단계: OAuthAccessTokenGuard 생성

**파일**: `backend/src/common/guards/oauth-access-token.guard.ts`

역할:
1. `Authorization: Bearer <token>` 헤더 추출
2. `SigningKeyService`로 공개키를 가져와 RS256 서명 검증
3. `jti` 클레임으로 DB `access_tokens` 테이블에서 revocation 여부 확인
4. 토큰의 `tenant_id`와 `req.tenantId`(TenantMiddleware 주입값) 일치 여부 확인
5. `req.accessToken`에 페이로드 주입

### 2단계: ScopeGuard 완성

**파일**: `backend/src/common/guards/scope.guard.ts` (기존 파일 수정)

현재 `req.accessToken`이 없어서 동작하지 않음. `OAuthAccessTokenGuard` 실행 후 `req.accessToken.scope`를 읽도록 수정.

**파일**: `backend/src/common/decorators/require-scopes.decorator.ts` (신규)

```typescript
export const RequireScopes = (...scopes: string[]) =>
  SetMetadata('scopes', scopes);
```

### 3단계: M2M RBAC 컨트롤러 생성

**파일**: `backend/src/rbac/m2m-rbac.controller.ts`

- 경로: `/t/:tenantSlug/api`
- 가드: `OAuthAccessTokenGuard` + `ScopeGuard`
- `RbacService` 기존 메서드 재사용
  - `findUserRoles(tenantId, userId)`
  - `setUserRoles(tenantId, userId, roleIds)`
  - `findRoles(tenantId)` (역할 목록)
- 단건 추가/제거를 위한 `addUserRole`, `removeUserRole` 메서드를 `RbacService`에 추가

### 4단계: RbacService 메서드 추가

**파일**: `backend/src/rbac/rbac.service.ts`

추가할 메서드:
- `addUserRole(tenantId, userId, roleId)`: UserRole 단건 insert (중복 무시)
- `removeUserRole(tenantId, userId, roleId)`: UserRole 단건 delete (없으면 무시)

### 5단계: RbacModule 업데이트

`M2mRbacController`를 `RbacModule`에 등록. `OAuthAccessTokenGuard`가 의존하는 `SigningKeyService`, `AccessToken` 리포지토리를 module imports에 추가.

---

## 토큰 발급 흐름 (외부 솔루션 관점)

```
1. 관리자가 authori admin UI에서
   - CONFIDENTIAL 클라이언트 생성
   - allowedGrants에 client_credentials 추가
   - allowedScopes에 rbac:read, rbac:write 추가

2. 외부 솔루션이 토큰 발급
   POST /t/:tenantSlug/oauth/token
   Authorization: Basic base64(clientId:clientSecret)
   Body: grant_type=client_credentials&scope=rbac:read rbac:write

3. 발급된 access token으로 M2M API 호출
   POST /t/:tenantSlug/api/users/:userId/roles/:roleId
   Authorization: Bearer <access_token>
```

---

## 보안 고려사항

- **토큰 revocation 체크 필수**: DB의 `access_tokens` 테이블에서 `revokedAt` 확인. 서명만 검증하고 revocation을 건너뛰면 폐기된 토큰으로 역할을 조작할 수 있음.
- **테넌트 격리**: 토큰의 `tenant_id`와 URL 경로의 테넌트가 반드시 일치해야 함. 다른 테넌트 사용자의 역할을 수정하는 것을 방지.
- **roleId 테넌트 소속 확인**: `addUserRole`, `removeUserRole` 시 roleId가 해당 테넌트 소속인지 확인 (타 테넌트의 roleId 주입 방지).
- **userId 테넌트 소속 확인**: userId가 해당 테넌트 소속 사용자인지 확인.
- **감사 로그**: 역할 부여/제거 시 `AuditService.record()`로 기록. `actorId`는 `accessToken.sub`(clientId), `actorType`은 `'oauth_client'`.

---

## 완료 기준

- [ ] `OAuthAccessTokenGuard` 구현 및 단위 테스트
- [ ] `ScopeGuard` + `@RequireScopes()` 동작 확인
- [ ] M2M RBAC 엔드포인트 5개 동작 확인
- [ ] `rbac:read` 스코프 없이 조회 시 403 반환
- [ ] `rbac:write` 스코프 없이 쓰기 시 403 반환
- [ ] 다른 테넌트 토큰으로 호출 시 401 반환
- [ ] 폐기된 토큰으로 호출 시 401 반환
- [ ] 감사 로그 기록 확인
- [ ] Swagger 문서화
