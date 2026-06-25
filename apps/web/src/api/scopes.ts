import http from './http'

export interface TenantScope {
  id: string
  tenantId: string
  name: string
  displayName: string
  description: string | null
  isDefault: boolean
  createdAt: string
}

export interface CreateScopePayload {
  name: string
  displayName: string
  description?: string
  isDefault?: boolean
}

export interface UpdateScopePayload {
  displayName?: string
  description?: string
  isDefault?: boolean
}

export const scopesApi = {
  findAll(tenantId: string) {
    return http.get<TenantScope[]>(`/admin/tenants/${tenantId}/scopes`)
  },
  create(tenantId: string, payload: CreateScopePayload) {
    return http.post<TenantScope>(`/admin/tenants/${tenantId}/scopes`, payload)
  },
  update(tenantId: string, scopeId: string, payload: UpdateScopePayload) {
    return http.patch<TenantScope>(`/admin/tenants/${tenantId}/scopes/${scopeId}`, payload)
  },
  delete(tenantId: string, scopeId: string) {
    return http.delete(`/admin/tenants/${tenantId}/scopes/${scopeId}`)
  },
}
