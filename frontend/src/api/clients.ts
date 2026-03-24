import http from './http'
import type { ClientStatus } from './enums'

export interface OAuthClient {
  clientId: string
  name: string
  type: 'public' | 'confidential'
  status: ClientStatus
  allowedScopes: string[]
  allowedGrants: string[]
  tenantId: string
  createdAt: string
}

export interface CreateClientPayload {
  name: string
  type: 'public' | 'confidential'
  allowedScopes: string[]
  allowedGrants: string[]
  redirectUris: string[]
}

export interface ClientCreatedResponse extends OAuthClient {
  plainSecret?: string
}

export const clientsApi = {
  findAll(tenantId: string) {
    return http.get<OAuthClient[]>(`/admin/tenants/${tenantId}/clients`)
  },
  create(tenantId: string, payload: CreateClientPayload) {
    return http.post<ClientCreatedResponse>(`/admin/tenants/${tenantId}/clients`, payload)
  },
  rotateSecret(tenantId: string, clientId: string) {
    return http.post<{ plainSecret: string }>(
      `/admin/tenants/${tenantId}/clients/${clientId}/rotate-secret`,
    )
  },
  deactivate(tenantId: string, clientId: string) {
    return http.delete(`/admin/tenants/${tenantId}/clients/${clientId}`)
  },
}
