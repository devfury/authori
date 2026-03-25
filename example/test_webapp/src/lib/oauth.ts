const textEncoder = new TextEncoder()

export type OAuthConfig = {
  authServerBaseUrl: string
  clientId: string
  redirectUri: string
  scope: string
  tenantSlug: string
}

export type TokenResponse = {
  access_token: string
  refresh_token?: string
  token_type: string
  expires_in?: number
  scope?: string
  id_token?: string
}

export type StoredOAuthState = {
  state: string
  codeVerifier: string
  createdAt: number
  config: OAuthConfig
}

export type AuthorizeInitiationResponse = {
  requestId: string
  client: {
    name: string
    clientId: string
  }
  requestedScopes: string[]
  tenantSlug: string
}

export type LoginAuthorizeResponse = {
  url: string
}

const STORAGE_KEY = 'authori-test-webapp-oauth-state'

function readStringField(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key]
  return typeof value === 'string' ? value : null
}

function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function randomString(length = 64): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function createPkcePair() {
  const codeVerifier = randomString(48)
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(codeVerifier))
  const codeChallenge = toBase64Url(digest)

  return { codeVerifier, codeChallenge }
}

export function createState(): string {
  return randomString(24)
}

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

export function buildAuthorizeUrl(config: OAuthConfig, state: string, codeChallenge: string) {
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

export async function initiateAuthorizeRequest(config: OAuthConfig, state: string, codeChallenge: string) {
  const authorizeUrl = buildAuthorizeUrl(config, state, codeChallenge)
  const response = await fetch(authorizeUrl)
  const payload = (await response.json()) as AuthorizeInitiationResponse | Record<string, unknown>

  if (!response.ok) {
    const errorPayload = payload as Record<string, unknown>
    const message = readStringField(errorPayload, 'message') ?? readStringField(errorPayload, 'error')
    throw new Error(message ?? '인가 요청 준비에 실패했습니다.')
  }

  return payload as AuthorizeInitiationResponse
}

export async function submitAuthorizeLogin(
  config: OAuthConfig,
  payload: {
    requestId: string
    email: string
    password: string
    grantedScopes?: string[]
  },
) {
  const authorizeUrl = new URL(`/t/${config.tenantSlug}/oauth/authorize`, config.authServerBaseUrl)
  const response = await fetch(authorizeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const responsePayload = (await response.json()) as LoginAuthorizeResponse | Record<string, unknown>

  if (!response.ok) {
    const errorPayload = responsePayload as Record<string, unknown>
    const message = readStringField(errorPayload, 'message') ?? readStringField(errorPayload, 'error')
    throw new Error(message ?? '로그인 제출에 실패했습니다.')
  }

  return responsePayload as LoginAuthorizeResponse
}

export async function exchangeCodeForToken(config: OAuthConfig, code: string, codeVerifier: string) {
  const tokenUrl = new URL(`/t/${config.tenantSlug}/oauth/token`, config.authServerBaseUrl)
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    code,
    redirect_uri: config.redirectUri,
    code_verifier: codeVerifier,
  })

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  const payload = (await response.json()) as TokenResponse | Record<string, unknown>

  if (!response.ok) {
    const errorPayload = payload as Record<string, unknown>
    throw new Error(readStringField(errorPayload, 'error_description') ?? '토큰 교환에 실패했습니다.')
  }

  return payload as TokenResponse
}

export async function fetchUserInfo(config: OAuthConfig, accessToken: string) {
  const userInfoUrl = new URL(`/t/${config.tenantSlug}/oauth/userinfo`, config.authServerBaseUrl)
  const response = await fetch(userInfoUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  const payload = (await response.json()) as Record<string, unknown>

  if (!response.ok) {
    throw new Error(typeof payload.message === 'string' ? payload.message : 'userinfo 조회에 실패했습니다.')
  }

  return payload
}
