# 웹 SPA(백엔드 없음)의 Authori Public Client 연동 가이드

> 이 가이드는 **백엔드 없이 브라우저에서만 동작하는 SPA**(React/Vue 등 정적 호스팅)가 직접 **Public Client**로 Authori와 연동하는 방식을 설명합니다. SPA는 `client_secret` 없이 **PKCE**로 보안을 확보합니다.
>
> 관련 문서:
> - 백엔드가 있는 웹 앱 → [웹 앱 Confidential Client 연동 가이드](2026-06-02-web-app-confidential-client-integration.md) **(가능하면 이 방식 권장 — 아래 참조)**
> - 모바일 앱 직접 연동 → [모바일 Public Client 연동 가이드](2026-06-02-mobile-public-client-integration.md)

마지막 업데이트: 2026-06-02

---

## ⚠️ 먼저 검토: 백엔드가 있다면 Confidential을 쓰세요

순수 SPA Public 방식은 **토큰이 브라우저 JavaScript에 노출**되는 본질적 약점이 있습니다. access/refresh token이 메모리·스토리지에 있으면 XSS 한 번으로 탈취될 수 있습니다.

현대 보안 권고(OAuth 2.0 for Browser-Based Apps)는 **가능하면 SPA도 BFF(백엔드) 패턴**을 사용해 토큰을 서버에 두고 브라우저에는 httpOnly 세션 쿠키만 내리라고 권합니다.

| 환경 | 백엔드 | 권장 방식 | 문서 |
| --- | --- | --- | --- |
| 웹 | 있음 | **Confidential (BFF)** | [웹 앱 Confidential 가이드](2026-06-02-web-app-confidential-client-integration.md) |
| 웹 | 없음(정적 호스팅) | Public + PKCE | **이 문서** |

> 즉, 토큰 교환을 대신해 줄 서버를 둘 수 있다면 그 방식이 우선입니다. 정적 호스팅 전용이라 백엔드를 둘 수 없을 때만 이 문서의 SPA Public 방식을 사용하세요.

---

## 연동 방식 개요

SPA가 직접 OAuth 클라이언트가 되어, 브라우저 리다이렉트 기반 Authorization Code + PKCE 흐름을 수행합니다.

```text
SPA (브라우저, Public Client)                         Authori
     |                                                   |
     |  PKCE/state 생성 (sessionStorage 저장)             |
     |-- (1) location = /authorize (PKCE) -------------->|
     |                                                   |  로그인 페이지 표시
     |                                                   |  사용자가 직접 인증
     |<-- (2) 302 → {SPA 콜백}?code&state ----------------|
     |                                                   |
     |  state 검증                                        |
     |-- (3) POST /token (fetch, CORS) ----------------->|
     |   client_id + code_verifier, secret 없음          |
     |<-- access/refresh token --------------------------|
     |                                                   |
     |  토큰 보관 (메모리 권장)                            |
     |-- (4) GET /userinfo, 보호 리소스 (Bearer) ------->|
     |<-- 응답 ------------------------------------------|
```

**핵심 특징**:

- SPA가 OAuth 클라이언트입니다. 토큰을 브라우저가 직접 보유합니다.
- `client_secret`이 없습니다. PKCE(S256)로 인가 코드 탈취를 방지합니다.
- 사용자 자격증명은 SPA가 다루지 않습니다. **Authori 호스팅 로그인 페이지**에서만 입력됩니다.
- 브라우저가 직접 토큰 엔드포인트를 호출하므로 **CORS 설정이 필수**입니다 (아래 참조).

---

## 클라이언트 등록 요건

| 항목 | 값 | 설명 |
| --- | --- | --- |
| Client 유형 | `PUBLIC` | `client_secret` 미발급 |
| `redirect_uri` | SPA 콜백 HTTPS URL | 예: `https://app.example.com/callback` |
| 허용 grant type | `authorization_code`, `refresh_token` | |
| PKCE | `S256` **필수** | 테넌트 설정 `requirePkce` 활성화 권장 |
| 허용 scope | `openid`, `email`, `profile` 등 | |

> `redirect_uri`는 일반 HTTPS URL이므로 변경 없이 등록·동작합니다 (커스텀 스킴 제약 없음). 인가 시점에 **정확 문자열 일치**로 검증되니 환경별(dev/prod) 콜백 URL을 각각 등록하세요.

---

## CORS 설정 요건 (중요)

SPA는 브라우저에서 직접 Authori의 `/token`, `/userinfo`, `/revoke`를 호출합니다. 따라서 **SPA의 origin이 Authori CORS allowlist에 등록되어 있어야** 브라우저가 응답을 읽을 수 있습니다.

