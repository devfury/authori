# 웹 앱(프론트엔드 + 백엔드)의 Authori Confidential Client 연동 가이드

> 이 가이드는 브라우저 기반 웹 앱(F/E) + 서버(B/E) 구조에서 **표준 OAuth2 Authorization Code 흐름**으로 Authori와 연동하는 방식을 설명합니다. B/E가 `client_secret`을 보관하는 **Confidential Client**이며, 사용자는 **Authori 호스팅 로그인 페이지로 리다이렉트**되어 인증합니다.
>
> 관련 문서:
> - 모바일 앱이 직접 클라이언트가 되는 방식 → [Public Client 연동 가이드](2026-06-02-mobile-public-client-integration.md)
> - 모바일 앱 네이티브 폼 + 백엔드 자격증명 대행 방식 → [모바일 BFF Confidential 연동 가이드](2026-06-02-mobile-bff-confidential-client-integration.md)

---

## 연동 방식 개요

웹 앱은 **브라우저 리다이렉트 기반 Authorization Code 흐름**을 사용합니다. 사용자의 자격증명은 웹 앱이 직접 다루지 않고, 브라우저가 Authori 호스팅 로그인 페이지로 이동해 거기서 입력합니다. 토큰은 B/E가 서버 측에 보관하고, 브라우저에는 자체 세션 쿠키만 내려줍니다.

```text
브라우저 (웹 F/E)              웹 B/E (Confidential Client)          Authori
     |                              |                                  |
     |-- (1) 로그인 클릭 ---------->|                                  |
     |                              |  state/PKCE 생성, 세션 저장       |
     |<-- (2) 302 → /authorize -----|                                  |
     |                                                                 |
     |-- (3) GET /authorize (브라우저 네비게이션, Accept: text/html) -->|
     |                                                                 |  로그인 페이지 표시
     |                                                                 |  사용자가 직접 인증
     |<-- (4) 302 → {B/E 콜백}?code&state ------------------------------|
     |                              |                                  |
     |-- (5) GET /auth/callback --->|                                  |
     |        ?code&state           |  state 검증                      |
     |                              |-- (6) POST /token -------------->|
     |                              |   (Basic Auth, code, verifier)   |
     |                              |<-- access/refresh token ---------|
     |                              |  토큰을 서버에 보관               |
     |<-- (7) Set-Cookie: session --|                                  |
     |    (httpOnly, secure)        |                                  |
     |                              |                                  |
     |-- (8) API 호출 (세션 쿠키) ->|                                  |
     |                              |-- (보호 리소스/userinfo, Bearer)->|
     |<-- 응답 -------------------- |<---------------------------------|
```

**핵심 특징**:

- 사용자 자격증명은 웹 앱이 다루지 않습니다. **Authori 호스팅 로그인 페이지**에서만 입력됩니다.
- 토큰(access/refresh)은 **B/E 서버 측에만 보관**합니다. 브라우저에는 노출하지 않습니다.
- 브라우저는 B/E가 발급한 **httpOnly secure 세션 쿠키**로만 인증 상태를 유지합니다.
- `redirect_uri`는 B/E의 콜백 HTTPS URL입니다 (예: `https://app.example.com/auth/callback`).

---

## 다른 연동 방식과의 차이

| 항목 | **웹 앱 (이 문서)** | 모바일 BFF | 모바일 Public |
| --- | --- | --- | --- |
| OAuth 클라이언트 | 웹 B/E | 모바일 B/E | 모바일 앱 |
| `client_secret` | B/E 보관 | B/E 보관 | 없음 (PKCE) |
| 로그인 UI | Authori 호스팅 페이지 | 앱 네이티브 폼 | Authori 호스팅 페이지 |
| `/authorize` 호출 | **브라우저 리다이렉트** | `POST /authorize` 프로그램 호출 | 시스템 브라우저 |
| 토큰 보관 | B/E 서버 | B/E 서버 | 앱 보안 저장소 |
| 브라우저/앱 인증 상태 | httpOnly 세션 쿠키 | 자체 세션 | 토큰 직접 보유 |

> **로그인 UI 선택**: 웹 앱이 **자체 로그인 폼**을 자사 페이지에 두고 싶다면, 모바일 BFF 가이드의 `POST /authorize` 프로그램 호출 방식도 사용할 수 있습니다. 다만 표준·권장 방식은 본 문서의 **Authori 호스팅 로그인 페이지 리다이렉트**입니다 (피싱 내성, 자격증명 격리, 표준 라이브러리 호환).

---

## 클라이언트 등록 요건

