const textEncoder = new TextEncoder()

const STORAGE_KEY = 'authori-tauri-testapp-settings'
const PKCE_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'

export type OAuthSettings = {
  authServerBaseUrl: string
  tenantSlug: string
  clientId: string
  redirectUri: string
  scope: string
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

export type TokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type: string
}

export const DEFAULT_OAUTH_SETTINGS: OAuthSettings = {
  authServerBaseUrl: 'http://localhost:3000',
  tenantSlug: 'test',
  clientId: '',
  redirectUri: 'http://localhost:1420/callback',
  scope: 'openid profile email',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function randomString(length: number): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(randomBytes, (byte) => PKCE_CHARSET[byte % PKCE_CHARSET.length]).join('')
}

function extractErrorMessage(payload: unknown): string | null {
  if (!isRecord(payload)) return null

  const message = readString(payload.message)
  if (message) return message

  const error = readString(payload.error)
  if (error) return error

  const description = readString(payload.error_description)
  if (description) return description

  return null
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init)
  const text = await response.text()
  const payload = text ? parseJson(text) : null

  if (!response.ok) {
    throw new Error(extractErrorMessage(payload) ?? `${response.status} ${response.statusText}`)
  }

  return (payload ?? {}) as T
}

export function normalizeOAuthSettings(settings: OAuthSettings): OAuthSettings {
  const authServerBaseUrl = settings.authServerBaseUrl.trim().replace(/\/+$/g, '')
  const redirectUri = settings.redirectUri.trim()

  return {
    authServerBaseUrl,
    tenantSlug: settings.tenantSlug.trim() || DEFAULT_OAUTH_SETTINGS.tenantSlug,
    clientId: settings.clientId.trim(),
    redirectUri,
    scope: settings.scope.trim() || DEFAULT_OAUTH_SETTINGS.scope,
  }
}

export function readOAuthSettings(): OAuthSettings {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return { ...DEFAULT_OAUTH_SETTINGS }

  const parsed = parseJson(raw)
  if (!isRecord(parsed)) {
    localStorage.removeItem(STORAGE_KEY)
    return { ...DEFAULT_OAUTH_SETTINGS }
  }

  return normalizeOAuthSettings({
    authServerBaseUrl: readString(parsed.authServerBaseUrl) ?? DEFAULT_OAUTH_SETTINGS.authServerBaseUrl,
    tenantSlug: readString(parsed.tenantSlug) ?? DEFAULT_OAUTH_SETTINGS.tenantSlug,
    clientId: readString(parsed.clientId) ?? DEFAULT_OAUTH_SETTINGS.clientId,
    redirectUri: readString(parsed.redirectUri) ?? DEFAULT_OAUTH_SETTINGS.redirectUri,
    scope: readString(parsed.scope) ?? DEFAULT_OAUTH_SETTINGS.scope,
  })
}

export function persistOAuthSettings(settings: OAuthSettings): OAuthSettings {
  const normalized = normalizeOAuthSettings(settings)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  return normalized
}

export async function createPkcePair() {
  const codeVerifier = randomString(64)
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(codeVerifier))
  const codeChallenge = toBase64Url(new Uint8Array(digest))

  return { codeVerifier, codeChallenge }
}

export function createState() {
  return randomString(32)
}

export function buildOAuthEndpoint(
  settings: OAuthSettings,
  path: 'authorize' | 'token' | 'revoke',
) {
  const normalized = normalizeOAuthSettings(settings)
  return new URL(`/t/${normalized.tenantSlug}/oauth/${path}`, normalized.authServerBaseUrl).toString()
}

export async function initiateAuthorizeRequest(
  settings: OAuthSettings,
  state: string,
  codeChallenge: string,
) {
  const authorizeUrl = new URL(buildOAuthEndpoint(settings, 'authorize'))

  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('client_id', settings.clientId)
  authorizeUrl.searchParams.set('redirect_uri', settings.redirectUri)
  authorizeUrl.searchParams.set('scope', settings.scope)
  authorizeUrl.searchParams.set('state', state)
  authorizeUrl.searchParams.set('code_challenge', codeChallenge)
  authorizeUrl.searchParams.set('code_challenge_method', 'S256')

  return requestJson<AuthorizeInitiationResponse>(authorizeUrl.toString(), {
    headers: {
      Accept: 'application/json',
    },
  })
}

export async function submitAuthorizeLogin(
  settings: OAuthSettings,
  payload: {
    requestId: string
    email: string
    password: string
    grantedScopes: string[]
  },
) {
  return requestJson<LoginAuthorizeResponse>(buildOAuthEndpoint(settings, 'authorize'), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}

export function parseAuthorizeRedirect(url: string) {
  const parsedUrl = new URL(url)

  return {
    code: parsedUrl.searchParams.get('code'),
    state: parsedUrl.searchParams.get('state'),
    error: parsedUrl.searchParams.get('error'),
    errorDescription: parsedUrl.searchParams.get('error_description'),
  }
}

export async function exchangeCodeForToken(
  settings: OAuthSettings,
  code: string,
  codeVerifier: string,
) {
  return requestJson<TokenResponse>(buildOAuthEndpoint(settings, 'token'), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: settings.redirectUri,
      client_id: settings.clientId,
      code_verifier: codeVerifier,
    }),
  })
}

export async function refreshAccessToken(settings: OAuthSettings, refreshToken: string) {
  return requestJson<TokenResponse>(buildOAuthEndpoint(settings, 'token'), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: settings.clientId,
    }),
  })
}

export async function revokeToken(
  settings: OAuthSettings,
  token: string,
  tokenTypeHint?: 'access_token' | 'refresh_token',
) {
  return requestJson<Record<string, unknown>>(buildOAuthEndpoint(settings, 'revoke'), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      token,
      client_id: settings.clientId,
      ...(tokenTypeHint ? { token_type_hint: tokenTypeHint } : {}),
    }),
  })
}

export function decodeJwtPayload(token: string | null | undefined): Record<string, unknown> | null {
  if (!token) return null

  try {
    const base64url = token.split('.')[1]
    if (!base64url) return null

    const base64 = base64url
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(base64url.length + (4 - (base64url.length % 4)) % 4, '=')

    const payload = parseJson(atob(base64))
    return isRecord(payload) ? payload : null
  } catch {
    return null
  }
}