- Authori는 `CORS_ORIGINS` 환경변수로 허용 origin을 관리합니다.
- SPA를 서비스하는 origin(예: `https://app.example.com`)을 Authori 운영자에게 전달해 `CORS_ORIGINS`에 추가하도록 요청하세요.
- 미등록 시 토큰 교환 요청이 브라우저 CORS 정책에 의해 차단됩니다.

> 인가 요청(`/authorize`)은 브라우저 **네비게이션**(리다이렉트)이라 CORS 대상이 아니지만, 토큰 교환(`/token`)은 `fetch`/XHR이므로 CORS 대상입니다.

---

## 단계별 상세 가이드

### 단계 (0): PKCE / state 생성

```text
code_verifier  = base64url(random 32~64 bytes)
code_challenge = base64url(SHA256(code_verifier))
state          = base64url(random 32 bytes)        // CSRF 방지
```

`code_verifier`와 `state`를 `sessionStorage`에 임시 저장합니다 (콜백 처리 후 즉시 삭제). 리다이렉트로 페이지가 새로 로드되어도 유지되어야 하므로 메모리가 아닌 `sessionStorage`를 씁니다.

### 단계 (1): 인가 요청 리다이렉트

SPA가 브라우저를 Authori 인가 URL로 이동시킵니다 (`window.location.assign(...)` 또는 팝업).

```text
{authorization_endpoint}
  ?response_type=code
  &client_id={client_id}
  &redirect_uri=https://app.example.com/callback
  &scope=openid%20email%20profile
  &state={state}
  &nonce={nonce}
  &code_challenge={code_challenge}
  &code_challenge_method=S256
```

브라우저가 `Accept: text/html`로 요청하므로 Authori가 호스팅 로그인 페이지로 리다이렉트합니다. 사용자가 인증·동의하면 콜백으로 돌아옵니다. `nonce`를 전달하면 발급된 `id_token`에 포함되어 반환됩니다.

### 단계 (2): 콜백 수신

```text
# 성공
https://app.example.com/callback?code={authorization_code}&state={state_echo}
```

SPA 콜백 라우트가 `code`와 `state`를 파싱합니다. `state`가 `sessionStorage`의 값과 일치하는지 검증하세요 (불일치 시 중단). 사용자가 취소하면 콜백이 오지 않습니다.

인가 코드 유효 시간: **10분** (일회용, 재사용 불가).

### 단계 (3): 토큰 교환

SPA가 `fetch`로 직접 토큰을 교환합니다. **`client_secret` 없이** `client_id`와 PKCE `code_verifier`를 전달합니다.

```http
POST {token_endpoint}
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code={authorization_code}
&redirect_uri=https://app.example.com/callback
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

교환 직후 `sessionStorage`의 `code_verifier`/`state`를 삭제하세요.

> `scope`에 `openid`가 포함된 경우 `id_token`이 함께 발급됩니다. SPA는 `id_token` 클레임에서 `sub`, `email`, `email_verified`, `nonce`를 직접 추출할 수 있으며, 표준 OIDC 라이브러리(oidc-client-ts 등)와 호환됩니다.

### 단계 (4): API 호출

SPA가 access token을 Bearer로 보호 리소스/userinfo에 전달합니다.

```http
GET {userinfo_endpoint}
Authorization: Bearer {access_token}
```

---

## 토큰 보관 전략

SPA에는 OS 보안 저장소가 없어 토큰 보관이 가장 취약한 지점입니다.

| 보관 위치 | XSS 내성 | 새로고침 유지 | 권고 |
| --- | --- | --- | --- |
| 자바스크립트 메모리(변수) | 상대적으로 안전 | ✗ (탭 새로고침 시 소실) | **권장** |
| `sessionStorage` | 취약 | 탭 한정 유지 | 비권장 |
| `localStorage` | 취약 | 영구 유지 | **지양** |

- **access token은 메모리 보관을 권장**합니다. 새로고침 시 소실되면 refresh token으로 무음 갱신하거나 재인증합니다.
- **refresh token은 특히 민감**합니다. `localStorage` 보관은 XSS 탈취 위험이 크므로 지양하세요. 보관이 불가피하면 짧은 수명 + rotation에 의존합니다.
- 근본적으로 토큰 노출을 피하려면 BFF(Confidential) 방식을 사용하세요 (상단 권고 참조).

---

## 토큰 갱신

access token 만료(기본 1시간) 시 refresh token으로 갱신합니다. Public Client는 `client_id`만 전달합니다.

```http
POST {token_endpoint}
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token={stored_refresh_token}
&client_id={client_id}
```

**Refresh Token Rotation**: 갱신 응답에 새 `refresh_token`이 항상 포함됩니다. 이전 토큰을 새 토큰으로 즉시 교체하세요.

**만료/폐기 에러 코드**:

| 상황 | HTTP | message | SPA 처리 |
| --- | --- | --- | --- |
| 토큰 만료 | `400` | `invalid_grant: token expired` | 재로그인 유도 |
| 토큰 폐기됨 | `400` | `invalid_grant` | 재로그인 유도 |
| 재사용 감지 | `400` | `invalid_grant: token reuse detected` | family 전체 폐기 → 재로그인 |

> **재사용 감지 주의**: 갱신 응답 저장 실패 후 이전 refresh token을 재사용하면 family 전체가 폐기됩니다. 갱신과 저장을 원자적으로 처리하고, 여러 탭에서 동시에 갱신하지 않도록 (예: BroadcastChannel/락) 조정하세요.

---

## 로그아웃 — 토큰 폐기

```http
POST {revocation_endpoint}
Content-Type: application/x-www-form-urlencoded

