import http from './http'
import type { ClientStatus } from './enums'

export interface LoginBranding {
  logoUrl?: string
  primaryColor?: string
  bgColor?: string
  title?: string
}

export interface OAuthClient {
  clientId: string
  name: string
  type: 'PUBLIC' | 'CONFIDENTIAL'
  status: ClientStatus
  allowedScopes: string[]
  allowedGrants: string[]
  redirectUris: { uri: string }[]
  branding: LoginBranding | null
  tenantId: string
  createdAt: string
}

export interface CreateClientPayload {
  name: string
  type: 'PUBLIC' | 'CONFIDENTIAL'
  allowedScopes: string[]
  allowedGrants: string[]
  redirectUris: string[]
}

export interface UpdateClientPayload {
  name?: string
  allowedScopes?: string[]
  allowedGrants?: string[]
  redirectUris?: string[]
  branding?: LoginBranding | null
}

export interface ClientCreatedResponse extends OAuthClient {
  plainSecret?: string
}

export const clientsApi = {
  findAll(tenantId: string) {
    return http.get<OAuthClient[]>(`/admin/tenants/${tenantId}/clients`)
  },
  findOne(tenantId: string, clientId: string) {
    return http.get<OAuthClient>(`/admin/tenants/${tenantId}/clients/${clientId}`)
  },
  create(tenantId: string, payload: CreateClientPayload) {
    return http.post<ClientCreatedResponse>(`/admin/tenants/${tenantId}/clients`, payload)
  },
  update(tenantId: string, clientId: string, payload: UpdateClientPayload) {
    return http.patch<OAuthClient>(`/admin/tenants/${tenantId}/clients/${clientId}`, payload)
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
