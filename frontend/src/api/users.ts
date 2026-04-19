import http from './http'
import { type UserStatus } from './enums'

export interface UserProfile {
  id: string
  userId: string
  tenantId: string
  schemaVersionId: string | null
  profileJsonb: Record<string, unknown>
  updatedAt: string
}

export interface UserRoleSummary {
  id: string
  name: string
  displayName: string
}

export interface UserRoleEntry {
  userId: string
  roleId: string
  role: UserRoleSummary
}

export interface User {
  id: string
  tenantId: string
  email: string
  loginId: string | null
  status: UserStatus
  failedLoginAttempts: number
  lastLoginAt: string | null
  createdAt: string
  profile?: UserProfile
  userRoles?: UserRoleEntry[]
}

export interface CreateUserPayload {
  email: string
  password: string
  profile?: Record<string, unknown>
}

export interface UpdateUserPayload {
  loginId?: string | null
  status?: UserStatus
  profile?: Record<string, unknown>
}

export interface UserListQuery {
  page?: number
  limit?: number
  search?: string
  status?: UserStatus
}

export interface UserPage {
  items: User[]
  total: number
  page: number
  limit: number
}

export const usersApi = {
  findAll(tenantId: string, query?: UserListQuery) {
    return http.get<UserPage>(`/admin/tenants/${tenantId}/users`, { params: query })
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