token={stored_refresh_token}
&token_type_hint=refresh_token
&client_id={client_id}
```

**멱등성 보장**: RFC 7009 준수. 이미 폐기되었거나 존재하지 않는 토큰에도 항상 `200 OK`를 반환합니다. SPA는 폐기 응답과 무관하게 메모리/스토리지의 토큰을 즉시 삭제하세요.

**refresh_token 폐기 시**: 동일 토큰 family의 모든 refresh_token이 함께 폐기됩니다. 단, 이미 발급된 access token은 만료(기본 1시간) 전까지 유효할 수 있습니다.

---

## 사용자 정보 조회

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

> SPA가 access token 서명을 직접 검증할 일은 보통 없습니다(토큰을 발급받아 그대로 전달). 별도 리소스 서버가 있다면 그 서버가 JWKS로 검증합니다.

### Discovery 엔드포인트

SPA 시작 시 아래 URL을 조회하면 엔드포인트를 하드코딩 없이 구성할 수 있습니다.

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

## 보안 권고 (SPA)

- **BFF 우선 검토**: 백엔드를 둘 수 있으면 Confidential(BFF) 방식으로 토큰을 서버에 두세요 (상단 권고).
- **PKCE S256 필수**: 모든 인가 요청에 적용합니다.
- **state 검증**: 콜백 `state`를 반드시 검증해 CSRF를 차단합니다.
- **토큰은 메모리 우선**: `localStorage` 보관을 지양하고 access token은 메모리에 둡니다.
- **refresh token 최소화**: 보관이 불가피하면 rotation + 짧은 수명에 의존하고, 다중 탭 동시 갱신을 조정합니다.
- **CORS origin 최소화**: `CORS_ORIGINS`에 실제 SPA origin만 등록합니다 (`*` 지양).
- **CSP 적용**: XSS 표면을 줄이기 위해 strict Content-Security-Policy를 적용합니다.
- **HTTPS 전구간**: 콜백·토큰 통신은 모두 HTTPS를 사용합니다.

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

SPA가 Bearer 토큰으로 API를 호출할 때 API 서버(리소스 서버)가 이 클레임을 파싱해 접근 제어에 활용합니다. SPA 자체에서 역할/권한 클레임으로 UI를 조건부 렌더링할 수 있으나, **인가 판단의 최종 근거는 항상 서버 측**이어야 합니다.

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

API 서버가 사용자 역할을 프로그램 방식으로 조회·변경해야 하는 경우(예: 관리자 승인 후 역할 부여, JIT 역할 프로비저닝), M2M RBAC API를 사용합니다.

> **Public 클라이언트(SPA)에는 `client_secret`이 없으므로** M2M API는 브라우저가 아닌 **API 서버(백엔드)** 가 직접 호출해야 합니다. 이를 위해 Authori 관리자 콘솔에서 `client_credentials` grant를 허용한 **별도의 Confidential 클라이언트**를 등록하고, API 서버 환경변수로 보관하세요.

**M2M 액세스 토큰 발급** (API 서버에서 수행):

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

### API 서버(리소스 서버)에서 RBAC 적용

access token의 `roles`/`permissions` 클레임을 JWKS 오프라인 검증 또는 `/oauth/verify` 응답에서 파싱하여 API 접근 제어에 활용합니다.

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