| 항목 | 값 | 설명 |
| --- | --- | --- |
| Client 유형 | `CONFIDENTIAL` | B/E가 `client_secret` 보관 |
| 인증 방식 | `client_secret_basic` 또는 `client_secret_post` | 토큰 엔드포인트 인증 |
| `redirect_uri` | B/E 콜백 HTTPS URL | 예: `https://app.example.com/auth/callback` |
| 허용 grant type | `authorization_code`, `refresh_token` | |
| PKCE | `S256` 권장 | Confidential도 방어 심화 차원에서 권장 |
| 허용 scope | `openid`, `email`, `profile` 등 | |

> `redirect_uri`는 일반 HTTPS URL이므로 변경 없이 등록·동작합니다. 인가 시점에 **정확 문자열 일치**로 검증되므로, 등록 값과 요청 값(쿼리·경로·트레일링 슬래시 포함)이 완전히 동일해야 합니다. 환경별(dev/staging/prod) 콜백 URL을 각각 등록하세요.

---

## 단계별 상세 가이드

### 단계 (1)~(2): 로그인 시작 및 인가 URL 리다이렉트

F/E 로그인 버튼은 B/E의 로그인 시작 엔드포인트(자체 설계)를 호출합니다. B/E는 `state`와 PKCE 값을 생성해 **사용자 세션에 저장**하고, 브라우저를 Authori 인가 URL로 302 리다이렉트합니다.

```text
state          = base64url(random 32 bytes)        // CSRF 방지, 세션 저장
code_verifier  = base64url(random 32~64 bytes)     // 세션 저장
code_challenge = base64url(SHA256(code_verifier))
```

```http
HTTP/1.1 302 Found
Location: {authorization_endpoint}
  ?response_type=code
  &client_id={client_id}
  &redirect_uri=https://app.example.com/auth/callback
  &scope=openid%20email%20profile
  &state={state}
  &nonce={nonce}
  &code_challenge={code_challenge}
  &code_challenge_method=S256
```

`authorization_endpoint`는 디스커버리 문서에서 가져옵니다 (아래 디스커버리 절 참조).

### 단계 (3)~(4): Authori 호스팅 로그인 및 콜백 리다이렉트

1. 브라우저가 인가 URL로 이동합니다 (`Accept: text/html`).
2. Authori가 호스팅 로그인 페이지로 리다이렉트합니다.
3. 사용자가 이메일/비밀번호로 인증하고 동의합니다.
4. Authori가 브라우저를 B/E 콜백으로 리다이렉트합니다.

```text
# 성공
https://app.example.com/auth/callback?code={authorization_code}&state={state_echo}
```

인가 코드 유효 시간: **10분** (일회용, 재사용 불가).

### 단계 (5): B/E 콜백 — state 검증

```http
GET /auth/callback?code={authorization_code}&state={state_echo}
```

B/E는 콜백의 `state`가 세션에 저장한 값과 일치하는지 검증합니다 (불일치 시 중단, CSRF 차단).

### 단계 (6): 토큰 교환

B/E가 `client_secret`과 세션의 `code_verifier`로 토큰을 교환합니다.

```http
POST {token_endpoint}
Authorization: Basic Base64({client_id}:{client_secret})
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code={authorization_code}
&redirect_uri=https://app.example.com/auth/callback
&code_verifier={code_verifier}
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

> `scope`에 `openid`가 포함된 경우 `id_token`이 함께 발급됩니다. B/E는 `id_token` 클레임에서 `sub`, `email`, `email_verified`, `nonce`를 직접 추출할 수 있으며, 표준 OIDC 라이브러리(passport-openidconnect, openid-client 등)와 호환됩니다.

### 단계 (7): 세션 수립

B/E는 발급된 토큰을 **서버 측 세션 저장소(또는 DB)** 에 보관하고, 브라우저에는 세션 식별자만 httpOnly·secure 쿠키로 내려줍니다.

```http
HTTP/1.1 302 Found
Location: https://app.example.com/
Set-Cookie: session=...; HttpOnly; Secure; SameSite=Lax; Path=/
```

- access/refresh token은 브라우저에 노출하지 않습니다 (XSS 토큰 탈취 방지).
- `SameSite=Lax`(또는 `Strict`)로 CSRF를 완화합니다.

### 단계 (8): 이후 API 호출

브라우저는 세션 쿠키로 B/E API를 호출합니다. B/E는 세션에서 access token을 꺼내 Authori 보호 리소스 또는 userinfo를 호출합니다. 토큰은 브라우저로 흘러가지 않습니다.

---

## 회원가입

### 사전 조건 — 테넌트 설정

공개 회원가입은 기본적으로 비활성화되어 있습니다. Authori 관리자 콘솔에서 테넌트 설정을 변경해야 합니다.

| 설정 항목 | 설명 |
| --------- | ---- |
| `allowRegistration` | `true`로 설정해야 `/oauth/register` 엔드포인트가 활성화됩니다. |
| `autoActivateRegistration` | `true`이면 가입 즉시 ACTIVE 상태로 생성됩니다. `false`(기본)이면 INACTIVE로 생성되며, 관리자 활성화가 필요합니다. |

### 회원가입 흐름

웹 앱의 회원가입은 B/E가 자체 회원가입 페이지(F/E)를 제공하고, 사용자가 입력한 정보를 B/E가 Authori에 전달하는 방식으로 처리합니다.

#### 방식 A: 가입 후 즉시 로그인 (autoActivateRegistration = true)

```text
브라우저 (웹 F/E)              웹 B/E                           Authori
     |                              |                          |
     |-- (1) 회원가입 폼 제출 ------>|                          |
     |   (email + password)         |                          |
     |                              |-- (2) POST /register --> |
     |                              |<-- { id, email } --------|
     |                              |                          |
     |                              |   [인가 요청 → 토큰 교환]  |
     |                              |   (단계 1~7과 동일)        |
     |<-- (3) Set-Cookie: session --|                          |
