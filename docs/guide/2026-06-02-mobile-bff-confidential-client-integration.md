# 모바일 앱 백엔드 서비스의 Authori Confidential Client 연동 가이드

> 이 가이드는 모바일 앱의 백엔드 서비스(BFF)가 Authori를 **Confidential Client**로 연동할 때 필요한 사항을 설명합니다.

---

## 연동 방식 개요

**Confidential Client BFF(Backend For Frontend) 패턴**에서 모바일 앱은 백엔드 서비스하고만 통신하며, Authori와의 OAuth2 플로우는 **백엔드 서비스가 서버-투-서버로 처리**합니다.

```text
모바일 앱 (네이티브 UI)         백엔드 서비스 (BFF)             Authori
        |                              |                          |
        |-- (1) 로그인 요청 ----------> |                          |
        |   (email + password)         |                          |
        |                              |-- (2) GET /authorize --> |
        |                              |   Accept: application/json
        |                              |<-- { requestId } --------|
        |                              |                          |
        |                              |-- (3) POST /authorize -> |
        |                              |   { requestId, email, password }
        |                              |<-- { url: "...?code&state" }
        |                              |                          |
        |                              |   [url에서 code 추출]     |
        |                              |                          |
        |                              |-- (4) POST /token -----> |
        |                              |   (Basic Auth, code, verifier)
        |                              |<-- { access_token, refresh_token }
        |                              |                          |
        |                              |-- (5) GET /userinfo ---> |
        |                              |<-- { sub, email, ... } --|
        |                              |                          |
        |<-- (6) 서비스 세션 토큰 ------- |                          |
```

**핵심 특징**:

- 모바일 앱은 Authori에 직접 연결하지 않습니다.
- 사용자 자격증명(email, password)은 백엔드 서비스를 경유해 Authori로 전달됩니다.
- `client_secret`은 백엔드 서비스만 보관합니다. 앱에 노출되지 않습니다.
- `redirect_uri`는 Authori 클라이언트 설정에 등록되어 유효성 검증에만 사용됩니다. 실제 브라우저 리다이렉트는 발생하지 않습니다.

---

## 클라이언트 등록 요건

Authori 관리자 콘솔에서 클라이언트를 등록할 때 아래 조건을 설정합니다.

| 항목 | 값 | 설명 |
| ------ | ---- | ------ |
| Client 유형 | `CONFIDENTIAL` | 서버가 secret 보관 |
| 인증 방식 | `client_secret_basic` | HTTP Basic 헤더로 token 엔드포인트 인증 |
| `redirect_uri` | 서비스 커스텀 스킴 또는 서버 콜백 URL | 유효성 검증용으로만 사용 |
| 허용 grant type | `authorization_code`, `refresh_token` | |
| PKCE | `S256` | 지원 |
| 허용 scope | `openid`, `email`, `profile` 등 | 9절 참조 |

---

## 단계별 상세 가이드

### 단계 (1): 모바일 앱 → 백엔드 서비스

모바일 앱은 네이티브 로그인 화면에서 사용자 자격증명을 수집하여 백엔드 서비스에 전달합니다. 이 API는 서비스 팀이 자체 설계합니다.

```http
POST https://{your-backend}/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "user_password"
}
```

### 단계 (2): 백엔드 서비스 → Authori 인가 요청

백엔드 서비스가 Authori에 인가 요청을 보냅니다. `Accept: application/json` 헤더를 사용하면 HTML 리다이렉트 대신 JSON 응답을 받습니다.

```http
GET {authorization_endpoint}
  ?response_type=code
  &client_id={client_id}
  &redirect_uri={registered_redirect_uri}
  &scope=openid%20email%20profile
  &state={server_generated_random_base64url}
  &nonce={server_generated_random_base64url}
  &code_challenge={BASE64URL(SHA256(verifier))}
  &code_challenge_method=S256
Accept: application/json
```

> `Accept: application/json` 헤더 필수. 이 헤더가 없으면 Authori는 로그인 웹 페이지로 리다이렉트하는 브라우저 모드로 동작합니다.

`authorization_endpoint`는 OIDC 디스커버리 문서(`{issuer}/.well-known/openid-configuration`)에서 가져옵니다. 7절 참조.

**성공 응답**:

```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "client": { "name": "서비스명", "clientId": "{client_id}" },
  "requestedScopes": ["openid", "email", "profile"],
  "scopes": [
    { "name": "openid",  "displayName": "기본 인증", "description": "..." },
    { "name": "email",   "displayName": "이메일",   "description": "..." },
    { "name": "profile", "displayName": "프로필",   "description": "..." }
  ],
  "tenantSlug": "{tenant-slug}"
}
```

> `state`, `code_verifier`는 백엔드 서비스가 세션(Redis 등)에 저장하고 이후 단계에서 CSRF 검증 및 PKCE 검증에 사용합니다.

