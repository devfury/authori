# Authori 연동 가이드

이 문서는 **Authori를 OAuth2/OIDC 인증 서버로 사용하는 새 서비스**를 개발할 때 필요한 모든 연동 정보를 다룬다.

대상 독자: Authori와 다른 별개의 서비스를 개발하는 개발자.  
아키텍처: Authori(인증 서버) ↔ 새 서비스(리소스 서버 + 클라이언트).

---

## 목차

1. [Authori OAuth2 엔드포인트 전체 목록](#1-authori-oauth2-엔드포인트-전체-목록)
2. [사전 준비 — OAuth 클라이언트 등록](#2-사전-준비--oauth-클라이언트-등록)
3. [플로우 1: Authorization Code + PKCE (Vue 3 SPA)](#3-플로우-1-authorization-code--pkce-vue-3-spa)
4. [플로우 2: Authorization Code (NestJS 서버사이드 / BFF)](#4-플로우-2-authorization-code-nestjs-서버사이드--bff)
5. [플로우 3: Client Credentials (M2M 서버 간 호출)](#5-플로우-3-client-credentials-m2m-서버-간-호출)
6. [새 서비스 백엔드 JWT 검증 (NestJS)](#6-새-서비스-백엔드-jwt-검증-nestjs)
7. [UserInfo 엔드포인트](#7-userinfo-엔드포인트)
8. [Refresh Token 갱신](#8-refresh-token-갱신)
9. [토큰 폐기 (Revoke)](#9-토큰-폐기-revoke)
10. [오류 코드 레퍼런스](#10-오류-코드-레퍼런스)
11. [환경변수 체크리스트](#11-환경변수-체크리스트)

---

## 1. Authori OAuth2 엔드포인트 전체 목록

모든 OAuth 엔드포인트는 `/t/:tenantSlug/` 경로 접두사를 가진다.

```
BASE_URL = https://auth.example.com   (Authori 서버 주소)
SLUG     = my-tenant                  (테넌트 슬러그)
```

| 엔드포인트 | 메서드 | 경로 | 설명 |
|---|---|---|---|
| Authorization | `GET` | `/t/:slug/oauth/authorize` | 인가 요청 시작 (브라우저 리다이렉트) |
| Login + Code 발급 | `POST` | `/t/:slug/oauth/authorize` | 자격증명 제출 → auth code |
| Token 발급 | `POST` | `/t/:slug/oauth/token` | access/refresh 토큰 발급 |
| Token 폐기 | `POST` | `/t/:slug/oauth/revoke` | RFC 7009 토큰 폐기 |
| UserInfo | `GET` | `/t/:slug/oauth/userinfo` | Bearer 토큰으로 사용자 정보 조회 |
| Login 브랜딩 | `GET` | `/t/:slug/oauth/login-config` | 로그인 화면 브랜딩 설정 조회 |
| Discovery | `GET` | `/t/:slug/.well-known/openid-configuration` | OIDC Discovery 문서 |
| JWKS | `GET` | `/t/:slug/.well-known/jwks.json` | RS256 공개키 목록 |

### OIDC Discovery 응답 예시

```json
{
  "issuer": "https://auth.example.com/t/my-tenant",
  "authorization_endpoint": "https://auth.example.com/t/my-tenant/oauth/authorize",
  "token_endpoint": "https://auth.example.com/t/my-tenant/oauth/token",
  "revocation_endpoint": "https://auth.example.com/t/my-tenant/oauth/revoke",
  "userinfo_endpoint": "https://auth.example.com/t/my-tenant/oauth/userinfo",
  "jwks_uri": "https://auth.example.com/t/my-tenant/.well-known/jwks.json",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token", "client_credentials"],
  "id_token_signing_alg_values_supported": ["RS256"],
  "scopes_supported": ["openid", "profile", "email"],
  "token_endpoint_auth_methods_supported": ["client_secret_basic", "client_secret_post"],
  "code_challenge_methods_supported": ["S256", "plain"]
}
```

---

## 2. 사전 준비 — OAuth 클라이언트 등록

### 2-1. 등록 방법

Authori 관리자 화면: **`/admin/tenants/:tenantId/clients/new`**

### 2-2. 클라이언트 타입 선택

| 새 서비스 유형 | 타입 | Grant | client_secret |
|---|---|---|---|
| Vue/React SPA (브라우저) | `PUBLIC` | `authorization_code` + PKCE | 없음 |
| NestJS BFF / 서버사이드 앱 | `CONFIDENTIAL` | `authorization_code` | 필요 |
| 서버 간 M2M | `CONFIDENTIAL` | `client_credentials` | 필요 |

### 2-3. 등록 항목

- **이름**: 식별용 표시 이름 (예: `MyService Frontend`)
- **타입**: `PUBLIC` 또는 `CONFIDENTIAL`
- **Redirect URIs**: 인가 코드를 받을 URI. 공백 없이 정확히 일치해야 함
  - 개발: `http://localhost:5174/callback`
  - 운영: `https://myservice.example.com/callback`
- **Allowed Scopes**: `openid`, `profile`, `email` 중 필요한 것만 선택
- **Allowed Grants**: 사용할 grant type 선택

### 2-4. 생성 결과 처리

- `clientId`: UUID. 공개 가능. 환경변수에 저장.
- `clientSecret`: **최초 1회만 평문 노출**. 즉시 복사하여 환경변수(`.env`)에 저장.  
  이후 재조회 불가 — 분실 시 Authori 관리자 화면에서 **Secret Rotate** 필요.

---

## 3. 플로우 1: Authorization Code + PKCE (Vue 3 SPA)

PUBLIC 클라이언트(SPA)가 브라우저 사용자를 Authori로 로그인시키는 표준 플로우.

### 3-1. 전체 흐름

```
SPA                         Authori
 │                              │
 │  1. PKCE 페어 생성            │
 │  2. state 생성, sessionStorage│
 │  3. redirect → GET /authorize │──→ 요청 검증 후 로그인 페이지로 redirect
 │                              │    (LOGIN_PAGE_URL?requestId=...&tenantSlug=...)
 │
 │  [사용자: 로그인 페이지에서 자격증명 입력]
 │
 │  4. POST /authorize(requestId, email, password)
 │                              │──→ auth code + redirect_uri 반환
 │  5. { url } 받아 window.location.href = url
 │
 │  6. [callback URL: ?code=...&state=...]
 │  7. state 검증
 │  8. POST /token(code, code_verifier)
 │                              │──→ { access_token, refresh_token, ... }
 │  9. 토큰 저장 (localStorage / memory)
```

### 3-2. 재사용 가능한 `oauth.ts` 헬퍼

아래 코드를 `src/lib/oauth.ts`로 저장하면 SPA에서 바로 사용할 수 있다.  
(`example/vite-testapp/src/lib/oauth.ts` 기반)

```typescript
// src/lib/oauth.ts

const textEncoder = new TextEncoder()

export type OAuthConfig = {
  authServerBaseUrl: string  // Authori 서버 주소 (예: https://auth.example.com)
  clientId: string           // 등록된 clientId
  redirectUri: string        // 이 SPA의 callback URI
  scope: string              // 요청 스코프 (예: 'openid profile email')
  tenantSlug: string         // 테넌트 슬러그
}

export type TokenResponse = {
  access_token: string
  refresh_token?: string
  token_type: string
  expires_in?: number
  scope?: string
}

export type StoredOAuthState = {
  state: string
  codeVerifier: string
  createdAt: number
  config: OAuthConfig
}

// GET /authorize 응답 (Accept: application/json 시)
export type AuthorizeInitiationResponse = {
  requestId: string
  client: { name: string; clientId: string }
  requestedScopes: string[]
  tenantSlug: string
}

const STORAGE_KEY = 'oauth-state'

// ── PKCE ────────────────────────────────────────────────────────────────────

function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  bytes.forEach((b) => { binary += String.fromCharCode(b) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function randomHex(length = 64): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** PKCE code_verifier + code_challenge(S256) 페어 생성 */
export async function createPkcePair() {
  const codeVerifier = randomHex(48)
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(codeVerifier))
  const codeChallenge = toBase64Url(digest)
  return { codeVerifier, codeChallenge }
}

/** CSRF 방지용 state 값 생성 */
export function createState(): string {
  return randomHex(24)
}

// ── State 저장/복원 (sessionStorage) ────────────────────────────────────────

export function persistOAuthState(payload: StoredOAuthState) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

export function readOAuthState(): StoredOAuthState | null {
  const raw = sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredOAuthState
  } catch {
    sessionStorage.removeItem(STORAGE_KEY)
    return null
  }
}

export function clearOAuthState() {
  sessionStorage.removeItem(STORAGE_KEY)
}

// ── URL 빌더 ─────────────────────────────────────────────────────────────────

/** Authorization endpoint URL 생성 (브라우저 리다이렉트용) */
export function buildAuthorizeUrl(config: OAuthConfig, state: string, codeChallenge: string): string {
  const url = new URL(`/t/${config.tenantSlug}/oauth/authorize`, config.authServerBaseUrl)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('scope', config.scope)
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

// ── API 호출 ─────────────────────────────────────────────────────────────────

/**
 * GET /authorize (Accept: application/json)
 * 브라우저 리다이렉트 없이 requestId를 먼저 받는 방식 (프로그래매틱 로그인용).
 * 일반 redirect 방식보다 복잡하므로 SPA에서는 buildAuthorizeUrl + redirect를 권장.
 */
export async function initiateAuthorizeRequest(
  config: OAuthConfig,
  state: string,
  codeChallenge: string,
): Promise<AuthorizeInitiationResponse> {
  const url = buildAuthorizeUrl(config, state, codeChallenge)
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  const body = await res.json() as Record<string, unknown>
  if (!res.ok) {
    throw new Error((body.message as string) ?? (body.error as string) ?? '인가 요청 준비 실패')
  }
  return body as AuthorizeInitiationResponse
}

/**
 * POST /authorize — 자격증명 제출 → { url } (redirect_uri + code + state)
 */
export async function submitAuthorizeLogin(
  config: OAuthConfig,
  payload: {
    requestId: string
    email: string
    password: string
    grantedScopes?: string[]
  },
): Promise<{ url: string }> {
  const url = new URL(`/t/${config.tenantSlug}/oauth/authorize`, config.authServerBaseUrl)
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await res.json() as Record<string, unknown>
  if (!res.ok) {
    throw new Error((body.message as string) ?? (body.error as string) ?? '로그인 제출 실패')
  }
  return body as { url: string }
}

/**
 * POST /token (authorization_code grant)
 * 인가 코드를 access_token + refresh_token으로 교환
 */
export async function exchangeCodeForToken(
  config: OAuthConfig,
  code: string,
  codeVerifier: string,
): Promise<TokenResponse> {
  const url = new URL(`/t/${config.tenantSlug}/oauth/token`, config.authServerBaseUrl)
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    code,
    redirect_uri: config.redirectUri,
    code_verifier: codeVerifier,
  })
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const payload = await res.json() as Record<string, unknown>
  if (!res.ok) {
    throw new Error((payload.error_description as string) ?? '토큰 교환 실패')
  }
  return payload as TokenResponse
}

/**
 * POST /token (refresh_token grant)
 */
export async function refreshAccessToken(
  config: OAuthConfig,
  refreshToken: string,
): Promise<TokenResponse> {
  const url = new URL(`/t/${config.tenantSlug}/oauth/token`, config.authServerBaseUrl)
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.clientId,
    refresh_token: refreshToken,
  })
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const payload = await res.json() as Record<string, unknown>
  if (!res.ok) {
    throw new Error((payload.error_description as string) ?? '토큰 갱신 실패')
  }
  return payload as TokenResponse
}

/**
 * GET /oauth/userinfo — 사용자 프로필 조회
 */
export async function fetchUserInfo(
  config: OAuthConfig,
  accessToken: string,
): Promise<Record<string, unknown>> {
  const url = new URL(`/t/${config.tenantSlug}/oauth/userinfo`, config.authServerBaseUrl)
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const payload = await res.json() as Record<string, unknown>
  if (!res.ok) {
    throw new Error((payload.message as string) ?? 'userinfo 조회 실패')
  }
  return payload
}

/**
 * POST /oauth/revoke — 토큰 폐기 (RFC 7009)
 */
export async function revokeToken(
  config: OAuthConfig,
  token: string,
  tokenTypeHint: 'access_token' | 'refresh_token' = 'refresh_token',
): Promise<void> {
  const url = new URL(`/t/${config.tenantSlug}/oauth/revoke`, config.authServerBaseUrl)
  const body = new URLSearchParams({
    token,
    token_type_hint: tokenTypeHint,
    client_id: config.clientId,
  })
  await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  // RFC 7009: 토큰을 찾지 못해도 200 OK → 오류 처리 불필요
}
```

### 3-3. Vue 3 컴포넌트에서 사용 (로그인 + callback 처리)

```vue
<!-- src/views/LoginView.vue (또는 App.vue) -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  buildAuthorizeUrl,
  createPkcePair,
  createState,
  exchangeCodeForToken,
  clearOAuthState,
  persistOAuthState,
  readOAuthState,
  type TokenResponse,
} from '@/lib/oauth'

const OAUTH_CONFIG = {
  authServerBaseUrl: import.meta.env.VITE_AUTHORI_BASE_URL as string,
  clientId: import.meta.env.VITE_OAUTH_CLIENT_ID as string,
  redirectUri: `${window.location.origin}/callback`,
  scope: 'openid profile email',
  tenantSlug: import.meta.env.VITE_AUTHORI_TENANT_SLUG as string,
}

const tokenResponse = ref<TokenResponse | null>(null)

/** 로그인 버튼 클릭 */
async function login() {
  const { codeVerifier, codeChallenge } = await createPkcePair()
  const state = createState()

  // state + codeVerifier를 sessionStorage에 저장 (callback에서 검증)
  persistOAuthState({
    state,
    codeVerifier,
    createdAt: Date.now(),
    config: OAUTH_CONFIG,
  })

  // Authori 로그인 페이지로 redirect
  window.location.href = buildAuthorizeUrl(OAUTH_CONFIG, state, codeChallenge)
}

/** 페이지 로드 시 callback 처리 */
async function handleCallback() {
  const params = new URL(window.location.href).searchParams
  const code = params.get('code')
  const state = params.get('state')
  if (!code) return

  const stored = readOAuthState()
  if (!stored || stored.state !== state) {
    console.error('state 검증 실패 — CSRF 가능성')
    return
  }

  try {
    const token = await exchangeCodeForToken(stored.config, code, stored.codeVerifier)
    tokenResponse.value = token
    localStorage.setItem('access_token', token.access_token)
    if (token.refresh_token) {
      localStorage.setItem('refresh_token', token.refresh_token)
    }
    clearOAuthState()

    // URL에서 code/state 파라미터 제거
    window.history.replaceState({}, '', window.location.pathname)
  } catch (err) {
    console.error('토큰 교환 실패', err)
  }
}

onMounted(handleCallback)
</script>

<template>
  <div>
    <button v-if="!tokenResponse" @click="login">Authori로 로그인</button>
    <div v-else>로그인 완료 — {{ tokenResponse.scope }}</div>
  </div>
</template>
```

### 3-4. 프론트엔드 환경변수 (`.env`)

```env
VITE_AUTHORI_BASE_URL=https://auth.example.com
VITE_AUTHORI_TENANT_SLUG=my-tenant
VITE_OAUTH_CLIENT_ID=<등록된 clientId>
```

### 3-5. Authori 로그인 페이지 (Authori 측)

Authori는 `Accept: text/html` 요청을 받으면 자체 프론트엔드 `/login?requestId=...` 페이지로 redirect한다.
새 서비스가 **별도의 커스텀 로그인 폼**을 직접 구현하려면 `Accept: application/json`으로 GET /authorize 요청 후 requestId를 받아 POST /authorize를 직접 호출하면 된다 (3-2의 `initiateAuthorizeRequest` + `submitAuthorizeLogin` 패턴).

---

## 4. 플로우 2: Authorization Code (NestJS 서버사이드 / BFF)

CONFIDENTIAL 클라이언트가 서버에서 code를 교환하는 방식.  
SPA + 백엔드 BFF 구조에서 백엔드가 token 교환을 담당하는 패턴.

### 4-1. 전체 흐름

```
브라우저            NestJS BFF              Authori
   │                    │                      │
   │── GET /login ──────→│                      │
   │                    │── redirect ──────────→│ GET /authorize
   │                    │                      │ (state, PKCE 생성은 BFF에서)
   │←────────── redirect (Authori 로그인 페이지) │
   │                    │                      │
   │ [사용자 로그인]      │                      │
   │                    │                      │
   │── GET /callback ───→│                      │
   │  (?code=...&state=...) │                  │
   │                    │── POST /token ───────→│
   │                    │   (code + client_secret)│
   │                    │←── access_token ──────│
   │←── session 쿠키 ───│                      │
```

### 4-2. 토큰 교환 — `client_secret` 전달 방식

CONFIDENTIAL 클라이언트는 토큰 교환 시 `client_secret`을 두 가지 방법 중 하나로 전달한다.

**방법 A: Basic Auth 헤더 (권장)**

```
Authorization: Basic base64(clientId:clientSecret)
```

```typescript
// NestJS BFF에서의 토큰 교환
const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

const response = await fetch(`${authoriBaseUrl}/t/${tenantSlug}/oauth/token`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Authorization': `Basic ${credentials}`,
  },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,  // PKCE를 사용한 경우
  }),
})
```

**방법 B: Request body 포함**

```typescript
const response = await fetch(`${authoriBaseUrl}/t/${tenantSlug}/oauth/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  }),
})
```

---

## 5. 플로우 3: Client Credentials (M2M 서버 간 호출)

사용자 없이 서비스 간 API 호출에 사용. CONFIDENTIAL 클라이언트만 사용 가능.

### 5-1. 토큰 발급

```typescript
// src/auth/authori-client.ts
export async function fetchM2MToken(config: {
  authoriBaseUrl: string
  tenantSlug: string
  clientId: string
  clientSecret: string
  scope?: string
}): Promise<string> {
  const { authoriBaseUrl, tenantSlug, clientId, clientSecret, scope } = config

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const res = await fetch(`${authoriBaseUrl}/t/${tenantSlug}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      ...(scope ? { scope } : {}),
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>
    throw new Error((err.error as string) ?? `Token request failed: ${res.status}`)
  }

  const token = await res.json() as { access_token: string; expires_in: number }
  return token.access_token
}
```

### 5-2. 토큰 캐싱 패턴 (NestJS Injectable)

매 요청마다 토큰을 새로 발급받으면 비효율적이다. 만료 전까지 메모리에서 재사용한다.

```typescript
// src/auth/m2m-token.service.ts
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class M2mTokenService {
  private cachedToken: string | null = null
  private expiresAt = 0

  constructor(private readonly config: ConfigService) {}

  async getToken(): Promise<string> {
    // 만료 60초 전에 갱신
    if (this.cachedToken && Date.now() < this.expiresAt - 60_000) {
      return this.cachedToken
    }

    const authoriBaseUrl = this.config.getOrThrow<string>('AUTHORI_BASE_URL')
    const tenantSlug = this.config.getOrThrow<string>('AUTHORI_TENANT_SLUG')
    const clientId = this.config.getOrThrow<string>('OAUTH_CLIENT_ID')
    const clientSecret = this.config.getOrThrow<string>('OAUTH_CLIENT_SECRET')

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    const res = await fetch(`${authoriBaseUrl}/t/${tenantSlug}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }),
    })

    if (!res.ok) throw new Error(`M2M token request failed: ${res.status}`)

    const data = await res.json() as { access_token: string; expires_in: number }
    this.cachedToken = data.access_token
    this.expiresAt = Date.now() + (data.expires_in ?? 3600) * 1000

    return this.cachedToken
  }
}
```

### 5-3. 다른 서비스 API 호출 시 토큰 첨부

```typescript
const token = await this.m2mTokenService.getToken()

const res = await fetch('https://other-service.example.com/api/resource', {
  headers: { Authorization: `Bearer ${token}` },
})
```

---

## 6. 새 서비스 백엔드 JWT 검증 (NestJS)

Authori가 발급한 access token(RS256 JWT)을 새 서비스 백엔드에서 검증하는 방법.  
공개키를 직접 관리할 필요 없이 **JWKS URI에서 자동 fetch**한다.

### 6-1. 필요 패키지 설치

```bash
bun add passport passport-jwt jwks-rsa @nestjs/passport
bun add -d @types/passport-jwt
```

### 6-2. JWT 페이로드 타입

```typescript
// src/auth/authori-jwt.types.ts
export interface AuthoriJwtPayload {
  sub: string        // 사용자 ID (authorization_code) 또는 clientId (client_credentials)
  tenant_id: string  // 테넌트 ID (UUID)
  client_id: string  // OAuth 클라이언트 ID
  scope: string      // 공백 구분 스코프 목록 (예: 'openid profile email')
  jti: string        // JWT 고유 ID (폐기 확인용)
  iss: string        // Authori issuer (예: 'https://auth.example.com/t/my-tenant')
  aud: string        // clientId
  iat: number        // 발급 시각 (Unix timestamp)
  exp: number        // 만료 시각 (Unix timestamp)
}
```

### 6-3. JwtStrategy 구현

JWKS URI에서 RS256 공개키를 자동으로 가져와 서명을 검증한다.

```typescript
// src/auth/jwt.strategy.ts
import { Injectable } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { passportJwtSecret } from 'jwks-rsa'
import { ConfigService } from '@nestjs/config'
import type { AuthoriJwtPayload } from './authori-jwt.types'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    const authoriBaseUrl = config.getOrThrow<string>('AUTHORI_BASE_URL')
    const tenantSlug = config.getOrThrow<string>('AUTHORI_TENANT_SLUG')

    super({
      // JWKS URI에서 공개키 자동 fetch + 캐싱
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${authoriBaseUrl}/t/${tenantSlug}/.well-known/jwks.json`,
      }),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      issuer: `${authoriBaseUrl}/t/${tenantSlug}`,
      algorithms: ['RS256'],
      // audience 검증이 필요한 경우:
      // audience: config.get('OAUTH_CLIENT_ID'),
    })
  }

  /** 검증 통과 후 req.user에 주입될 값 */
  validate(payload: AuthoriJwtPayload): AuthoriJwtPayload {
    return payload
  }
}
```

### 6-4. JwtAuthGuard

```typescript
// src/auth/jwt-auth.guard.ts
import { Injectable } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

### 6-5. AuthModule

```typescript
// src/auth/auth.module.ts
import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'
import { JwtStrategy } from './jwt.strategy'
import { JwtAuthGuard } from './jwt-auth.guard'

@Module({
  imports: [PassportModule],
  providers: [JwtStrategy, JwtAuthGuard],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
```

`AppModule`에서 import:

```typescript
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    // ...
  ],
})
export class AppModule {}
```

### 6-6. 보호된 라우트에 적용

```typescript
// src/items/items.controller.ts
import { Controller, Get, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import type { AuthoriJwtPayload } from '../auth/authori-jwt.types'

@ApiTags('Items')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/items')
export class ItemsController {
  @Get()
  @ApiOperation({ summary: '아이템 목록 (JWT 필요)' })
  findAll(@Req() req: { user: AuthoriJwtPayload }) {
    const { sub, tenant_id, scope } = req.user

    // scope 검증 예시
    if (!scope.split(' ').includes('openid')) {
      // 필요한 스코프가 없으면 403
    }

    return {
      userId: sub,
      tenantId: tenant_id,
      items: [],
    }
  }
}
```

### 6-7. 스코프 기반 권한 검사 (커스텀 데코레이터 패턴)

특정 스코프가 있어야 접근 가능한 엔드포인트를 만들 때:

```typescript
// src/auth/scopes.decorator.ts
import { SetMetadata } from '@nestjs/common'
export const RequireScopes = (...scopes: string[]) => SetMetadata('scopes', scopes)

// src/auth/scopes.guard.ts
import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { AuthoriJwtPayload } from './authori-jwt.types'

@Injectable()
export class ScopesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.get<string[]>('scopes', context.getHandler()) ?? []
    if (required.length === 0) return true

    const req = context.switchToHttp().getRequest<{ user: AuthoriJwtPayload }>()
    const tokenScopes = req.user?.scope?.split(' ') ?? []

    const hasAll = required.every((s) => tokenScopes.includes(s))
    if (!hasAll) throw new ForbiddenException('insufficient_scope')
    return true
  }
}

// 사용 예:
@Get('profile')
@UseGuards(JwtAuthGuard, ScopesGuard)
@RequireScopes('profile')
getProfile(@Req() req: { user: AuthoriJwtPayload }) {
  return { sub: req.user.sub }
}
```

### 6-8. 환경변수 (백엔드)

```env
AUTHORI_BASE_URL=https://auth.example.com
AUTHORI_TENANT_SLUG=my-tenant
OAUTH_CLIENT_ID=<등록된 clientId>
OAUTH_CLIENT_SECRET=<등록된 clientSecret>   # M2M 또는 CONFIDENTIAL 타입만
```

---

## 7. UserInfo 엔드포인트

Bearer access token으로 사용자 프로필 정보를 조회한다.  
`scope`에 포함된 스코프만큼 클레임이 반환된다.

### 7-1. 요청

```
GET /t/:tenantSlug/oauth/userinfo
Authorization: Bearer <access_token>
```

### 7-2. 응답

```json
// scope: openid profile email 일 때
{
  "sub": "<userId>",
  "email": "user@example.com",
  "profile": {
    "nickname": "홍길동",
    "department": "engineering"
  }
}
```

| 클레임 | 필요 scope |
|---|---|
| `sub` | 항상 포함 |
| `email` | `email` |
| `profile` | `profile` (Authori에 등록된 프로필 스키마 기반 JSONB) |

### 7-3. TypeScript 예시 (프론트엔드)

```typescript
import { fetchUserInfo } from '@/lib/oauth'

const userInfo = await fetchUserInfo(OAUTH_CONFIG, accessToken)
console.log(userInfo.sub, userInfo.email)
```

---

## 8. Refresh Token 갱신

access token 만료 시 refresh token으로 새 토큰 페어를 발급받는다.

### 8-1. 요청

```
POST /t/:tenantSlug/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&client_id=<clientId>
&refresh_token=<refresh_token>
&scope=openid profile   (선택: 기존 스코프의 부분 집합만 가능)
```

CONFIDENTIAL 클라이언트는 `Authorization: Basic ...` 또는 body에 `client_secret` 포함.

### 8-2. 응답

```json
{
  "access_token": "<new_access_token>",
  "refresh_token": "<new_refresh_token>",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "openid profile"
}
```

### 8-3. Rotation 정책

Authori는 **Refresh Token Rotation**을 사용한다:

- 갱신 요청마다 새 refresh token 발급, 기존 refresh token 즉시 폐기
- **이미 폐기된 refresh token을 다시 사용하면 동일 family 전체 폐기** (토큰 탈취 감지)
- 새 refresh token은 즉시 안전한 곳에 저장해야 함 (이전 것은 이미 무효)

### 8-4. 프론트엔드 자동 갱신 패턴 (axios 인터셉터)

```typescript
// src/api/http.ts
import axios from 'axios'
import { refreshAccessToken } from '@/lib/oauth'

const http = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL })

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let isRefreshing = false
let queue: Array<(token: string) => void> = []

http.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error)
    }

    original._retry = true

    if (isRefreshing) {
      return new Promise((resolve) => {
        queue.push((token) => {
          original.headers.Authorization = `Bearer ${token}`
          resolve(http(original))
        })
      })
    }

    isRefreshing = true

    try {
      const refreshToken = localStorage.getItem('refresh_token')
      if (!refreshToken) throw new Error('no refresh token')

      const newTokens = await refreshAccessToken(OAUTH_CONFIG, refreshToken)

      localStorage.setItem('access_token', newTokens.access_token)
      if (newTokens.refresh_token) {
        localStorage.setItem('refresh_token', newTokens.refresh_token)
      }

      queue.forEach((cb) => cb(newTokens.access_token))
      queue = []

      original.headers.Authorization = `Bearer ${newTokens.access_token}`
      return http(original)
    } catch {
      // refresh 실패 → 로그아웃
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      window.location.href = '/login'
      return Promise.reject(error)
    } finally {
      isRefreshing = false
    }
  },
)

