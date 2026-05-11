import http from './http'

export type SimpleTransform =
  | 'base64'
  | 'base64url'
  | 'md5'
  | 'sha256'
  | 'uppercase'
  | 'lowercase'
  | 'trim'
  | 'email_prefix'
  | 'email_domain'

export type ParameterizedTransform =
  | { type: 'prefix'; value: string }
  | { type: 'suffix'; value: string }
  | { type: 'template'; pattern: string }
  | { type: 'regex_extract'; pattern: string; group?: number }
  | { type: 'substring'; start: number; end?: number }

export type TransformSpec = SimpleTransform | ParameterizedTransform

export interface FieldMapping {
  email?: string
  loginId?: string
  profile?: Record<string, string>
}

export interface RequestMapping {
  email?: string
  password?: string
  tenantId?: string
  clientId?: string
  staticParams?: Record<string, string>
  transforms?: {
    email?: TransformSpec[]
    password?: TransformSpec[]
    tenantId?: TransformSpec[]
    clientId?: TransformSpec[]
  }
}

export interface ExternalAuthProvider {
  id: string
  tenantId: string
  clientId: string | null
  enabled: boolean
  providerUrl: string
  credentialHeader: string | null
  credentialValue: string | null
  credentialHeaders: Record<string, string> | null
  jitProvision: boolean
  syncOnLogin: boolean
  fieldMapping: FieldMapping | null
  requestMapping: RequestMapping | null
  createdAt: string
  updatedAt: string
}

export interface CreateProviderPayload {
  clientId?: string | null
  enabled?: boolean
  providerUrl: string
  credentialHeader?: string | null
  credentialValue?: string | null
  credentialHeaders?: Record<string, string> | null
  jitProvision?: boolean
  syncOnLogin?: boolean
  fieldMapping?: FieldMapping | null
  requestMapping?: RequestMapping | null
}

export type UpdateProviderPayload = Partial<CreateProviderPayload>

export const externalAuthApi = {
  findAll(tenantId: string) {
    return http.get<ExternalAuthProvider[]>(`/admin/tenants/${tenantId}/external-auth`)
  },
  findOne(tenantId: string, id: string) {
    return http.get<ExternalAuthProvider>(`/admin/tenants/${tenantId}/external-auth/${id}`)
  },
  create(tenantId: string, payload: CreateProviderPayload) {
    return http.post<ExternalAuthProvider>(`/admin/tenants/${tenantId}/external-auth`, payload)
  },
  update(tenantId: string, id: string, payload: UpdateProviderPayload) {
    return http.patch<ExternalAuthProvider>(`/admin/tenants/${tenantId}/external-auth/${id}`, payload)
  },
  remove(tenantId: string, id: string) {
    return http.delete(`/admin/tenants/${tenantId}/external-auth/${id}`)
  },
}