### 단계 (3): 백엔드 서비스 → Authori 로그인 + 인가 코드 발급

```http
POST {authorization_endpoint_base}/oauth/authorize
Content-Type: application/json

{
  "requestId": "550e8400-...",
  "email": "user@example.com",
  "password": "user_password",
  "grantedScopes": ["openid", "email", "profile"]
}
```

> `grantedScopes` 생략 시 요청된 전체 스코프에 동의한 것으로 처리됩니다.

**성공 응답**:

```json
{
  "url": "{redirect_uri}?code={authorization_code}&state={state_echo}"
}
```

백엔드 서비스는 이 URL 문자열을 파싱하여 `code`와 `state`를 추출합니다. `state`가 단계 (2)에서 생성한 값과 일치하는지 검증하세요.

**오류 응답**:

| 상황 | HTTP | message | 처리 방안 |
| ------ | ------ | --------- | --------- |
| 잘못된 이메일/비밀번호 | `401` | `invalid_credentials` | 로그인 실패 반환 |
| 계정 잠금 (5회 실패) | `401` | `account_locked` | 잠금 안내 반환 |
| 비활성 계정 | `403` | `user_inactive` | 계정 비활성 안내 반환 |
| requestId 만료 | `400` | `invalid_request: expired or not found` | 인가 요청부터 재시도 |

인가 코드 유효 시간: **10분** (일회용, 재사용 불가).

### 단계 (4): 백엔드 서비스 → Authori 토큰 교환

```http
POST {token_endpoint}
Authorization: Basic Base64({client_id}:{client_secret})
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code={authorization_code}
&redirect_uri={registered_redirect_uri}
&code_verifier={pkce_verifier}
```

**성공 응답** (`scope=openid email profile`인 경우):

```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "...",
  "scope": "openid email profile",
  "id_token": "eyJ..."
}
```

> `scope`에 `openid`가 포함된 경우 `id_token`이 함께 발급됩니다. `refresh_token` grant로는 `id_token`이 발급되지 않습니다.

**`id_token` JWT 클레임** (`scope=openid email` 기준):

```json
{
  "sub": "{user_uuid}",
  "iss": "{issuer}",
  "aud": "{client_id}",
  "exp": 1748880000,
  "iat": 1748876400,
  "nonce": "{nonce_from_authorize_request}",
  "email": "user@example.com",
  "email_verified": true
}
```

`nonce`는 인가 요청 시 전달한 경우에만 포함됩니다. `email`, `email_verified`는 `scope=email`인 경우에 포함됩니다. `email_verified`는 사용자 상태가 ACTIVE이면 `true`입니다.

**`access_token` JWT 클레임**:

```json
{
  "sub": "{user_uuid}",
  "iss": "{issuer}",
  "aud": "{client_id}",
  "exp": 1748880000,
  "iat": 1748876400,
  "jti": "{uuid}",
  "tenant_id": "{tenant_uuid}",
  "scope": "openid email profile",
  "roles": [],
  "permissions": []
}
```

`access_token`은 RS256으로 서명됩니다. 백엔드 서비스가 JWKS 공개키로 직접 검증할 수 있습니다.

### 단계 (5): 백엔드 서비스 → Authori userinfo

사용자 계정 연동(JIT 프로비저닝)이 필요한 경우 userinfo 엔드포인트를 호출합니다.

```http
GET {userinfo_endpoint}
Authorization: Bearer {access_token}
```

**응답** (`scope=openid email profile`, 프로필 스키마에 해당 필드가 등록된 경우):

```json
{
  "sub": "{user_uuid}",
  "tenant_id": "{tenant_uuid}",
  "email": "user@example.com",
  "name": "홍길동",
  "picture": "https://..."
}
```

클레임별 반환 조건은 6절 참조.

### 단계 (6): 백엔드 서비스 → 모바일 앱

백엔드 서비스가 자체 세션 토큰을 발급하여 모바일 앱에 반환합니다. Authori의 `refresh_token`은 백엔드 서비스가 암호화하여 DB에 보관합니다. 모바일 앱에는 노출되지 않습니다.

---

## 회원가입

### 사전 조건 — 테넌트 설정

공개 회원가입은 기본적으로 비활성화되어 있습니다. Authori 관리자 콘솔에서 테넌트 설정을 변경해야 합니다.

| 설정 항목 | 설명 |
| --------- | ---- |
| `allowRegistration` | `true`로 설정해야 `/oauth/register` 엔드포인트가 활성화됩니다. |
| `autoActivateRegistration` | `true`이면 가입 즉시 ACTIVE 상태로 생성됩니다. `false`(기본)이면 INACTIVE로 생성되며, 관리자 활성화가 필요합니다. |

### 회원가입 흐름

