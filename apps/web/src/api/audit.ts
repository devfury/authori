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

export interface AuditLogQuery {
  page?: number
  limit?: number
  action?: string
  success?: boolean
  actorType?: string
  from?: string // 'YYYY-MM-DD'
  to?: string // 'YYYY-MM-DD'
}

export interface AuditLogPage {
  items: AuditLog[]
  total: number
  page: number
  limit: number
}

export const auditApi = {
  findAll(tenantId: string, query?: AuditLogQuery) {
    return http.get<AuditLogPage>(`/admin/tenants/${tenantId}/audit`, { params: query })
  },
}
