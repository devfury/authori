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
}

export const oauthApi = {
  getLoginConfig(tenantSlug: string, clientId?: string) {
    return oauthHttp.get<LoginConfigResponse>(`/t/${tenantSlug}/oauth/login-config`, {
      params: { client_id: clientId },
    })
  },
  register(tenantSlug: string, payload: RegisterPayload) {
    return oauthHttp.post<{ message: string }>(`/t/${tenantSlug}/oauth/register`, payload)
  },
  authorize(tenantSlug: string, payload: {
    requestId: string
    email: string
    password: string
    grantedScopes: string[]
  }) {
    return oauthHttp.post<{ url: string }>(`/t/${tenantSlug}/oauth/authorize`, payload)
  }
}
