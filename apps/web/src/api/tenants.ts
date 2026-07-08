import http from './http'
import type { TenantStatus } from './enums'
import { TenantStatus as TenantStatusValues } from './enums'

export interface TenantSettings {
  id: string
  tenantId: string
  accessTokenTtl: number
  refreshTokenTtl: number
  requirePkce: boolean
  allowedGrants: string[]
  refreshTokenRotation: boolean
  passwordMinLength: number
  allowRegistration: boolean
  autoActivateRegistration: boolean
  emailVerificationRequired: boolean
  mailFrom: string | null
  mailDevRedirectTo: string | null
  accountDeletionGracePeriodDays: number
}

export interface Tenant {
  id: string
  slug: string
  name: string
  status: TenantStatus
  issuer: string | null
  settings: TenantSettings
  createdAt: string
  /** 개발용 강제 수신자 입력 편집 가능 여부 (서버 NODE_ENV 기준, 단건 조회 응답에만 포함) */
  mailDevRedirectEditable?: boolean
}

export interface CreateTenantPayload {
  slug: string
  name: string
}

export interface UpdateTenantPayload {
  name?: string
  issuer?: string
  status?: TenantStatus
  settings?: {
    accessTokenTtl?: number
    refreshTokenTtl?: number
    requirePkce?: boolean
    allowedGrants?: string[]
    refreshTokenRotation?: boolean
    passwordMinLength?: number
    allowRegistration?: boolean
    autoActivateRegistration?: boolean
    emailVerificationRequired?: boolean
    mailFrom?: string
    mailDevRedirectTo?: string
    accountDeletionGracePeriodDays?: number
  }
}

export interface TenantListQuery {
  page?: number
  limit?: number
  search?: string
  status?: TenantStatus
}

export interface TenantPage {
  items: Tenant[]
  total: number
  page: number
  limit: number
}

export const tenantsApi = {
  findAll(query?: TenantListQuery) {
    return http.get<TenantPage>('/admin/tenants', { params: query })
  },
  findOne(id: string) {
    return http.get<Tenant>(`/admin/tenants/${id}`)
  },
  create(payload: CreateTenantPayload) {
    return http.post<Tenant>('/admin/tenants', payload)
  },
  update(id: string, payload: UpdateTenantPayload) {
    return http.patch<Tenant>(`/admin/tenants/${id}`, payload)
  },
  activate(id: string) {
    return http.patch<Tenant>(`/admin/tenants/${id}`, { status: TenantStatusValues.ACTIVE })
  },
  deactivate(id: string) {
    return http.patch<Tenant>(`/admin/tenants/${id}`, { status: TenantStatusValues.INACTIVE })
  },
  delete(id: string) {
    return http.delete(`/admin/tenants/${id}`)
  },
}
