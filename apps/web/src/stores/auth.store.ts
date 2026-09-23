import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import router from '@/router'
import { authApi, type AdminTenant } from '@/api/auth'
import { AdminRole, type AdminRole as AdminRoleType } from '@/api/enums'

interface JwtPayload {
  sub: string
  email: string
  role: AdminRoleType
}

const TOKEN_KEY = 'admin_token'
const TENANTS_KEY = 'admin_tenants'

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

/**
 * 배정 테넌트는 JWT 가 아니라 서버 응답에서 온다. 라우터 가드를 동기로 유지하려고
 * localStorage 에 캐시하지만, 인가의 단일 진실은 서버다. 캐시가 낡아도 접근은
 * 서버의 TenantAdminGuard 가 막는다.
 */
function loadTenants(): AdminTenant[] {
  try {
    const raw = localStorage.getItem(TENANTS_KEY)
    return raw ? (JSON.parse(raw) as AdminTenant[]) : []
  } catch {
    return []
  }
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))
  const payload = ref<JwtPayload | null>(token.value ? parseJwt(token.value) : null)
  const tenants = ref<AdminTenant[]>(loadTenants())

  const isAuthenticated = computed(() => !!token.value)
  const role = computed(() => payload.value?.role ?? null)
  const email = computed(() => payload.value?.email ?? null)
  const isPlatformAdmin = computed(() => role.value === AdminRole.PLATFORM_ADMIN)
  const tenantIds = computed(() => tenants.value.map((t) => t.id))

  function setTenants(next: AdminTenant[]) {
    tenants.value = next
    try {
      localStorage.setItem(TENANTS_KEY, JSON.stringify(next))
    } catch {
      // 저장 실패는 치명적이지 않다. 메모리 상태로 이번 세션은 동작한다.
    }
  }

  /** 로그인 후 갈 곳. 소속이 하나뿐이면 선택 화면을 건너뛴다. */
  function landingRoute(): string {
    if (isPlatformAdmin.value) return '/admin/tenants'
    if (tenants.value.length === 1) return `/admin/tenants/${tenants.value[0].id}/dashboard`
    if (tenants.value.length > 1) return '/admin/select-tenant'
    // 배정이 회수된 TENANT_ADMIN — 접근할 수 있는 화면이 없다.
    return '/403'
  }

  async function login(loginEmail: string, password: string) {
    const { data } = await authApi.login({ email: loginEmail, password })
    token.value = data.access_token
    payload.value = parseJwt(data.access_token)
    localStorage.setItem(TOKEN_KEY, data.access_token)
    setTenants(data.tenants ?? [])

    await router.push(landingRoute())
  }

  /** 새로고침·배정 변경 후 목록을 서버 기준으로 되맞춘다. */
  async function refreshTenants() {
    const { data } = await authApi.me()
    setTenants(data.tenants ?? [])
  }

  function logout() {
    token.value = null
    payload.value = null
    tenants.value = []
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(TENANTS_KEY)
    router.push('/admin/login')
  }

  return {
    token,
    tenants,
    tenantIds,
    isAuthenticated,
    role,
    email,
    isPlatformAdmin,
    landingRoute,
    setTenants,
    refreshTenants,
    login,
    logout,
  }
})
