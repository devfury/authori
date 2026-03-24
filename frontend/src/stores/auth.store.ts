import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import router from '@/router'
import { authApi } from '@/api/auth'
import { AdminRole, type AdminRole as AdminRoleType } from '@/api/enums'

interface JwtPayload {
  sub: string
  email: string
  role: AdminRoleType
  tenantId: string | null
}

function parseJwt(token: string): JwtPayload | null {
  try {
    const base64url = token.split('.')[1]
    // base64url → base64 변환 후 누락된 패딩 추가
    const base64 = base64url
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(base64url.length + (4 - (base64url.length % 4)) % 4, '=')
    return JSON.parse(atob(base64)) as JwtPayload
  } catch {
    return null
  }
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('admin_token'))
  const payload = ref<JwtPayload | null>(token.value ? parseJwt(token.value) : null)

  const isAuthenticated = computed(() => !!token.value)
  const role = computed(() => payload.value?.role ?? null)
  const email = computed(() => payload.value?.email ?? null)
  const tenantId = computed(() => payload.value?.tenantId ?? null)
  const isPlatformAdmin = computed(() => role.value === AdminRole.PLATFORM_ADMIN)

  async function login(loginEmail: string, password: string) {
    const { data } = await authApi.login({ email: loginEmail, password })
    token.value = data.access_token
    payload.value = parseJwt(data.access_token)
    localStorage.setItem('admin_token', data.access_token)

    if (payload.value?.role === AdminRole.TENANT_ADMIN && payload.value.tenantId) {
      router.push(`/admin/tenants/${payload.value.tenantId}/dashboard`)
    } else {
      router.push('/admin/tenants')
    }
  }

  function logout() {
    token.value = null
    payload.value = null
    localStorage.removeItem('admin_token')
    router.push('/admin/login')
  }

  return { token, isAuthenticated, role, email, tenantId, isPlatformAdmin, login, logout }
})
