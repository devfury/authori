export const TenantStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  SUSPENDED: 'SUSPENDED',
} as const
export type TenantStatus = (typeof TenantStatus)[keyof typeof TenantStatus]

export const AdminRole = {
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
  TENANT_ADMIN: 'TENANT_ADMIN',
} as const
export type AdminRole = (typeof AdminRole)[keyof typeof AdminRole]

export const AdminStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const
export type AdminStatus = (typeof AdminStatus)[keyof typeof AdminStatus]

export const ClientStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const
export type ClientStatus = (typeof ClientStatus)[keyof typeof ClientStatus]

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  LOCKED: 'LOCKED',
} as const
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus]

export const SchemaStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  DEPRECATED: 'DEPRECATED',
} as const
export type SchemaStatus = (typeof SchemaStatus)[keyof typeof SchemaStatus]