```

#### 방식 B: 가입 후 활성화 대기 (autoActivateRegistration = false)

```text
브라우저 (웹 F/E)              웹 B/E                           Authori
     |                              |                          |
     |-- (1) 회원가입 폼 제출 ------>|                          |
     |                              |-- (2) POST /register --> |
     |                              |<-- { id, email } --------|
     |<-- (3) "활성화 대기" 안내 ----|                          |
     |                              |                          |
     |   [관리자 계정 활성화 후]      |                          |
     |-- (4) 로그인 클릭 ----------->|                          |
     |<-- (5) 302 → /authorize -----|                          |
     |                              (표준 로그인 플로우 진행)
```

### 단계 (2): B/E → Authori 회원가입

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

**`autoActivateRegistration = false`인 경우**: 생성된 사용자는 INACTIVE 상태입니다. 로그인 시도 시 Authori 호스팅 로그인 페이지에서 오류가 표시됩니다. 관리자가 계정을 활성화하기 전까지 로그인할 수 없음을 사용자에게 안내하세요.

### 가입 후 즉시 로그인 처리 (선택)

`autoActivateRegistration = true`인 경우, 가입 완료 후 B/E가 곧바로 인가 요청(`GET /oauth/authorize`으로 302 리다이렉트)을 이어갈 수 있습니다. 이때 Authori 호스팅 로그인 페이지에서 사용자가 다시 자격증명을 입력해야 합니다.

자격증명 재입력 없이 즉시 세션을 수립하려면, B/E가 프로그램 방식으로 인가 코드를 발급받는 [모바일 BFF Confidential 연동 가이드](2026-06-02-mobile-bff-confidential-client-integration.md)의 `POST /authorize` 방식도 참고할 수 있습니다.

> `autoActivateRegistration = false`인 경우에는 가입 직후 로그인을 이어가지 마세요. INACTIVE 상태로 생성된 계정은 로그인이 실패합니다.

---

## 세션 ↔ 토큰 관리

- **세션 만료 정책**: B/E 세션 수명은 자체 정책으로 정하되, access token 만료 시 보관 중인 refresh token으로 갱신합니다 (아래 절).
- **다중 인스턴스**: B/E가 여러 인스턴스로 수평 확장되면 세션·토큰을 공유 저장소(Redis 등)에 보관하세요.
- **토큰-세션 매핑**: 세션마다 access/refresh token 쌍을 보관하고, 로그아웃 시 함께 폐기합니다.

---

## 토큰 갱신

access token 만료 시 B/E가 보관 중인 refresh token으로 갱신합니다.

```http
POST {token_endpoint}
Authorization: Basic Base64({client_id}:{client_secret})
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token={stored_refresh_token}
```

**Refresh Token Rotation**: 갱신 응답에 새 `refresh_token`이 항상 포함됩니다. B/E는 이전 토큰을 새 토큰으로 교체해 세션에 저장하세요.

**만료/폐기 에러 코드**:

| 상황 | HTTP | message | B/E 처리 |
| --- | --- | --- | --- |
| 토큰 만료 | `400` | `invalid_grant: token expired` | 세션 만료 → 재로그인 유도 |
| 토큰 폐기됨 | `400` | `invalid_grant` | 세션 만료 → 재로그인 유도 |
| 재사용 감지 | `400` | `invalid_grant: token reuse detected` | family 전체 폐기 → 재로그인 |

---

## 로그아웃

로그아웃 시 B/E는 (1) 자체 세션을 파기하고 (2) Authori에 refresh token 폐기를 요청합니다.

```http
POST {revocation_endpoint}
Authorization: Basic Base64({client_id}:{client_secret})
Content-Type: application/x-www-form-urlencoded

