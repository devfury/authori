import http from './http'

export interface LoginPayload {
  email: string
  password: string
}

export interface BootstrapPayload {
  secret: string
  email: string
  password: string
}

export interface LoginResponse {
  access_token: string
}

export const authApi = {
  login(payload: LoginPayload) {
    return http.post<LoginResponse>('/admin/auth/login', payload)
  },
  bootstrapStatus() {
    return http.get<{ needed: boolean }>('/admin/auth/bootstrap/status')
  },
  bootstrap(payload: BootstrapPayload) {
    return http.post<{ message: string }>('/admin/auth/bootstrap', payload)
  },
}
