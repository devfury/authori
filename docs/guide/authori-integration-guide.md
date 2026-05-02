# Authori 연동 가이드

이 문서는 **Authori를 OAuth2/OIDC 인증 서버로 사용하는 외부 서비스**를 개발할 때 필요한 연동 정보를 정리한다.

대상 독자: Authori와 별도 서비스를 개발하는 프론트엔드, 백엔드, 플랫폼 개발자.  
아키텍처: Authori(인증 서버) ↔ 외부 서비스(클라이언트 + 리소스 서버).  
마지막 업데이트: 2026-05-02

---

## 목차

1. [연동 모델](#1-연동-모델)
2. [Authori 엔드포인트](#2-authori-엔드포인트)
3. [OAuth 클라이언트 등록](#3-oauth-클라이언트-등록)
4. [Authorization Code + PKCE](#4-authorization-code--pkce)
5. [Authorization Code 서버사이드/BFF](#5-authorization-code-서버사이드bff)
6. [Client Credentials M2M](#6-client-credentials-m2m)
7. [외부 서비스 백엔드 JWT 검증](#7-외부-서비스-백엔드-jwt-검증)
8. [UserInfo 조회와 프로필 셀프 수정](#8-userinfo-조회와-프로필-셀프-수정)
9. [M2M 사용자 역할 부여/제거 API](#9-m2m-사용자-역할-부여제거-api)
10. [M2M 사용자 관리 API](#10-m2m-사용자-관리-api)
11. [Refresh Token 갱신](#11-refresh-token-갱신)
12. [Token Revoke와 로그아웃](#12-token-revoke와-로그아웃)
13. [환경변수 체크리스트](#13-환경변수-체크리스트)
14. [오류 코드](#14-오류-코드)

---

## 1. 연동 모델

Authori는 테넌트별 OAuth2/OIDC 인증 서버다. 모든 테넌트 엔드포인트는 `/t/:tenantSlug` 접두사를 가진다.

```text
사용자 브라우저 ── Authorization Code/PKCE ──▶ Authori
      │                                            │
      │ access_token                               │
      ▼                                            │
외부 서비스 API ◀── JWKS로 JWT 검증 또는 UserInfo 조회 ┘

외부 서비스 백엔드 ── client_credentials ──▶ Authori
      │
      └── M2M access_token으로 Authori M2M API 호출
```

주요 원칙:

- SPA는 `PUBLIC` 클라이언트로 등록하고 client secret을 사용하지 않는다.
- 서버사이드 앱과 M2M 연동은 `CONFIDENTIAL` 클라이언트로 등록하고 client secret을 안전한 서버 환경변수에 저장한다.
- 외부 서비스의 보호 API는 Authori access token을 `Authorization: Bearer <token>`으로 받아 RS256 JWT 서명을 검증한다.
- 사용자 프로필 셀프 수정은 `profile:write` scope가 있는 사용자 access token만 허용한다.
- 사용자 역할 부여/제거 같은 운영성 API는 `client_credentials` 토큰과 `rbac:*` scope가 있는 M2M 클라이언트만 호출한다.

---

## 2. Authori 엔드포인트

예시:

```text
AUTHORI_BASE_URL=https://auth.example.com
AUTHORI_TENANT_SLUG=acme
```

| 용도 | 메서드 | 경로 |
|---|---:|---|
| Authorization 시작 | `GET` | `/t/:tenantSlug/oauth/authorize` |
| 로그인 제출 + code 발급 | `POST` | `/t/:tenantSlug/oauth/authorize` |
| Token 발급/갱신 | `POST` | `/t/:tenantSlug/oauth/token` |
| Token 폐기 | `POST` | `/t/:tenantSlug/oauth/revoke` |
| UserInfo 조회 | `GET` | `/t/:tenantSlug/oauth/userinfo` |
| UserInfo/프로필 수정 | `PATCH` | `/t/:tenantSlug/oauth/userinfo` |
| 회원가입 | `POST` | `/t/:tenantSlug/oauth/register` |
| 로그인 브랜딩 | `GET` | `/t/:tenantSlug/oauth/login-config` |
| Discovery | `GET` | `/t/:tenantSlug/.well-known/openid-configuration` |
| JWKS | `GET` | `/t/:tenantSlug/.well-known/jwks.json` |
| M2M 역할 목록 | `GET` | `/t/:tenantSlug/api/roles` |
| M2M 사용자 역할 조회 | `GET` | `/t/:tenantSlug/api/users/:userId/roles` |
| M2M 사용자 역할 추가 | `POST` | `/t/:tenantSlug/api/users/:userId/roles/:roleId` |
| M2M 사용자 역할 제거 | `DELETE` | `/t/:tenantSlug/api/users/:userId/roles/:roleId` |
| M2M 사용자 역할 전체 교체 | `PUT` | `/t/:tenantSlug/api/users/:userId/roles` |
| M2M 사용자 목록 조회 | `GET` | `/t/:tenantSlug/api/users` |
| M2M 사용자 활성화 | `POST` | `/t/:tenantSlug/api/users/:userId/activate` |
| M2M 사용자 비활성화 | `POST` | `/t/:tenantSlug/api/users/:userId/deactivate` |
| M2M 계정 잠금 | `POST` | `/t/:tenantSlug/api/users/:userId/lock` |
| M2M 계정 잠금 해제 | `POST` | `/t/:tenantSlug/api/users/:userId/unlock` |

Discovery 응답에는 issuer, token endpoint, revocation endpoint, userinfo endpoint, JWKS URI, 지원 grant와 scope가 포함된다.

```json
{
  "issuer": "https://auth.example.com/t/acme",
  "authorization_endpoint": "https://auth.example.com/t/acme/oauth/authorize",
  "token_endpoint": "https://auth.example.com/t/acme/oauth/token",
  "revocation_endpoint": "https://auth.example.com/t/acme/oauth/revoke",
  "userinfo_endpoint": "https://auth.example.com/t/acme/oauth/userinfo",
  "jwks_uri": "https://auth.example.com/t/acme/.well-known/jwks.json",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token", "client_credentials"],
  "id_token_signing_alg_values_supported": ["RS256"],
  "code_challenge_methods_supported": ["S256", "plain"]
}
```

---

## 3. OAuth 클라이언트 등록

Authori 관리자 화면에서 테넌트별 OAuth 클라이언트를 생성한다.

| 외부 서비스 유형 | Client Type | Grant | Secret |
|---|---|---|---|
| Vue/React SPA | `PUBLIC` | `authorization_code`, `refresh_token` | 없음 |
| 서버사이드/BFF | `CONFIDENTIAL` | `authorization_code`, `refresh_token` | 필요 |
| 서버 간 M2M | `CONFIDENTIAL` | `client_credentials` | 필요 |

등록 항목:

- 이름: 운영자가 식별할 표시 이름
- Redirect URIs: callback URI. 완전 일치해야 한다.
- Allowed Scopes: 사용할 scope만 허용한다.
- Allowed Grants: 사용할 grant만 허용한다.

주요 scope:

| Scope | 용도 |
|---|---|
| `openid` | 사용자 식별자 `sub` |
| `profile` | 사용자 profile JSON 조회 |
| `email` | email claim 조회 |
| `profile:write` | 로그인 사용자의 본인 프로필 수정 |
| `rbac:read` | M2M 역할 목록/사용자 역할 조회 |
| `rbac:write` | M2M 사용자 역할 추가/제거/교체 |
| `users:read` | M2M 사용자 목록 조회 |
| `users:write` | M2M 사용자 활성화/비활성화/잠금/해제 |

`clientSecret`은 최초 생성 시 한 번만 평문으로 노출된다. 분실하면 rotate해야 한다. SPA 번들, 모바일 앱, 브라우저 저장소에는 client secret을 넣지 않는다.

---

## 4. Authorization Code + PKCE

SPA는 `PUBLIC` 클라이언트로 Authorization Code + PKCE를 사용한다.

전체 흐름:

```text
1. SPA가 code_verifier, code_challenge(S256), state 생성
2. state와 code_verifier를 sessionStorage에 저장
3. 브라우저를 /oauth/authorize로 리다이렉트
4. 사용자가 Authori에서 로그인
5. Authori가 redirect_uri?code=...&state=...로 리다이렉트
6. SPA가 state 검증
7. SPA가 code + code_verifier를 /oauth/token으로 교환
8. access_token, refresh_token 저장
9. 외부 서비스 API 호출 시 Authorization 헤더에 access_token 첨부
```

인가 URL:

```text
GET https://auth.example.com/t/acme/oauth/authorize
  ?response_type=code
  &client_id=<PUBLIC_CLIENT_ID>
  &redirect_uri=https://myapp.example.com/auth/callback
  &scope=openid%20profile%20email
  &state=<random>
  &code_challenge=<S256_CODE_CHALLENGE>
  &code_challenge_method=S256
```

Token 교환:

```http
POST /t/acme/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&client_id=<PUBLIC_CLIENT_ID>
&code=<received_code>
&redirect_uri=https://myapp.example.com/auth/callback
&code_verifier=<PKCE_CODE_VERIFIER>
```

응답:

```json
{
  "access_token": "<jwt>",
  "refresh_token": "<refresh_token>",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "openid profile email"
}
```

프로필 셀프 수정을 제공하려면 authorize 요청 scope에 `profile:write`를 포함하고, OAuth 클라이언트 allowed scopes에도 `profile:write`를 허용해야 한다.

---

## 5. Authorization Code 서버사이드/BFF

서버사이드 앱 또는 BFF는 `CONFIDENTIAL` 클라이언트로 code를 서버에서 교환한다. client secret은 서버에만 둔다.

Token 교환은 Basic Auth를 권장한다.

```ts
const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

const res = await fetch(`${authoriBaseUrl}/t/${tenantSlug}/oauth/token`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    Authorization: `Basic ${credentials}`,
  },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  }),
})
```

Body에 `client_id`, `client_secret`을 넣는 방식도 지원하지만, 로그와 APM에 노출되지 않도록 Basic Auth를 우선 사용한다.

---

## 6. Client Credentials M2M

사용자 없이 서비스가 Authori 또는 다른 리소스 서버를 호출할 때 `client_credentials` grant를 사용한다.

전제:

- OAuth 클라이언트 타입: `CONFIDENTIAL`
- Allowed Grants: `client_credentials`
- 필요한 Allowed Scopes: 호출 대상 API에 맞게 설정

토큰 발급:

```ts
export async function fetchM2MToken(config: {
  authoriBaseUrl: string
  tenantSlug: string
  clientId: string
  clientSecret: string
  scope?: string
}) {
  const credentials = Buffer.from(
    `${config.clientId}:${config.clientSecret}`,
  ).toString('base64')

  const res = await fetch(
    `${config.authoriBaseUrl}/t/${config.tenantSlug}/oauth/token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        ...(config.scope ? { scope: config.scope } : {}),
      }),
    },
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error_description ?? err.error ?? `token_failed:${res.status}`)
  }

  return res.json() as Promise<{
    access_token: string
    token_type: 'Bearer'
    expires_in: number
    scope: string
  }>
}
```

토큰은 매 요청마다 새로 발급하지 말고, `expires_in` 기준으로 만료 30~60초 전까지 메모리에 캐싱한다.

---

## 7. 외부 서비스 백엔드 JWT 검증

외부 서비스의 보호 API는 Authori access token을 검증해야 한다. 기본 방식은 JWKS에서 공개키를 가져와 RS256 JWT 서명을 검증하는 것이다.

설치 예시:

```bash
bun add passport passport-jwt jwks-rsa @nestjs/passport
bun add -d @types/passport-jwt
```

JWT payload 타입:

```ts
export interface AuthoriJwtPayload {
  sub: string
  tenant_id: string
  client_id?: string
  scope?: string
  jti?: string
  iss: string
  aud: string | string[]
  iat: number
  exp: number
  email?: string
  name?: string
  roles?: string[]
  permissions?: string[]
}
```

NestJS `JwtStrategy` 예시:

```ts
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { passportJwtSecret } from 'jwks-rsa'
import { ExtractJwt, Strategy } from 'passport-jwt'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    const baseUrl = config.getOrThrow<string>('AUTHORI_BASE_URL').replace(/\/$/, '')
    const tenantSlug = config.getOrThrow<string>('AUTHORI_TENANT_SLUG')

    super({
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri: `${baseUrl}/t/${tenantSlug}/.well-known/jwks.json`,
      }),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      issuer: [`${baseUrl}/t/${tenantSlug}`, baseUrl],
      audience: config.get<string>('OAUTH_CLIENT_ID'),
      algorithms: ['RS256'],
    })
  }

  validate(payload: AuthoriJwtPayload) {
    return payload
  }
}
```

스코프 검사 예시:

```ts
const scopes = new Set((req.user.scope ?? '').split(' ').filter(Boolean))
if (!scopes.has('profile')) {
  throw new ForbiddenException('insufficient_scope')
}
```

권장 사항:

- `iss`, `aud`, `alg`를 검증한다.
- `tenant_id`가 기대한 테넌트인지 확인한다.
- `scope`는 공백 구분 문자열이다.
- JWT 검증 실패 시 무조건 권한을 허용하지 않는다. 필요하면 Authori `/oauth/userinfo`로 opaque token fallback을 별도 구현한다.

---

## 8. UserInfo 조회와 프로필 셀프 수정

### 8.1 UserInfo 조회

```http
GET /t/:tenantSlug/oauth/userinfo
Authorization: Bearer <access_token>
```

예시 응답:

```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "profile": {
    "nickname": "홍길동",
    "department": "Engineering"
  }
}
```

반환 claim은 token scope에 따라 달라진다.

| Claim | 필요 scope |
|---|---|
| `sub` | 항상 포함 |
| `email` | `email` |
| `profile` | `profile` |

### 8.2 프로필 셀프 수정

로그인한 사용자가 본인 프로필을 직접 수정하려면 같은 UserInfo URL에 `PATCH`를 보낸다.

핵심 조건:

| 항목 | 값 |
|---|---|
| 엔드포인트 | `PATCH /t/:tenantSlug/oauth/userinfo` |
| 필수 scope | `profile:write` |
| 인증 | 사용자 access token |
| 수정 대상 | token의 `sub`에 해당하는 본인 계정 |
| 병합 방식 | `profile` JSON shallow merge |
| 검증 | 테넌트의 활성 Profile Schema로 검증 |

사전 준비:

1. 테넌트 scope 카탈로그에 `profile:write`가 있는지 확인한다.
2. OAuth 클라이언트 allowed scopes에 `profile:write`를 허용한다.
3. authorize 요청 scope에 `profile:write`를 포함한다.
4. 프로필 스키마 검증이 필요하면 관리자 화면에서 활성 스키마를 published 상태로 둔다.

요청:

```http
PATCH /t/acme/oauth/userinfo
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "profile": {
    "nickname": "Johnny",
    "city": "Seoul"
  },
  "loginId": "johnny"
}
```

응답:

```json
{
  "sub": "user-uuid",
  "loginId": "johnny",
  "profile": {
    "nickname": "Johnny",
    "city": "Seoul",
    "department": "Engineering"
  }
}
```

주의사항:

- `status`, `email`, `password` 같은 관리자 전용 필드는 DTO whitelist에서 제외되어 무시된다.
- `profile`은 shallow merge다. 중첩 객체 일부만 바꾸려면 먼저 조회 후 클라이언트에서 병합해 보낸다.
- scope가 없으면 403 `insufficient_scope`가 반환된다.
- 활성 Profile Schema 검증 실패는 400으로 반환된다.
- 모든 셀프 수정은 감사 로그에 `USER.UPDATED`, `actorType='user'`, `metadata.source='self_service'`로 기록된다.

Node.js 예시:

```ts
async function updateMyProfile(
  baseUrl: string,
  tenantSlug: string,
  accessToken: string,
  patch: { profile?: Record<string, unknown>; loginId?: string },
) {
  const res = await fetch(`${baseUrl}/t/${tenantSlug}/oauth/userinfo`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(patch),
  })

  if (!res.ok) {
    throw new Error(`profile_update_failed:${res.status}:${await res.text()}`)
  }

  return res.json()
}
```

---

## 9. M2M 사용자 역할 부여/제거 API

외부 서비스가 자체 비즈니스 이벤트에 따라 Authori 사용자 역할을 동적으로 부여하거나 제거해야 할 때 사용한다.

전제:

- OAuth 클라이언트 타입: `CONFIDENTIAL`
- Allowed Grants: `client_credentials`
- 읽기 scope: `rbac:read`
- 쓰기 scope: `rbac:write`
- 요청 토큰의 `tenant_id`와 URL의 `:tenantSlug`가 가리키는 테넌트가 일치해야 한다.

토큰 발급:

```http
POST /t/acme/oauth/token
Authorization: Basic <base64(clientId:clientSecret)>
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&scope=rbac:read%20rbac:write
```

역할 목록 조회:

```http
GET /t/acme/api/roles
Authorization: Bearer <m2m_access_token>
```

사용자 역할 조회:

```http
GET /t/acme/api/users/:userId/roles
Authorization: Bearer <m2m_access_token>
```

사용자 역할 추가:

```http
POST /t/acme/api/users/:userId/roles/:roleId
Authorization: Bearer <m2m_access_token>
```

이미 부여된 역할이면 200을 반환한다.

사용자 역할 제거:

```http
DELETE /t/acme/api/users/:userId/roles/:roleId
Authorization: Bearer <m2m_access_token>
```

부여되지 않은 역할이면 200을 반환한다.

사용자 역할 전체 교체:

```http
PUT /t/acme/api/users/:userId/roles
Authorization: Bearer <m2m_access_token>
Content-Type: application/json

{
  "roleIds": ["role-uuid-1", "role-uuid-2"]
}
```

보안 동작:

- `rbac:read` 없이 조회하면 403.
- `rbac:write` 없이 쓰기 요청을 보내면 403.
- 다른 테넌트 토큰이면 401.
- 폐기 또는 만료된 access token이면 401.
- 다른 테넌트의 `roleId`를 주입하면 400.
- 존재하지 않거나 다른 테넌트의 `userId`면 404.
- 역할 부여/제거/교체는 감사 로그에 `actorType='oauth_client'`, `targetType='user_role'`로 기록된다.

---

## 10. M2M 사용자 관리 API

외부 서비스가 사용자 계정 상태를 직접 제어해야 할 때 사용한다. 예: 비즈니스 이벤트에 따른 계정 비활성화, 관리자 시스템에서의 계정 잠금/해제.

전제:

- OAuth 클라이언트 타입: `CONFIDENTIAL`
- Allowed Grants: `client_credentials`
- 읽기 scope: `users:read`
- 쓰기 scope: `users:write`

토큰 발급:

```http
POST /t/acme/oauth/token
Authorization: Basic <base64(clientId:clientSecret)>
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&scope=users:read%20users:write
```

### 사용자 목록 조회

역할, 활성 상태, 잠금 상태가 포함된 페이지 단위 목록을 반환한다.

```http
GET /t/acme/api/users?page=1&limit=20&search=alice&status=ACTIVE
Authorization: Bearer <m2m_access_token>
```

쿼리 파라미터:

| 파라미터 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `page` | number | 1 | 페이지 번호 (1-based) |
| `limit` | number | 20 | 페이지당 건수 (최대 100) |
| `search` | string | - | 이메일 부분 검색 |
| `status` | `ACTIVE` \| `INACTIVE` \| `LOCKED` | - | 상태 필터 |

응답:

```json
{
  "items": [
    {
      "id": "user-uuid",
      "email": "alice@example.com",
      "status": "ACTIVE",
      "userRoles": [
        { "role": { "id": "role-uuid", "name": "member" } }
      ],
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

`status` 값: `ACTIVE`(정상), `INACTIVE`(비활성), `LOCKED`(잠금)

### 사용자 활성화

```http
POST /t/acme/api/users/:userId/activate
Authorization: Bearer <m2m_access_token>
```

성공 시 204 No Content.

### 사용자 비활성화

```http
POST /t/acme/api/users/:userId/deactivate
Authorization: Bearer <m2m_access_token>
```

성공 시 204 No Content. 비활성화된 사용자는 로그인 불가.

### 계정 잠금

```http
POST /t/acme/api/users/:userId/lock
Authorization: Bearer <m2m_access_token>
```

성공 시 204 No Content. 잠금된 사용자는 로그인 시 `account_locked` 오류를 받는다.

### 계정 잠금 해제

```http
POST /t/acme/api/users/:userId/unlock
Authorization: Bearer <m2m_access_token>
```

성공 시 204 No Content. 잠금 해제 시 `failedLoginAttempts`도 함께 초기화된다.

보안 동작:

- `users:read` 없이 목록 조회하면 403.
- `users:write` 없이 상태 변경하면 403.
- 다른 테넌트 토큰이면 401.
- 존재하지 않거나 다른 테넌트의 `userId`면 404.
- 모든 상태 변경은 감사 로그에 `actorType='oauth_client'`로 기록된다.

---

## 11. Refresh Token 갱신

access token 만료 시 refresh token으로 새 토큰을 발급받는다.

```http
POST /t/acme/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&client_id=<clientId>
&refresh_token=<refresh_token>
&scope=openid%20profile
```

CONFIDENTIAL 클라이언트는 Basic Auth 또는 body의 `client_secret`으로 인증한다.

Authori는 Refresh Token Rotation을 사용한다.

- 갱신 성공 시 새 refresh token이 발급되고 기존 refresh token은 폐기된다.
- 폐기된 refresh token 재사용이 감지되면 같은 family 전체가 폐기된다.
- 클라이언트는 새 refresh token을 즉시 저장해야 한다.

---

## 12. Token Revoke와 로그아웃

```http
POST /t/acme/oauth/revoke
Content-Type: application/x-www-form-urlencoded

token=<refresh_token_or_access_token>
&token_type_hint=refresh_token
&client_id=<clientId>
```

동작:

- refresh token 폐기: 해당 family 전체 폐기
- access token 폐기: JWT `jti` 기준으로 해당 access token 폐기
- 토큰이 이미 없거나 폐기되어도 200 OK를 반환한다.

로그아웃 시에는 가능하면 refresh token을 먼저 revoke하고, 로컬 access/refresh token을 모두 삭제한다.

---

## 13. 환경변수 체크리스트

SPA:

```env
VITE_AUTHORI_BASE_URL=https://auth.example.com
VITE_AUTHORI_TENANT_SLUG=acme
VITE_OAUTH_CLIENT_ID=<PUBLIC_CLIENT_ID>
```

리소스 서버:

```env
AUTHORI_BASE_URL=https://auth.example.com
AUTHORI_TENANT_SLUG=acme
OAUTH_CLIENT_ID=<CLIENT_ID_FOR_AUDIENCE>
```

서버사이드/BFF 또는 M2M:

```env
AUTHORI_BASE_URL=https://auth.example.com
AUTHORI_TENANT_SLUG=acme
OAUTH_CLIENT_ID=<CONFIDENTIAL_CLIENT_ID>
OAUTH_CLIENT_SECRET=<CONFIDENTIAL_CLIENT_SECRET>
```

연동 전 확인:

- [ ] OAuth 클라이언트 타입이 서비스 구조와 맞는가?
- [ ] Redirect URI가 개발/운영 각각 정확히 등록되었는가?
- [ ] 필요한 scope가 tenant scope와 client allowed scopes에 모두 있는가?
- [ ] SPA가 client secret을 사용하지 않는가?
- [ ] 백엔드 JWKS URI, issuer, audience 값이 실제 토큰과 일치하는가?
- [ ] `profile:write`, `rbac:read`, `rbac:write`처럼 기본이 아닌 scope는 명시적으로 요청하는가?

---

## 14. 오류 코드

Authorization:

| HTTP | error/message | 원인 |
|---|---|---|
| 400 | `invalid_client` | clientId 없음 또는 비활성 |
| 400 | `redirect_uri_mismatch` | 등록되지 않은 redirect URI |
| 400 | `code_challenge_required` | PKCE 필수 테넌트에서 code challenge 누락 |
| 400 | `invalid_scope: <scope>` | 허용되지 않은 scope |
| 401 | `invalid_credentials` | 로그인 자격증명 불일치 |
| 401 | `account_locked` | 로그인 실패 누적으로 계정 잠금 |

Token:

| HTTP | error/message | 원인 |
|---|---|---|
| 400 | `invalid_grant` | code 없음, 재사용, 만료 |
| 400 | `invalid_grant: redirect_uri mismatch` | token 교환 redirect URI 불일치 |
| 400 | `invalid_grant: code_verifier mismatch` | PKCE 검증 실패 |
| 400 | `invalid_grant: token reuse detected` | refresh token 재사용 감지 |
| 400 | `unsupported_grant_type` | 클라이언트에 허용되지 않은 grant |
| 401 | `invalid_client` | client secret 불일치 또는 client 없음 |

UserInfo/Profile:

| HTTP | message | 원인 |
|---|---|---|
| 400 | schema validation errors | Profile Schema 검증 실패 |
| 401 | `Bearer token required` | Authorization 헤더 누락 |
| 401 | `invalid_token` | JWT 서명 검증 실패 또는 만료 |
| 401 | `token_revoked` | 폐기된 access token |
| 403 | `insufficient_scope` | `profile:write` 등 필요한 scope 누락 |
| 404 | `user_not_found` | token의 `sub`에 해당하는 사용자가 없음 |

M2M RBAC:

| HTTP | message | 원인 |
|---|---|---|
| 400 | `invalid_role_ids` | 다른 테넌트 역할 또는 존재하지 않는 역할 |
| 401 | `tenant_mismatch` | token tenant와 URL tenant 불일치 |
| 401 | `token_revoked` | DB에서 폐기 또는 만료된 access token |
| 403 | `insufficient_scope` | `rbac:read` 또는 `rbac:write` 누락 |
| 404 | `user_not_found` | 다른 테넌트 사용자 또는 존재하지 않는 사용자 |

M2M 사용자 관리:

| HTTP | message | 원인 |
|---|---|---|
| 401 | `tenant_mismatch` | token tenant와 URL tenant 불일치 |
| 401 | `token_revoked` | 폐기 또는 만료된 access token |
| 403 | `insufficient_scope` | `users:read` 또는 `users:write` 누락 |
| 404 | `user_not_found` | 존재하지 않거나 다른 테넌트의 사용자 |

일반 오류 응답 형식:

```json
{
  "statusCode": 403,
  "message": "insufficient_scope",
  "error": "Forbidden"
}
```

---

## 관련 문서

- [02-auth-authori-oauth.md](./02-auth-authori-oauth.md) — Best Practice 서비스의 현재 Authori 연동 구현 메모
- `example/vite-testapp/` — Vue SPA OAuth 플로우 예제
- `example/nest-testapp/` — NestJS JWT 검증과 M2M 토큰 발급 예제
