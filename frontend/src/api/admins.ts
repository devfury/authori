import http from './http'
import { type AdminRole, type AdminStatus } from './enums'

export interface AdminUser {
  id: string
  email: string
  role: AdminRole
  tenantId: string | null
  status: AdminStatus
  createdAt: string
}

export interface CreateAdminPayload {
  email: string
  password: string
  role: AdminRole
  tenantId?: string
}

export const adminsApi = {
  findAll() {
    return http.get<AdminUser[]>('/admin/auth/admins')
  },
  create(payload: CreateAdminPayload) {
    return http.post<AdminUser>('/admin/auth/admins', payload)
  },
  deactivate(id: string) {
    return http.delete(`/admin/auth/admins/${id}`)
  },
}
