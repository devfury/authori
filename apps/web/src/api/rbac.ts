import http from './http'

export interface Role {
  id: string
  tenantId: string
  name: string
  displayName: string
  description: string | null
  isDefault: boolean
  createdAt: string
}

export interface Permission {
  id: string
  tenantId: string
  name: string
  displayName: string
  description: string | null
  createdAt: string
}

export interface CreateRolePayload {
  name: string
  displayName: string
  description?: string
  isDefault?: boolean
}

export interface UpdateRolePayload {
  displayName?: string
  description?: string
  isDefault?: boolean
}

export interface CreatePermissionPayload {
  name: string
  displayName: string
  description?: string
}

export interface UpdatePermissionPayload {
  displayName?: string
  description?: string
}

export const rbacApi = {
  // Roles
  findRoles(tenantId: string) {
    return http.get<Role[]>(`/admin/tenants/${tenantId}/roles`)
  },
  createRole(tenantId: string, payload: CreateRolePayload) {
    return http.post<Role>(`/admin/tenants/${tenantId}/roles`, payload)
  },
  updateRole(tenantId: string, roleId: string, payload: UpdateRolePayload) {
    return http.patch<Role>(`/admin/tenants/${tenantId}/roles/${roleId}`, payload)
  },
  deleteRole(tenantId: string, roleId: string) {
    return http.delete(`/admin/tenants/${tenantId}/roles/${roleId}`)
  },

  // Permissions
  findPermissions(tenantId: string) {
    return http.get<Permission[]>(`/admin/tenants/${tenantId}/permissions`)
  },
  createPermission(tenantId: string, payload: CreatePermissionPayload) {
    return http.post<Permission>(`/admin/tenants/${tenantId}/permissions`, payload)
  },
  updatePermission(tenantId: string, permissionId: string, payload: UpdatePermissionPayload) {
    return http.patch<Permission>(`/admin/tenants/${tenantId}/permissions/${permissionId}`, payload)
  },
  deletePermission(tenantId: string, permissionId: string) {
    return http.delete(`/admin/tenants/${tenantId}/permissions/${permissionId}`)
  },

  // Role-Permission mapping
  getRolePermissions(tenantId: string, roleId: string) {
    return http.get<Permission[]>(`/admin/tenants/${tenantId}/roles/${roleId}/permissions`)
  },
  setRolePermissions(tenantId: string, roleId: string, permissionIds: string[]) {
    return http.put(`/admin/tenants/${tenantId}/roles/${roleId}/permissions`, { permissionIds })
  },

  // User-Role assignment
  getUserRoles(tenantId: string, userId: string) {
    return http.get<Role[]>(`/admin/tenants/${tenantId}/users/${userId}/roles`)
  },
  setUserRoles(tenantId: string, userId: string, roleIds: string[]) {
    return http.put(`/admin/tenants/${tenantId}/users/${userId}/roles`, { roleIds })
  },
}
