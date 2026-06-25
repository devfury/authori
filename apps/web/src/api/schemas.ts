import http from './http'
import type { SchemaStatus } from './enums'

export interface ProfileSchemaVersion {
  id: string
  tenantId: string
  version: number
  schemaJsonb: Record<string, unknown>
  status: SchemaStatus
  publishedBy: string | null
  createdAt: string
}

export interface PublishSchemaPayload {
  schemaJsonb: Record<string, unknown>
}

export const schemasApi = {
  findAll(tenantId: string) {
    return http.get<ProfileSchemaVersion[]>(`/admin/tenants/${tenantId}/schemas`)
  },
  findActive(tenantId: string) {
    return http.get<ProfileSchemaVersion | null>(`/admin/tenants/${tenantId}/schemas/active`)
  },
  publish(tenantId: string, payload: PublishSchemaPayload) {
    return http.post<ProfileSchemaVersion>(`/admin/tenants/${tenantId}/schemas`, payload)
  },
}
