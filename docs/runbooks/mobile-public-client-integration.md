# 모바일 앱 + 모바일 API 서비스의 Authori Public Client 연동 가이드

> 이 가이드는 모바일 앱이 직접 **Public Client**로 Authori와 OAuth2/OIDC 인증을 수행하고, 모바일 API 서비스는 **리소스 서버(토큰 검증자)** 역할을 하는 연동 방식을 설명합니다.
>
> 백엔드 서비스가 `client_secret`을 보관하고 OAuth 플로우를 대행하는 방식은 별도 문서 [모바일 앱 백엔드 서비스의 Confidential Client 연동 가이드](2026-06-02-mobile-bff-confidential-client-integration.md)를 참고하세요.

마지막 업데이트: 2026-06-02

---

## 연동 방식 개요

**Public Client(네이티브 앱) 패턴**에서는 모바일 앱이 직접 OAuth 클라이언트가 됩니다. 사용자는 **시스템 브라우저에 표시되는 Authori 호스팅 로그인 페이지**에서 인증하며, 앱은 `client_secret` 없이 **PKCE**로 보안을 확보합니다. 모바일 API 서비스는 들어오는 요청의 access token만 검증합니다.

```text
모바일 앱 (Public Client)        시스템 브라우저 / Authori          모바일 API 서비스 (리소스 서버)
        |                                |                                |
        |-- (1) ASWebAuthSession 오픈 -->|                                |
        |   GET /authorize (PKCE)        |                                |
        |                                |-- 로그인 페이지 표시            |
        |                                |   사용자가 직접 인증            |
        |<-- (2) 커스텀스킴/Universal --- |                                |
        |     Link 콜백 (code, state)    |                                |
        |                                |                                |
        |-- (3) POST /token ------------>|                                |
        |   (client_id + code_verifier,  |                                |
        |    secret 없음)                |                                |
        |<-- access/refresh token -------|                                |
        |                                |                                |
        |   [토큰을 보안 저장소에 보관]   |                                |
        |                                |                                |
        |-- (4) API 호출 (Bearer token) ----------------------------------->|
        |                                |   (5) 토큰 검증                 |
        |                                |   - JWKS 오프라인 검증, 또는    |
        |                                |   - POST /oauth/verify          |
        |<-- 리소스 응답 -------------------------------------------------- |
```

**핵심 특징**:

- 모바일 앱이 OAuth 클라이언트입니다. 토큰을 앱이 직접 보관합니다.
- `client_secret`이 없습니다. 대신 PKCE(S256)로 인가 코드 탈취를 방지합니다.
- 사용자 자격증명은 앱이 다루지 않습니다. **Authori 호스팅 로그인 페이지(시스템 브라우저)** 에서만 입력됩니다.
- 모바일 API 서비스는 OAuth 플로우에 관여하지 않고, access token 검증만 수행하는 리소스 서버입니다.

---

## Confidential(BFF) 방식과의 차이

| 항목 | Confidential (BFF) | **Public (이 문서)** |
| --- | --- | --- |
| OAuth 클라이언트 | 백엔드 API 서버 | **모바일 앱** |
| `client_secret` | 서버가 보관 | **없음 (PKCE로 대체)** |
| 자격증명 입력 위치 | 앱 네이티브 폼 → 서버 경유 | **Authori 호스팅 로그인 페이지(시스템 브라우저)** |
| 토큰 보관 | 백엔드 서버 | **모바일 앱 보안 저장소** |
| 모바일 API 서비스 역할 | OAuth 처리 + 리소스 | **리소스 서버(토큰 검증)만** |
| `/authorize` 호출 방식 | `Accept: application/json` 프로그램 호출 | **시스템 브라우저 리다이렉트** |

---

## 클라이언트 등록 요건

Authori 관리자 콘솔에서 클라이언트를 아래 조건으로 등록합니다.

| 항목 | 값 | 설명 |
| --- | --- | --- |
| Client 유형 | `PUBLIC` | `client_secret` 미발급 |
| `redirect_uri` | HTTPS claimed URL 권장 (아래 결정 포인트 참조) | 인가 콜백 수신 |
| 허용 grant type | `authorization_code`, `refresh_token` | |
| PKCE | `S256` **필수** | 테넌트 설정에서 `requirePkce` 활성화 권장 |
| 허용 scope | `openid`, `email`, `profile` 등 | |

> **PKCE 강제**: Public Client는 PKCE 없이는 인가 코드 탈취에 취약합니다. 테넌트 설정에서 `requirePkce`를 켜면 `code_challenge` 없는 인가 요청이 `400 code_challenge_required`로 거부됩니다. Public Client를 사용하는 테넌트는 이 설정을 활성화하세요.

