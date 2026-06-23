# 시스템 클라이언트의 Authori Client Credentials (M2M) 연동 가이드

> 이 가이드는 **최종 사용자와 무관하게 동작하는 시스템 클라이언트**(배치 작업, 서버 간 API 호출 등)가 Authori를 `client_credentials` grant로 연동할 때 필요한 사항을 설명합니다.

마지막 업데이트: 2026-06-23

---

## 연동 방식 개요

**Client Credentials(M2M, Machine-to-Machine) 패턴**에서는 사용자 로그인 과정이 전혀 없습니다. 클라이언트가 **자기 자신의 권한**으로 토큰을 발급받아 보호된 리소스를 호출합니다.

```text
시스템 클라이언트 (서버)                 Authori
        |                                  |
        |-- (1) POST /token -------------> |
        |   grant_type=client_credentials  |
        |   (Basic Auth: client_id:secret) |
        |<-- { access_token, expires_in } -|
        |                                  |
        |-- (2) 보호된 API 호출 ----------> |
        |   Authorization: Bearer {token}  |
        |<-- 응답 -------------------------|
        |                                  |
        |   [만료되면 (1)부터 재발급]        |
```

**핵심 특징**:

- 사용자(email/password)가 등장하지 않습니다. 인가(authorize) 단계 자체가 없습니다.
- `code`, `code_verifier`(PKCE), `redirect_uri`가 필요 없습니다.
- 발급된 `access_token`의 주체(`sub`)는 **사용자가 아니라 클라이언트 자신**입니다.
- `refresh_token`과 `id_token`은 발급되지 않습니다. 만료되면 동일한 요청으로 새로 발급받습니다.
- `client_secret`은 클라이언트 서버만 보관합니다. 외부에 노출되지 않아야 합니다.

> 사용자를 로그인시키는 것이 목적이라면 이 문서가 아니라 `2026-06-02-mobile-bff-confidential-client-integration.md`(또는 web-app/spa/mobile 가이드)를 참조하세요. 그 경우 email/password와 `code`가 필요합니다.

---

## 클라이언트 등록 요건

Authori 관리자 콘솔에서 M2M 클라이언트를 등록할 때 아래 조건을 설정합니다. 사용자 로그인 클라이언트와 **반드시 분리**하여 발급하세요.

| 항목 | 값 | 설명 |
| ------ | ---- | ------ |
| Client 유형 | `CONFIDENTIAL` | 서버가 secret 보관 |
| 인증 방식 | `client_secret_basic` (또는 `client_secret_post`) | token 엔드포인트 인증 |
| 허용 grant type | **`client_credentials`** | 사용자 로그인 클라이언트와 달리 `authorization_code`/`refresh_token`이 아님 |
| `redirect_uri` | 불필요 | client_credentials는 리다이렉트가 없음 |
| PKCE | 불필요 | 인가 코드 단계가 없음 |
| 허용 scope | M2M 전용 scope | 사용자 scope(`openid`/`email`/`profile`)와 분리 권장. 5절 참조 |

> **중요**: discovery 문서(`grant_types_supported`)에 `client_credentials`가 광고되어 있어도, 실제 클라이언트에 해당 grant가 허용 설정되어 있지 않으면 토큰 발급이 거부됩니다(`400 unsupported_grant_type`). 등록 시 허용 grant type에 `client_credentials`를 반드시 포함하세요.

---

## 단계별 상세 가이드

### 단계 (1): 시스템 클라이언트 → Authori 토큰 발급

```http
POST {token_endpoint}
Authorization: Basic Base64({client_id}:{client_secret})
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&scope={space로 구분된 M2M scope}
```

`token_endpoint`는 OIDC 디스커버리 문서(`{issuer}/.well-known/openid-configuration`)의 `token_endpoint` 값을 사용합니다. 6절 참조.

> `client_secret_post` 방식을 사용하는 경우 `Authorization` 헤더 대신 body에 `client_id`/`client_secret`를 포함합니다.
>
> ```http
> grant_type=client_credentials
> &client_id={client_id}
> &client_secret={client_secret}
> &scope={...}
> ```

**성공 응답**:

```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "{granted scope}"
}
```

> `refresh_token`, `id_token`은 발급되지 않습니다. client_credentials는 사용자 컨텍스트가 없으므로 OIDC `id_token`이 적용되지 않습니다.

**`access_token` JWT 클레임** (예시):

```json
{
  "sub": "{client_id}",
  "iss": "{issuer}",
  "aud": "{client_id}",
  "exp": 1748880000,
  "iat": 1748876400,
  "jti": "{uuid}",
  "tenant_id": "{tenant_uuid}",
  "client_id": "{client_id}",
  "scope": "{granted scope}"
}
```

`access_token`은 RS256으로 서명됩니다. 리소스 서버는 JWKS 공개키로 직접 검증할 수 있습니다. 사용자 로그인 토큰과 달리 `sub`가 사용자 UUID가 아니라 **클라이언트를 식별**(`client_id`와 동일)한다는 점에 유의하세요.

> 사용자 로그인 토큰에 들어가는 `roles`/`permissions` 클레임은 사용자 컨텍스트가 있을 때만 포함됩니다. **client_credentials 토큰에는 이 두 클레임이 빈 배열이 아니라 아예 생략**됩니다. RBAC 권한 판단이 필요한 M2M이라면 `client_id` 또는 `scope` 기반으로 인가를 설계하세요.

