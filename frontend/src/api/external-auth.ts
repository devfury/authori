import http from './http'

export interface FieldMapping {
  email?: string
  name?: string
  loginId?: string
  profile?: Record<string, string>
}

export interface ExternalAuthProvider {
  id: string
  tenantId: string
  clientId: string | null
  enabled: boolean
  providerUrl: string
  credentialHeader: string | null
  credentialValue: string | null
  jitProvision: boolean
  syncOnLogin: boolean
  fieldMapping: FieldMapping | null
  createdAt: string
  updatedAt: string
}

export interface CreateProviderPayload {
  clientId?: string | null
  enabled?: boolean
  providerUrl: string
  credentialHeader?: string | null
  credentialValue?: string | null
  jitProvision?: boolean
  syncOnLogin?: boolean
  fieldMapping?: FieldMapping | null
}

export type UpdateProviderPayload = Partial<CreateProviderPayload>

export const externalAuthApi = {
  findAll(tenantId: string) {
    return http.get<ExternalAuthProvider[]>(`/admin/tenants/${tenantId}/external-auth`)
  },
  findOne(tenantId: string, id: string) {
    return http.get<ExternalAuthProvider>(`/admin/tenants/${tenantId}/external-auth/${id}`)
  },
  create(tenantId: string, payload: CreateProviderPayload) {
    return http.post<ExternalAuthProvider>(`/admin/tenants/${tenantId}/external-auth`, payload)
  },
  update(tenantId: string, id: string, payload: UpdateProviderPayload) {
    return http.patch<ExternalAuthProvider>(`/admin/tenants/${tenantId}/external-auth/${id}`, payload)
  },
  remove(tenantId: string, id: string) {
    return http.delete(`/admin/tenants/${tenantId}/external-auth/${id}`)
  },
}