### ⚠️ 결정 포인트: redirect_uri 형식

네이티브 앱의 redirect_uri는 일반적으로 두 가지를 사용합니다.

1. **HTTPS claimed URL (Universal Links / App Links)** — 예: `https://app.example.com/oauth/callback`
   - **현재 Authori에서 변경 없이 등록·동작합니다.** (권장)
   - iOS Universal Links / Android App Links로 앱이 해당 URL을 가로채도록 구성합니다.
   - 커스텀 스킴보다 보안상 권장됩니다 (RFC 8252).

2. **커스텀 스킴** — 예: `mybestcare://oauth/callback`
   - **현재 Authori 클라이언트 등록 API는 커스텀 스킴 등록을 거부합니다.** 등록 검증이 `http/https` 프로토콜만 허용하기 때문입니다.
   - 인가 시점의 redirect_uri 매칭 자체는 스킴 제한이 없으므로, 등록만 가능해지면 런타임 동작에는 문제가 없습니다.
   - 커스텀 스킴 지원이 필요하면 **등록 검증 완화(소규모 코드 변경)가 필요**합니다. 적용 여부는 별도 협의가 필요합니다.

> **권장**: 우선 HTTPS claimed URL로 진행하면 Authori 변경 없이 즉시 연동할 수 있습니다. 커스텀 스킴이 반드시 필요한 경우에만 등록 검증 완화를 요청하세요.

---

## 단계별 상세 가이드

### 단계 (0): 앱에서 PKCE / state 생성

```text
code_verifier   = base64url(random 32~64 bytes)
code_challenge  = base64url(SHA256(code_verifier))
state           = base64url(random 32 bytes)   // CSRF 방지
```

`code_verifier`와 `state`는 앱 메모리/임시 저장소에 보관하고, 콜백 수신 시 사용합니다.

### 단계 (1): 시스템 브라우저로 인가 요청

앱은 인앱 웹뷰가 아닌 **시스템 브라우저 세션**(iOS `ASWebAuthenticationSession`, Android Chrome Custom Tabs)으로 인가 URL을 엽니다. 이 세션은 콜백 스킴/도메인을 가로채 결과를 앱에 돌려줍니다.

```text
GET {authorization_endpoint}
  ?response_type=code
  &client_id={client_id}
  &redirect_uri={registered_redirect_uri}
  &scope=openid%20email%20profile
  &state={state}
  &nonce={nonce}
  &code_challenge={code_challenge}
  &code_challenge_method=S256
```

> `Accept` 헤더를 직접 지정하지 않습니다. 시스템 브라우저는 `Accept: text/html`로 요청하므로 Authori가 호스팅 로그인 페이지로 리다이렉트합니다. `nonce`를 전달하면 발급된 `id_token`에 포함되어 반환됩니다.

`authorization_endpoint`는 OIDC 디스커버리 문서에서 가져옵니다 (아래 디스커버리 절 참조).

**진행 흐름**:

1. 시스템 브라우저가 인가 URL을 로드합니다.
2. Authori가 호스팅 로그인 페이지로 리다이렉트합니다.
3. 사용자가 로그인 페이지에서 이메일/비밀번호로 인증하고 동의합니다.
4. 로그인 페이지가 브라우저를 `redirect_uri`로 리다이렉트합니다 (단계 2).

### 단계 (2): 콜백 수신

```text
# 성공
{redirect_uri}?code={authorization_code}&state={state_echo}
```

`ASWebAuthenticationSession` / Custom Tabs가 이 콜백을 가로채 앱으로 전달합니다.

**앱 처리**:

- `state`가 단계 (0)에서 생성한 값과 일치하는지 검증합니다 (불일치 시 중단).
- 사용자가 브라우저를 닫거나 취소하면 콜백 없이 세션이 종료됩니다. 이 경우 SDK가 취소 에러를 반환하므로 앱에서 처리합니다 (별도 에러 콜백 없음).

인가 코드 유효 시간: **10분** (일회용, 재사용 불가).

### 단계 (3): 토큰 교환

앱이 직접 토큰 엔드포인트를 호출합니다. **`client_secret`은 보내지 않으며**, `client_id`를 body에 포함하고 PKCE `code_verifier`로 검증합니다.

