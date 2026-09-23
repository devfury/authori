import { describe, expect, it, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { AdminRole } from '@/api/enums'

/**
 * 라우터 가드의 테넌트 경계 검사를 검증한다.
 *
 * router/index.ts 는 import 시점에 모든 라우트를 등록하므로, auth store 만
 * 갈아끼우고 실제 beforeEach 훅을 직접 호출한다.
 */

const MY_TENANT = '11111111-1111-1111-1111-111111111111'
const OTHER_TENANT = '22222222-2222-2222-2222-222222222222'

type GuardResult = { name?: string } | undefined

/** auth store 를 원하는 역할로 고정한 뒤 라우터의 beforeEach 훅을 꺼내온다. */
async function loadGuard(auth: {
  isAuthenticated: boolean
  isPlatformAdmin: boolean
  tenantIds: string[]
}) {
  vi.resetModules()
  vi.doMock('@/stores/auth.store', () => ({ useAuthStore: () => auth }))

  const hooks: Array<
    (to: unknown, from: unknown, next: (r?: GuardResult) => void) => void
  > = []
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router')
  vi.doMock('vue-router', () => ({
    ...actual,
    createWebHistory: () => actual.createMemoryHistory(),
    createRouter: (options: Parameters<typeof actual.createRouter>[0]) => {
      const router = actual.createRouter(options)
      return {
        ...router,
        beforeEach: (hook: (typeof hooks)[number]) => hooks.push(hook),
      }
    },
  }))

  await import('./index')
  return hooks[0]
}

/** 가드를 한 번 실행하고 next() 에 전달된 값을 돌려준다. */
async function navigate(
  auth: Parameters<typeof loadGuard>[0],
  to: { meta?: Record<string, unknown>; params?: Record<string, string> },
): Promise<GuardResult> {
  const guard = await loadGuard(auth)
  let result: GuardResult
  guard({ meta: {}, params: {}, ...to }, {}, (r) => {
    result = r
  })
  return result
}

const tenantAdmin = {
  isAuthenticated: true,
  isPlatformAdmin: false,
  tenantIds: [MY_TENANT],
  role: AdminRole.TENANT_ADMIN,
}
const multiTenantAdmin = {
  isAuthenticated: true,
  isPlatformAdmin: false,
  tenantIds: [MY_TENANT, OTHER_TENANT],
  role: AdminRole.TENANT_ADMIN,
}
const platformAdmin = {
  isAuthenticated: true,
  isPlatformAdmin: true,
  tenantIds: [],
  role: AdminRole.PLATFORM_ADMIN,
}

describe('라우터 테넌트 경계 가드', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('테넌트 관리자는 배정된 테넌트 경로로 진입할 수 있다', async () => {
    const result = await navigate(tenantAdmin, {
      meta: { requiresAuth: true },
      params: { tenantId: MY_TENANT },
    })
    expect(result).toBeUndefined()
  })

  it('배정되지 않은 테넌트 경로로 진입하면 403 으로 보낸다', async () => {
    const result = await navigate(tenantAdmin, {
      meta: { requiresAuth: true },
      params: { tenantId: OTHER_TENANT },
    })
    expect(result).toEqual({ name: 'forbidden' })
  })

  it('여러 테넌트를 배정받으면 각각에 진입할 수 있다', async () => {
    for (const tenantId of [MY_TENANT, OTHER_TENANT]) {
      const result = await navigate(multiTenantAdmin, {
        meta: { requiresAuth: true },
        params: { tenantId },
      })
      expect(result).toBeUndefined()
    }
  })

  it('플랫폼 관리자는 임의의 테넌트 경로로 진입할 수 있다', async () => {
    const result = await navigate(platformAdmin, {
      meta: { requiresAuth: true },
      params: { tenantId: OTHER_TENANT },
    })
    expect(result).toBeUndefined()
  })

  it('tenantId 파라미터가 없는 경로는 테넌트 검사를 건너뛴다', async () => {
    const result = await navigate(tenantAdmin, { meta: { requiresAuth: true } })
    expect(result).toBeUndefined()
  })

  it('public 라우트는 그대로 통과한다', async () => {
    const result = await navigate(
      { isAuthenticated: false, isPlatformAdmin: false, tenantIds: [] },
      { meta: { public: true } },
    )
    expect(result).toBeUndefined()
  })

  it('미인증이면 로그인으로 보낸다', async () => {
    const result = await navigate(
      { isAuthenticated: false, isPlatformAdmin: false, tenantIds: [] },
      { meta: { requiresAuth: true }, params: { tenantId: MY_TENANT } },
    )
    expect(result).toEqual({ name: 'login' })
  })

  it('테넌트 관리자가 플랫폼 전용 경로로 진입하면 403 으로 보낸다 (기존 동작)', async () => {
    const result = await navigate(tenantAdmin, {
      meta: { requiresAuth: true, requiresPlatformAdmin: true },
    })
    expect(result).toEqual({ name: 'forbidden' })
  })
})
