import axios from 'axios'
import type { LoginBranding } from './clients'

const oauthHttp = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  headers: { 'Content-Type': 'application/json' },
})

export interface LoginConfigResponse {
  clientName: string
  branding: LoginBranding | null
  scopes?: Array<{ name: string; displayName: string; description: string | null }>
  allowRegistration: boolean
  autoActivateRegistration: boolean
  emailVerificationRequired: boolean
  activeSchema?: {
    schemaJsonb: Record<string, any>
  } | null
}

export interface RegisterPayload {
  email: string
  password: string
  profile?: Record<string, any>
  requestId?: string
  clientId?: string
  continueUri?: string
}

export interface UserinfoResponse {
  sub: string
  tenant_id: string
  email?: string
  email_verified?: boolean
  /** 로그인 ID. OIDC 표준 클레임이며 profile scope에서 내려온다. */
  preferred_username?: string
  /** 테넌트 프로필 스키마에 정의된 키들이 최상위로 평탄화되어 들어온다. */
  [claim: string]: unknown
}

export interface UpdateUserinfoPayload {
  loginId?: string
  profile?: Record<string, any>
}

export const oauthApi = {
  getLoginConfig(tenantSlug: string, clientId?: string) {
    return oauthHttp.get<LoginConfigResponse>(`/t/${tenantSlug}/oauth/login-config`, {
      params: { client_id: clientId },
    })
  },
  register(tenantSlug: string, payload: RegisterPayload) {
    return oauthHttp.post<{ message: string; id: string; email: string; emailVerificationRequired: boolean }>(
      `/t/${tenantSlug}/oauth/register`,
      payload,
    )
  },
  verifyEmail(tenantSlug: string, token: string) {
    return oauthHttp.post<{ message: string; email: string; continueUrl?: string }>(
      `/t/${tenantSlug}/oauth/verify-email`,
      { token },
    )
  },
  authorize(tenantSlug: string, payload: {
    requestId: string
    email: string
    password: string
    grantedScopes: string[]
  }) {
    return oauthHttp.post<{ url: string }>(`/t/${tenantSlug}/oauth/authorize`, payload)
  },
  userinfo(tenantSlug: string, token: string) {
    return oauthHttp.get<UserinfoResponse>(`/t/${tenantSlug}/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  },
  updateUserinfo(tenantSlug: string, token: string, payload: UpdateUserinfoPayload) {
    return oauthHttp.patch<UserinfoResponse>(`/t/${tenantSlug}/oauth/userinfo`, payload, {
      headers: { Authorization: `Bearer ${token}` },
    })
  },
  requestPasswordReset(tenantSlug: string, email: string) {
    return oauthHttp.post<{ status: 'sent' | 'mail_delivery_failed' }>(
      `/t/${tenantSlug}/oauth/password-reset/request`,
      { email },
    )
  },
  confirmPasswordReset(tenantSlug: string, token: string, newPassword: string) {
    return oauthHttp.post<{ status: 'reset'; email: string }>(
      `/t/${tenantSlug}/oauth/password-reset/confirm`,
      { token, newPassword },
    )
  },
}