```http
POST {token_endpoint}
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code={authorization_code}
&redirect_uri={registered_redirect_uri}
&client_id={client_id}
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

> `scope`에 `openid`가 포함된 경우 `id_token`이 함께 발급됩니다. `id_token` 클레임에서 `sub`, `email`, `email_verified`, `nonce`를 직접 추출할 수 있습니다.

### 단계 (4): 토큰 보안 저장

앱은 발급된 토큰을 OS 보안 저장소에 보관합니다.

- iOS: Keychain
- Android: EncryptedSharedPreferences / Keystore

`refresh_token`은 특히 민감하므로 평문 보관을 피하고, 가능하면 디바이스 바인딩/생체 인증과 연계하세요.

### 단계 (5): 모바일 API 서비스 호출 및 토큰 검증

앱이 모바일 API 서비스를 호출할 때 access token을 Bearer로 전달합니다.

```http
GET https://{your-mobile-api}/some/resource
Authorization: Bearer {access_token}
```

모바일 API 서비스(리소스 서버)는 토큰을 검증합니다. 검증 방법은 아래 절 참조.

---

## 리소스 서버의 토큰 검증

모바일 API 서비스는 두 가지 방식으로 access token을 검증할 수 있습니다.

### 방법 A: JWKS 오프라인 검증 (권장, 저지연)

Authori를 호출하지 않고 공개키로 직접 서명을 검증합니다.

1. 디스커버리 문서의 `jwks_uri`에서 공개키 집합을 조회해 캐시합니다 (TTL 1시간 이내 권장).
2. 들어온 JWT 헤더의 `kid`로 해당 공개키를 선택합니다.
3. 다음을 검증합니다.

| 검증 항목 | 기대값 |
| --- | --- |
| 서명 | RS256, JWKS 공개키로 검증 |
| `iss` | 테넌트 issuer (`{JWT_ISSUER}/t/{tenant-slug}`) |
| `aud` | 허용된 `client_id` |
| `exp` | 만료 전 |
| `scope` | 엔드포인트에 필요한 scope 포함 여부 |

> 오프라인 검증은 빠르지만 **폐기(revocation)를 즉시 반영하지 못합니다.** access token TTL(기본 1시간)만큼 폐기 지연이 발생할 수 있습니다.

### 방법 B: `POST /oauth/verify` 호출 (폐기 즉시 반영)

폐기를 즉시 반영해야 하는 민감한 작업에는 Authori의 검증 엔드포인트를 사용합니다.

```http
POST {issuer}/oauth/verify
Authorization: Bearer {access_token}
```

**성공 응답**:

```json
{
  "active": true,
  "subjectType": "user",
  "sub": "{user_uuid}",
  "clientId": "{client_id}",
  "tenantId": "{tenant_uuid}",
  "scope": "openid email profile",
  "scopes": ["openid", "email", "profile"],
  "jti": "{token_jti}",
  "expiresAt": "2026-06-02T12:34:56.000Z"
}
```

이 엔드포인트는 서명·만료뿐 아니라 **DB의 폐기 상태와 테넌트 일치**까지 확인합니다.

**실패 응답** (모두 `401`):

| 상황 | message |
| --- | --- |
| Bearer 헤더 없음 | `Bearer token required` |
| 서명/형식/만료 실패 | `invalid_token` |
| 토큰 테넌트 불일치 | `tenant_mismatch` |
| 폐기되었거나 DB에 없는 토큰 | `token_revoked` |

> **권장 조합**: 일반 조회는 방법 A(오프라인), 결제·개인정보 변경 등 민감 작업은 방법 B로 폐기 여부를 재확인하는 하이브리드 전략을 권장합니다.

---

## 토큰 갱신

access token 만료 시 앱이 직접 갱신합니다. Public Client는 `client_secret` 없이 `client_id`만 전달합니다.

```http
POST {token_endpoint}
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token={stored_refresh_token}
&client_id={client_id}
```

**Refresh Token Rotation**: 갱신 응답에 새로운 `refresh_token`이 항상 포함됩니다. 앱은 이전 토큰을 새 토큰으로 교체해 저장하세요.

**만료/폐기 에러 코드**:

| 상황 | HTTP | message | 앱 처리 |
| --- | --- | --- | --- |
| 토큰 만료 | `400` | `invalid_grant: token expired` | 재로그인 유도 |
| 토큰 폐기됨 | `400` | `invalid_grant` | 재로그인 유도 |
| 재사용 감지 | `400` | `invalid_grant: token reuse detected` | family 전체 폐기 → 재로그인 |

> **재사용 감지 주의**: 앱이 갱신 후 새 `refresh_token` 저장에 실패하고 이전 토큰을 재사용하면 family 전체가 폐기됩니다. 갱신 응답 저장을 원자적으로 처리하세요.

---

## 로그아웃 — 토큰 폐기

앱 로그아웃 시 보관 중인 `refresh_token`을 폐기 요청합니다.

```http
POST {revocation_endpoint}
Content-Type: application/x-www-form-urlencoded