BFF 패턴에서 회원가입은 두 가지 방식으로 처리할 수 있습니다.

#### 방식 A: 가입 후 즉시 로그인 (autoActivateRegistration = true)

```text
모바일 앱                      백엔드 서비스 (BFF)             Authori
    |                              |                          |
    |-- (1) 회원가입 요청 --------> |                          |
    |   (email + password)         |                          |
    |                              |-- (2) POST /register --> |
    |                              |<-- { id, email } --------|
    |                              |                          |
    |                              |   [이후 로그인 플로우 수행]  |
    |                              |   (단계 2~6과 동일)        |
    |<-- (3) 서비스 세션 토큰 ------- |                          |
```

#### 방식 B: 가입 후 활성화 대기 (autoActivateRegistration = false)

```text
모바일 앱                      백엔드 서비스 (BFF)             Authori
    |                              |                          |
    |-- (1) 회원가입 요청 --------> |                          |
    |                              |-- (2) POST /register --> |
    |                              |<-- { id, email } --------|
    |<-- (3) "활성화 대기" 안내 ----- |                          |
    |                              |                          |
    |   [관리자 계정 활성화 후]      |                          |
    |-- (4) 로그인 시도 ----------> |                          |
    |                              |   [로그인 플로우 수행]      |
```

### 단계 (2): 백엔드 서비스 → Authori 회원가입

```http
POST {issuer}/oauth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "user_password",
  "profile": {
    "name": "홍길동"
  }
}
```

`issuer`에서 `/oauth/register` 경로를 사용합니다. discovery 문서의 `issuer` 값을 기반으로 구성하세요.

> `profile` 필드는 선택 사항입니다. 테넌트 프로필 스키마에 정의된 필드만 허용됩니다.

**Rate Limit**: 분당 5회 (IP 기준)

**성공 응답** (`201 Created`):

```json
{
  "message": "registered",
  "id": "{user_uuid}",
  "email": "user@example.com"
}
```

**오류 응답**:

| 상황 | HTTP | message | 처리 방안 |
| ------ | ------ | --------- | --------- |
| 회원가입 기능 비활성화 | `403` | `registration_disabled` | 서비스 정책 안내 |
| 이미 가입된 이메일 | `409` | `email_already_exists` | 로그인 유도 또는 안내 |
| 비밀번호 최소 길이 미달 | `400` | `password_too_short` + `minLength` 필드 | 최소 길이 안내 |

**`autoActivateRegistration = false`인 경우**: 생성된 사용자는 INACTIVE 상태입니다. 로그인 시도 시 `403 user_inactive`가 반환됩니다. 관리자가 계정을 활성화하기 전까지 로그인할 수 없음을 사용자에게 안내하세요.

### OAuth 흐름과 연속 처리 (선택)

회원가입 직후 바로 OAuth 인가 코드 발급을 이어가야 하는 경우, 단계 (2)에서 미리 인가 요청(`GET /oauth/authorize`)을 만들어 두고 `requestId`와 `clientId`를 함께 전달할 수 있습니다.

```json
{
  "email": "user@example.com",
  "password": "user_password",
  "requestId": "550e8400-...",
  "clientId": "{client_id}"
}
```

단, `autoActivateRegistration = true`인 경우에만 의미가 있습니다. INACTIVE 상태로 생성된 경우 이후 로그인(`POST /oauth/authorize`)이 실패하므로 이 방식을 사용하지 마세요.

---

## 사용자 계정 연동 (JIT 프로비저닝)

Authori 로그인 성공 후 userinfo로 받은 정보를 기반으로 서비스 계정을 자동 생성/연결하는 패턴입니다.

**Authori의 `sub` 특성**: `users` 테이블의 UUID PK로 영구 불변입니다. `access_token.sub`와 `userinfo.sub`는 항상 동일합니다.

**JIT 프로비저닝 로직**:

```text
1. userinfo.sub로 기존 서비스 계정 조회
   → 있으면: 해당 계정으로 로그인 처리

2. userinfo.email_verified == true이면 이메일로 기존 계정 연결
   → authori_sub 컬럼에 sub 저장 후 로그인
   (email_verified == false이면 이 단계 건너뜀)

3. 신규 계정 생성
   → 식별자 = userinfo.email (없으면 sub 사용)
   → 표시 이름 = userinfo.name
   → 프로필 이미지 = userinfo.picture
```

> `id_token`이 발급된 경우 userinfo 호출 없이 `id_token` 클레임에서 직접 `sub`, `email`, `email_verified`를 추출할 수 있습니다.

---

## 토큰 갱신

```http
POST {token_endpoint}
Authorization: Basic Base64({client_id}:{client_secret})
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token={stored_refresh_token}
```

**Refresh Token Rotation**: 갱신 응답에 새로운 `refresh_token`이 항상 포함됩니다. 이전 토큰을 새 토큰으로 교체하여 저장하세요.