export default http
```

---

## 9. 토큰 폐기 (Revoke)

로그아웃 시 서버에 토큰을 폐기 요청한다. RFC 7009 준수.

### 9-1. 요청

```
POST /t/:tenantSlug/oauth/revoke
Content-Type: application/x-www-form-urlencoded

token=<refresh_token_or_access_token>
&token_type_hint=refresh_token   (또는 access_token)
&client_id=<clientId>
```

### 9-2. 응답

- 토큰 폐기 성공 또는 토큰을 찾지 못해도 **항상 200 OK** (RFC 7009 — 정보 노출 방지)

### 9-3. 폐기 동작

- `refresh_token` 폐기: 해당 토큰이 속한 **family 전체** 폐기
- `access_token` 폐기: JWT `jti` 기반으로 해당 토큰만 폐기

### 9-4. 로그아웃 구현 예시

```typescript
async function logout() {
  const refreshToken = localStorage.getItem('refresh_token')
  const accessToken = localStorage.getItem('access_token')

  // refresh token 폐기 (family 전체 폐기)
  if (refreshToken) {
    await revokeToken(OAUTH_CONFIG, refreshToken, 'refresh_token').catch(() => {})
  }

  // 또는 access token 폐기
  if (accessToken) {
    await revokeToken(OAUTH_CONFIG, accessToken, 'access_token').catch(() => {})
  }

  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  window.location.href = '/login'
}
```

---

## 10. 오류 코드 레퍼런스

### 10-1. Authorization 엔드포인트 (`/authorize`)

| HTTP | error | 설명 |
|---|---|---|
| 400 | `invalid_client` | clientId가 없거나 비활성 |
| 400 | `redirect_uri_mismatch` | redirect_uri가 등록된 값과 다름 |
| 400 | `code_challenge_required` | 테넌트 설정에서 PKCE 강제인데 code_challenge 미전달 |
| 400 | `invalid_scope: <scope>` | 허용되지 않은 스코프 요청 |
| 400 | `invalid_request: expired or not found` | requestId 만료 또는 없음 |
| 401 | `invalid_credentials` | 이메일/비밀번호 불일치 |
| 401 | `account_locked` | 로그인 5회 실패로 30분 잠금 |

### 10-2. Token 엔드포인트 (`/token`)

| HTTP | error | 설명 |
|---|---|---|
| 400 | `invalid_grant` | 인가 코드가 없거나 이미 사용됨 |
| 400 | `invalid_grant: code expired` | 인가 코드 10분 만료 |
| 400 | `invalid_grant: redirect_uri mismatch` | redirect_uri 불일치 |
| 400 | `invalid_grant: code_verifier mismatch` | PKCE 검증 실패 |
| 400 | `invalid_grant: token reuse detected` | 폐기된 refresh token 재사용 시도 |
| 400 | `invalid_grant: token expired` | refresh token 만료 |
| 400 | `unsupported_grant_type` | 허용되지 않은 grant type |
| 400 | `client_id required` | client_id 미전달 |
| 401 | `invalid_client` | clientId 없음 또는 secret 불일치 |

### 10-3. UserInfo 엔드포인트 (`/userinfo`)

| HTTP | error | 설명 |
|---|---|---|
| 401 | `Bearer token required` | Authorization 헤더 없음 |
| 401 | `invalid_token` | JWT 서명 검증 실패 또는 만료 |
| 401 | `token_revoked` | 폐기된 토큰 |
| 401 | `user_not_found` | 토큰의 sub에 해당하는 사용자가 없음 |

### 10-4. 오류 응답 형식

```json
{
  "statusCode": 400,
  "message": "invalid_grant: code expired",
  "error": "Bad Request"
}
```

---

## 11. 환경변수 체크리스트

### 11-1. Vue 3 SPA 프론트엔드

```env
# .env (또는 .env.production)
VITE_AUTHORI_BASE_URL=https://auth.example.com
VITE_AUTHORI_TENANT_SLUG=my-tenant
VITE_OAUTH_CLIENT_ID=<PUBLIC 클라이언트 clientId>
```

### 11-2. NestJS 백엔드 (리소스 서버 + JWT 검증)

```env
# .env
AUTHORI_BASE_URL=https://auth.example.com
AUTHORI_TENANT_SLUG=my-tenant
OAUTH_CLIENT_ID=<등록된 clientId>
# CONFIDENTIAL 클라이언트인 경우만
OAUTH_CLIENT_SECRET=<등록된 clientSecret>
```

### 11-3. M2M 백엔드 서비스

```env
AUTHORI_BASE_URL=https://auth.example.com
AUTHORI_TENANT_SLUG=my-tenant
OAUTH_CLIENT_ID=<CONFIDENTIAL 클라이언트 clientId>
OAUTH_CLIENT_SECRET=<CONFIDENTIAL 클라이언트 clientSecret>
```

### 11-4. 연동 전 체크리스트

- [ ] Authori 관리자 화면에서 OAuth 클라이언트 등록 완료
- [ ] clientId 복사 → 환경변수 저장
- [ ] clientSecret 복사 → 환경변수 저장 (CONFIDENTIAL만, 최초 1회만 노출)
- [ ] Redirect URI 등록 (개발 / 운영 환경 각각)
- [ ] Allowed Scopes에 `openid` 포함 여부 확인
- [ ] 테넌트 설정 확인: PKCE 강제(`requirePkce`)가 true인 경우 PUBLIC 클라이언트는 반드시 PKCE 사용
- [ ] 백엔드: `jwks-rsa`, `passport-jwt`, `@nestjs/passport` 설치
- [ ] 백엔드: JwtStrategy의 `jwksUri`, `issuer` 값이 환경변수와 일치하는지 확인

---

## 관련 문서

- `docs/new-service-reference.md` — 새 서비스 전체 아키텍처 및 구현 가이드
- `example/vite-testapp/` — Vue SPA OAuth 플로우 구현 예제 (전체 동작 코드)
- `example/nest-testapp/` — NestJS JWT 검증 및 M2M 토큰 발급 예제
