import http from './http'
import { type UserStatus, UserStatus as UserStatusEnum } from './enums'

export interface User {
  id: string
  tenantId: string
  email: string
  name: string | null
  loginId: string | null
  status: UserStatus
  failedLoginAttempts: number
  lastLoginAt: string | null
  createdAt: string
}

export interface CreateUserPayload {
  email: string
  name?: string
  password: string
  profile?: Record<string, unknown>
}

export interface UpdateUserPayload {
  name?: string | null
  loginId?: string | null
  status?: UserStatus
  profile?: Record<string, unknown>
}

export const usersApi = {
  findAll(tenantId: string) {
    return http.get<User[]>(`/admin/tenants/${tenantId}/users`)
  },
  findOne(tenantId: string, userId: string) {
    return http.get<User>(`/admin/tenants/${tenantId}/users/${userId}`)
  },
  create(tenantId: string, payload: CreateUserPayload) {
    return http.post<User>(`/admin/tenants/${tenantId}/users`, payload)
  },
  deactivate(tenantId: string, userId: string) {
    return http.delete(`/admin/tenants/${tenantId}/users/${userId}`)
  },
  update(tenantId: string, userId: string, payload: UpdateUserPayload) {
    return http.patch<User>(`/admin/tenants/${tenantId}/users/${userId}`, payload)
  },
  activate(tenantId: string, userId: string) {
    return http.post(`/admin/tenants/${tenantId}/users/${userId}/activate`)
  },
}