token={stored_refresh_token}
&token_type_hint=refresh_token
```

```http
HTTP/1.1 302 Found
Location: https://app.example.com/
Set-Cookie: session=; Max-Age=0; HttpOnly; Secure; Path=/
```

**멱등성 보장**: RFC 7009 준수. 이미 폐기되었거나 존재하지 않는 토큰에도 항상 `200 OK`를 반환합니다. 폐기 응답과 무관하게 세션 쿠키를 제거하세요.

**refresh_token 폐기 시**: 동일 토큰 family의 모든 refresh_token이 함께 폐기됩니다.

---

## 사용자 정보 조회

B/E가 사용자 프로필이 필요하면 userinfo를 호출합니다.

```http
GET {userinfo_endpoint}
Authorization: Bearer {access_token}
```

| 클레임 | 필요 scope | 현재 상태 |
| --- | --- | --- |
| `sub` | 항상 | ✅ 지원 |
| `tenant_id` | 항상 | ✅ 지원 |
| `email` | `email` | ✅ 지원 |
| `email_verified` | `email` | ✅ 지원 (ACTIVE 사용자 = `true`) |
| `name` | `profile` | 🔶 프로필 스키마 등록 필요 |
| `picture` | `profile` | 🔶 프로필 스키마 등록 필요 |

`sub`는 `users` 테이블의 UUID PK로 영구 불변이며 access token의 `sub`와 항상 동일합니다.

**`name`, `picture` 사용 조건**: 테넌트 프로필 스키마에 해당 필드가 정의되어 있어야 합니다. 관리자 콘솔에서 스키마를 설정하세요:

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
| --- | --- |
| 알고리즘 | **RS256** (HS256 미지원) |
| JWKS | `{issuer}/.well-known/jwks.json` |
| `aud` 클레임 | `{client_id}` |

B/E가 access token을 직접 검증하려면 JWKS 공개키로 RS256 서명을 검증하고 `iss`/`aud`/`exp`를 확인합니다. 폐기 즉시 반영이 필요하면 `POST {issuer}/oauth/verify`(Bearer)로 검증할 수 있습니다.

**키 교체 정책**: 수동 교체, 사전 공지 후 진행합니다. JWKS에 복수 키가 게시되며 JWT 헤더 `kid`로 구분합니다. JWKS 캐시 TTL은 **1시간 이내**로 두고 `kid` 불일치 시 재조회하세요.

### Discovery 엔드포인트

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

> 모든 엔드포인트가 `/t/{tenant-slug}/` prefix를 포함하므로, 반드시 디스커버리 문서에서 URL을 가져와 사용하세요.

---

## 보안 권고 (웹 앱)

- **토큰은 서버에만**: access/refresh token을 `localStorage`/`sessionStorage`/JS 접근 가능 쿠키에 두지 마세요. B/E 서버 측 보관 + httpOnly 쿠키 패턴을 사용하세요.
- **state 검증 필수**: 콜백의 `state`를 세션 값과 비교해 CSRF를 차단하세요.
- **PKCE 적용**: Confidential이라도 `S256` PKCE를 적용해 인가 코드 탈취를 방어하세요.
- **세션 쿠키 속성**: `HttpOnly`, `Secure`, `SameSite=Lax`(또는 `Strict`)를 설정하세요.
- **redirect_uri 정확 일치**: 와일드카드/부분 일치에 의존하지 말고 환경별 정확한 콜백 URL을 등록하세요.
- **HTTPS 전구간**: 콜백·토큰 엔드포인트 통신은 모두 HTTPS를 사용하세요.

---

## RBAC (역할 기반 접근 제어)

### 구조

Authori의 RBAC는 테넌트 단위로 관리됩니다.

- **역할(Role)**: 테넌트에 정의된 권한 묶음. `name`(slug), `displayName`, `isDefault` 속성을 가집니다.
- **권한(Permission)**: 역할에 할당할 수 있는 개별 권한. `name`(slug), `displayName` 속성을 가집니다.
- **사용자 역할**: 한 사용자에게 복수의 역할을 할당할 수 있습니다.

```
테넌트
  └─ 역할 (role)
       ├─ name: "member"
       ├─ isDefault: true
       └─ 권한 (permission)
            ├─ "document:read"
            └─ "comment:write"