**만료/폐기 에러 코드**:

| 상황 | HTTP | message | 처리 방안 |
| ------ | ------ | --------- | --------- |
| 토큰 만료 | `400` | `invalid_grant: token expired` | 로그인 재요청 |
| 토큰 폐기됨 | `400` | `invalid_grant` | 로그인 재요청 |
| 재사용 감지 | `400` | `invalid_grant: token reuse detected` | family 전체 폐기 → 로그인 재요청 |

---

## 로그아웃 — 토큰 폐기

```http
POST {revocation_endpoint}
Authorization: Basic Base64({client_id}:{client_secret})
Content-Type: application/x-www-form-urlencoded

token={stored_refresh_token}
&token_type_hint=refresh_token
```

> Confidential Client는 revoke 요청에도 클라이언트 인증이 적용됩니다 (RFC 7009 §2.1). `Authorization: Basic` 헤더 또는 `client_id`/`client_secret` body 파라미터로 인증하세요. secret이 틀리면 `401 invalid_client`가 반환됩니다.

**멱등성 보장**: RFC 7009 준수. 이미 폐기된 토큰 또는 존재하지 않는 토큰에 대해서도 항상 `200 OK`를 반환합니다.

**refresh_token 폐기 시**: 동일 토큰 family에 속한 모든 refresh_token이 함께 폐기됩니다.

---

## userinfo 클레임 참조

| 클레임 | 필요 scope | 현재 상태 |
| -------- | ----------- | --------- |
| `sub` | 항상 | ✅ 지원 |
| `tenant_id` | 항상 | ✅ 지원 |
| `email` | `email` | ✅ 지원 |
| `email_verified` | `email` | ✅ 지원 (ACTIVE 사용자 = `true`) |
| `name` | `profile` | 🔶 프로필 스키마 등록 필요 |
| `picture` | `profile` | 🔶 프로필 스키마 등록 필요 |

**`name`, `picture` 사용 조건**: 테넌트 프로필 스키마에 해당 필드가 정의되어 있어야 합니다. Authori 관리자 콘솔에서 스키마를 설정하세요:

```json
{
  "type": "object",
  "properties": {
    "name":    { "type": "string", "title": "표시 이름" },
    "picture": { "type": "string", "title": "프로필 이미지 URL" }
  }
}
```

---

## 토큰 서명 및 OIDC 디스커버리

### 서명

| 항목 | 내용 |
|------|------|
| 알고리즘 | **RS256** (HS256 미지원) |
| JWKS | `{issuer}/.well-known/jwks.json` |
| `aud` 클레임 | `{client_id}` |

**키 교체 정책**: 수동 교체, 사전 공지 후 진행합니다. JWKS에 복수의 키가 게시되며 JWT 헤더의 `kid`로 구분합니다. JWKS 캐시 TTL은 **1시간 이내**를 권장하며, `kid` 불일치 시 JWKS를 재조회하는 로직을 구현하세요.

### Discovery 엔드포인트

백엔드 서비스 시작 시 아래 URL을 자동 조회하면 모든 엔드포인트를 하드코딩 없이 구성할 수 있습니다.

```http
GET {issuer}/.well-known/openid-configuration
```

**응답 구조**:

```json
{
  "issuer": "{issuer}",
  "authorization_endpoint": "{issuer}/oauth/authorize",
  "token_endpoint": "{issuer}/oauth/token",
  "userinfo_endpoint": "{issuer}/oauth/userinfo",
  "revocation_endpoint": "{issuer}/oauth/revoke",
  "jwks_uri": "{issuer}/.well-known/jwks.json",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token", "client_credentials"],
  "subject_types_supported": ["public"],
  "id_token_signing_alg_values_supported": ["RS256"],
  "scopes_supported": ["openid", "email", "profile"],
  "token_endpoint_auth_methods_supported": ["client_secret_basic", "client_secret_post"],
  "code_challenge_methods_supported": ["S256", "plain"]
}
```

**issuer 형식**: Authori의 issuer는 테넌트 슬러그를 포함합니다.

```text
{JWT_ISSUER}/t/{tenant-slug}
예: https://auth.example.com/api/t/my-service
```

> 모든 엔드포인트가 `/t/{tenant-slug}/` prefix를 포함하므로, 반드시 discovery 문서에서 URL을 가져와 사용하세요. 표준 경로(`/oauth/authorize`)와 다릅니다.

---

## 스코프 등록

연동에 필요한 스코프는 Authori 관리자 콘솔에서 해당 테넌트에 사전 등록되어 있어야 합니다. 미등록 스코프를 요청하면 `400 invalid_scope` 에러가 반환됩니다.

기본 제공: `openid`  
별도 등록 필요: `email`, `profile` 및 커스텀 스코프