token={stored_refresh_token}
&token_type_hint=refresh_token
&client_id={client_id}
```

**멱등성 보장**: RFC 7009 준수. 이미 폐기된 토큰이나 존재하지 않는 토큰에도 항상 `200 OK`를 반환합니다. 앱은 폐기 응답과 무관하게 로컬 보안 저장소의 토큰을 삭제하세요.

**refresh_token 폐기 시**: 동일 토큰 family의 모든 refresh_token이 함께 폐기됩니다. 단, 이미 발급된 access token은 만료(기본 1시간) 전까지 오프라인 검증을 통과할 수 있습니다. 즉시 차단이 필요하면 리소스 서버가 방법 B(`/oauth/verify`)로 검증해야 합니다.

---

## 사용자 정보 조회

앱 또는 리소스 서버가 사용자 프로필이 필요하면 userinfo를 호출합니다.

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

`sub`는 `users` 테이블의 UUID PK로 영구 불변이며, access token의 `sub`와 항상 동일합니다.

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

**키 교체 정책**: 수동 교체, 사전 공지 후 진행합니다. JWKS에 복수 키가 게시되며 JWT 헤더 `kid`로 구분합니다. 리소스 서버는 JWKS 캐시 TTL을 **1시간 이내**로 두고, `kid` 불일치 시 JWKS를 재조회하세요.

### Discovery 엔드포인트

앱과 리소스 서버 모두 시작 시 아래 URL을 조회하면 엔드포인트를 하드코딩 없이 구성할 수 있습니다.

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

## 보안 권고 (네이티브 앱)

- **시스템 브라우저 사용**: 인앱 웹뷰(WKWebView/WebView)가 아닌 `ASWebAuthenticationSession`/Custom Tabs를 사용하세요. 인앱 웹뷰는 자격증명 탈취 위험이 있고 RFC 8252에서 권장되지 않습니다.
- **PKCE S256 필수**: 모든 인가 요청에 `code_challenge_method=S256`을 사용하세요.
- **state 검증**: 콜백의 `state`를 반드시 검증해 CSRF를 방지하세요.
- **토큰 보안 저장**: Keychain/Keystore 사용. `refresh_token`은 디바이스 바인딩 권장.
- **HTTPS claimed URL 우선**: 커스텀 스킴보다 Universal Links / App Links가 안전합니다.

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

모바일 앱이 Bearer 토큰으로 API를 호출할 때 모바일 API 서비스(리소스 서버)가 이 클레임을 파싱해 접근 제어에 활용합니다.

### 기본 역할 (isDefault)

역할을 `isDefault: true`로 설정하면 **신규 가입 사용자에게 자동으로 부여**됩니다. 예를 들어 `member` 역할을 기본 역할로 설정하면, 회원가입 즉시 해당 역할을 보유한 상태로 첫 토큰이 발급됩니다.

기본 역할은 Authori 관리자 콘솔에서 설정합니다.

### 역할/권한 등록

역할과 권한은 Authori 관리자 콘솔에서 테넌트별로 등록합니다.

| 관리 항목 | 위치 |
| --------- | ---- |
| 역할 등록/수정/삭제 | 관리자 콘솔 → 테넌트 → RBAC → 역할 |
| 권한 등록/수정/삭제 | 관리자 콘솔 → 테넌트 → RBAC → 권한 |
| 역할에 권한 할당 | 관리자 콘솔 → 역할 → 권한 설정 |
| 사용자에 역할 할당 | 관리자 콘솔 → 사용자 → 역할 설정 |

### M2M API로 사용자 역할 프로그램 관리

모바일 API 서비스가 사용자 역할을 프로그램 방식으로 조회·변경해야 하는 경우(예: 관리자 승인 후 역할 부여, JIT 역할 프로비저닝), M2M RBAC API를 사용합니다.

> **Public 클라이언트에는 `client_secret`이 없으므로** M2M API는 앱이 아닌 **모바일 API 서비스(서버)** 가 직접 호출해야 합니다. 이를 위해 Authori 관리자 콘솔에서 `client_credentials` grant를 허용한 **별도의 Confidential 클라이언트**를 등록하고, 서버 환경변수로 보관하세요.

**M2M 액세스 토큰 발급** (모바일 API 서비스에서 수행):

```http
POST {token_endpoint}
Authorization: Basic Base64({m2m_client_id}:{m2m_client_secret})
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&scope=rbac:read rbac:write
```

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

### 모바일 API 서비스(리소스 서버)에서 RBAC 적용

access token의 `roles`/`permissions` 클레임을 JWKS 오프라인 검증 또는 `/oauth/verify` 응답에서 파싱하여 API 접근 제어에 활용합니다. 토큰 검증 방법은 위 **리소스 서버의 토큰 검증** 절을 참조하세요.

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