**오류 응답**:

| 상황 | HTTP | message | 처리 방안 |
| ------ | ------ | --------- | --------- |
| client_id/secret 불일치 | `401` | `invalid_client` | 자격증명 확인 |
| 해당 클라이언트에 grant 미허용 | `400` | `unsupported_grant_type` | 콘솔에서 `client_credentials` 허용 설정 |

> **scope 처리 주의**: client_credentials 흐름은 허용되지 않은 scope를 요청해도 **오류를 반환하지 않고 조용히 제외**한 뒤, 클라이언트에 허용된 scope만으로 토큰을 발급합니다. 따라서 응답의 `scope` 필드를 확인해 실제로 부여된 scope를 검증하세요. (`invalid_scope` 거부는 authorization_code 흐름에만 적용됩니다.)

### 단계 (2): 시스템 클라이언트 → 보호된 리소스 호출

```http
GET {protected_api}
Authorization: Bearer {access_token}
```

토큰이 만료되면(`expires_in` 경과) 단계 (1)을 다시 호출해 새 토큰을 발급받습니다. **갱신(refresh)이 아니라 재발급**입니다.

---

## 토큰 관리 전략

- **캐싱**: `access_token`을 만료 시각(`expires_in`) 직전까지 메모리/캐시에 보관하여 재사용하세요. 매 호출마다 토큰을 발급받으면 불필요한 부하가 발생합니다.
- **선제 갱신**: 만료 직전(예: 만료 60초 전)에 미리 재발급하여 호출 실패를 방지하세요.
- **동시성**: 만료 시점에 여러 워커가 동시에 토큰을 재발급하지 않도록 락/단일 비행(single-flight) 처리를 권장합니다.
- **secret 보관**: `client_secret`은 환경변수/시크릿 매니저에 보관하고 코드/로그에 노출하지 마세요.

---

## 스코프 등록

M2M에 필요한 스코프는 Authori 관리자 콘솔에서 해당 클라이언트의 **허용 scope(`allowedScopes`)** 로 등록되어 있어야 합니다. client_credentials 흐름은 요청 scope 중 허용 목록에 없는 값을 **오류 없이 제외**하므로(에러를 반환하지 않음), 콘솔에서 필요한 scope를 빠짐없이 허용해 두고 발급 응답의 `scope` 필드로 실제 부여 결과를 확인하세요.

- 사용자 로그인용 scope(`openid`, `email`, `profile`)와 **분리된 M2M 전용 scope**를 정의하는 것을 권장합니다. (예: `service:read`, `service:write` 등 — 실제 명칭은 콘솔 정책에 따름)
- `openid`는 OIDC 사용자 인증용 scope이므로 client_credentials에서는 의미가 없습니다(요청해도 `id_token`이 발급되지 않음).

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

클라이언트 시작 시 아래 URL을 자동 조회하면 `token_endpoint`를 하드코딩 없이 구성할 수 있습니다.

```http
GET {issuer}/.well-known/openid-configuration
```

**응답에서 사용하는 필드**:

```json
{
  "issuer": "{issuer}",
  "token_endpoint": "{issuer}/oauth/token",
  "jwks_uri": "{issuer}/.well-known/jwks.json",
  "grant_types_supported": ["authorization_code", "refresh_token", "client_credentials"],
  "token_endpoint_auth_methods_supported": ["client_secret_basic", "client_secret_post"]
}
```

`grant_types_supported`에 `client_credentials`가 포함되어 있어야 합니다(서버 지원 여부). 단, 서버가 지원하더라도 **개별 클라이언트에 grant가 허용 설정**되어 있어야 실제 발급이 가능합니다(2절 참조).

**issuer 형식**: Authori의 issuer는 테넌트 슬러그를 포함합니다.

```text
{JWT_ISSUER}/t/{tenant-slug}
예: https://auth.example.com/api/t/my-service
```

> 모든 엔드포인트가 `/t/{tenant-slug}/` prefix를 포함하므로, 반드시 discovery 문서에서 URL을 가져와 사용하세요. 표준 경로(`/oauth/token`)와 다릅니다.

---

## 사용자 로그인 플로우와의 비교 요약

| 항목 | authorization_code (사용자) | **client_credentials (M2M)** |
| ------ | --------------------------- | ---------------------------- |
| email/password | 필요 | **불필요** |
| `GET`/`POST /authorize` | 필요 | **불필요** |
| `code` / `code_verifier`(PKCE) | 필요 | **불필요** |
| `redirect_uri` | 필요 | **불필요** |
| `refresh_token` | 발급됨 | **발급 안 됨** (만료 시 재발급) |
| `id_token` / userinfo | 있음 | **없음** |
| 토큰 주체(`sub`) | 사용자 UUID | **클라이언트 식별자** |
| 클라이언트 인증 | `client_secret_basic`/`post` | `client_secret_basic`/`post` (동일) |

---

> **검증 필요 항목**: 본 가이드는 OAuth2 RFC 6749 §4.4 및 Authori discovery 문서의 `client_credentials` 지원 표기를 근거로 작성되었습니다. `access_token` 클레임 구조(특히 `sub` 값), M2M 전용 scope 명명 규칙, 오류 메시지 문자열은 Authori 서버 측 실제 구현/콘솔 설정에 따라 다를 수 있으므로, 연동 전 관리자 콘솔에서 M2M 클라이언트를 발급해 실제 응답으로 확인하시기 바랍니다.
