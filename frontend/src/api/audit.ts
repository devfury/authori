import http from './http'

export interface AuditLog {
  id: string
  tenantId: string | null
  actorId: string | null
  actorType: string | null
  action: string
  targetType: string | null
  targetId: string | null
  success: boolean
  metadata: Record<string, unknown> | null
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
}

export const auditApi = {
  findAll(tenantId: string, params?: { limit?: number; offset?: number }) {
    return http.get<AuditLog[]>(`/admin/tenants/${tenantId}/audit`, { params })
  },
}
