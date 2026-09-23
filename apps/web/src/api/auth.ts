import http from './http'
import { type AdminRole } from './enums'

export interface LoginPayload {
  email: string
  password: string
}

export interface BootstrapPayload {
  secret: string
  email: string
  password: string
}

/** 관리자에게 배정된 테넌트. 서버가 단일 진실이며 JWT 에는 담기지 않는다. */
export interface AdminTenant {
  id: string
  slug: string
  name: string
}

export interface LoginResponse {
  access_token: string
  /** PLATFORM_ADMIN 은 역할로 전체 접근이므로 빈 배열이다. */
  tenants: AdminTenant[]
}

export interface MeResponse {
  id: string
  email: string
  name: string | null
  role: AdminRole
  tenants: AdminTenant[]
}

export const authApi = {
  login(payload: LoginPayload) {
    return http.post<LoginResponse>('/admin/auth/login', payload)
  },
  me() {
    return http.get<MeResponse>('/admin/auth/me')
  },
  bootstrapStatus() {
    return http.get<{ needed: boolean }>('/admin/auth/bootstrap/status')
  },
  bootstrap(payload: BootstrapPayload) {
    return http.post<{ message: string }>('/admin/auth/bootstrap', payload)
  },
}