```

### Access Token의 RBAC 클레임

사용자 토큰(`authorization_code` / `refresh_token` grant)의 access token JWT에 해당 사용자의 역할과 권한이 포함됩니다.

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
  "roles": ["member", "editor"],
  "permissions": ["document:read", "document:write", "comment:write"]
}
```

- `roles`: 사용자에게 할당된 역할 이름 목록
- `permissions`: 해당 역할들이 보유한 권한 이름 목록 (중복 제거)
- 역할/권한이 없으면 빈 배열(`[]`)로 포함됩니다.

> M2M(`client_credentials` grant) 토큰에는 `roles`/`permissions` 클레임이 포함되지 않습니다.

### 기본 역할 (isDefault)

역할을 `isDefault: true`로 설정하면 **신규 가입 사용자에게 자동으로 부여**됩니다. 예를 들어 `member` 역할을 기본 역할로 설정하면, 회원가입 즉시 해당 역할을 보유한 상태로 첫 토큰이 발급됩니다.

기본 역할은 Authori 관리자 콘솔에서 설정합니다.

### 역할/권한 등록

역할과 권한은 Authori 관리자 콘솔에서 테넌트별로 등록합니다.

| 관리 항목 | 위치 |
| --- | --- |
| 역할 등록/수정/삭제 | 관리자 콘솔 → 테넌트 → RBAC → 역할 |
| 권한 등록/수정/삭제 | 관리자 콘솔 → 테넌트 → RBAC → 권한 |
| 역할에 권한 할당 | 관리자 콘솔 → 역할 → 권한 설정 |
| 사용자에 역할 할당 | 관리자 콘솔 → 사용자 → 역할 설정 |

### M2M API로 사용자 역할 프로그램 관리

B/E가 사용자 역할을 프로그램 방식으로 조회·변경해야 하는 경우(예: 관리자 승인 후 역할 부여, JIT 역할 프로비저닝), M2M RBAC API를 사용합니다. 이 API는 `client_credentials` grant로 발급한 M2M 액세스 토큰으로 호출합니다.

**M2M 액세스 토큰 발급** (`rbac:read` / `rbac:write` 스코프 필요):

```http
POST {token_endpoint}
Authorization: Basic Base64({client_id}:{client_secret})
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&scope=rbac:read rbac:write
```

> 동일한 Confidential 클라이언트에 `client_credentials` grant와 `rbac:read`/`rbac:write` 스코프가 허용되어 있어야 합니다.

**역할 목록 조회**:

```http
GET {issuer}/api/roles
Authorization: Bearer {m2m_access_token}
```

```json
[
  {
    "id": "{role_uuid}",
    "name": "member",
    "displayName": "일반 회원",
    "isDefault": true,
    "rolePermissions": [
      { "permission": { "name": "document:read", "displayName": "문서 읽기" } }
    ]
  }
]
```

**사용자 역할 추가**:

```http
POST {issuer}/api/users/{userId}/roles/{roleId}
Authorization: Bearer {m2m_access_token}
```

**사용자 역할 제거**:

```http
DELETE {issuer}/api/users/{userId}/roles/{roleId}
Authorization: Bearer {m2m_access_token}
```

**사용자 역할 전체 교체**:

```http
PUT {issuer}/api/users/{userId}/roles
Authorization: Bearer {m2m_access_token}
Content-Type: application/json

{ "roleIds": ["{role_uuid_1}", "{role_uuid_2}"] }
```

> `{issuer}/api` 경로 예시: `https://auth.example.com/api/t/my-service/api/users/{userId}/roles`

### B/E에서 RBAC 적용

단계 (6) 토큰 교환 후 B/E가 세션에 보관 중인 access token JWT를 복호화하거나, `/oauth/verify`로 검증한 응답에서 역할/권한을 읽어 API 접근 제어에 활용합니다. 토큰은 브라우저에 노출되지 않으므로 B/E가 단독으로 권한 판단을 수행합니다.

```javascript
// access token JWT 검증 후
const { roles, permissions } = decodedAccessToken;

// 역할 기반 제어
if (!roles.includes('editor')) throw new ForbiddenError();

// 권한 기반 제어 (더 세밀한 제어 가능)
if (!permissions.includes('document:write')) throw new ForbiddenError();
```

---

## 스코프 등록

연동에 필요한 스코프는 관리자 콘솔에서 해당 테넌트에 사전 등록되어 있어야 합니다. 미등록 스코프 요청 시 `400 invalid_scope`가 반환됩니다.

기본 제공: `openid`
별도 등록 필요: `email`, `profile` 및 커스텀 스코프
