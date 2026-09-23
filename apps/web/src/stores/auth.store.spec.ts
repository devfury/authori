import { describe, expect, it, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { AdminRole } from '@/api/enums'

// vi.mock 팩토리는 최상단으로 호이스팅되어 일반 top-level 변수를 참조할 수 없다.
const { push, login } = vi.hoisted(() => ({ push: vi.fn(), login: vi.fn() }))

vi.mock('@/router', () => ({ default: { push } }))
vi.mock('@/api/auth', () => ({ authApi: { login } }))

import { useAuthStore } from './auth.store'

const TENANT_A = { id: 'a', slug: 'acme', name: 'Acme' }
const TENANT_B = { id: 'b', slug: 'globex', name: 'Globex' }

/**
 * 역할 클레임만 담긴 토큰을 만든다. 배정 테넌트는 JWT 가 아니라 로그인 응답에서 온다.
 */
function fakeToken(role: string): string {
  const body = btoa(JSON.stringify({ sub: 'admin-1', email: 'a@example.com', role }))
  return `header.${body}.signature`
}

describe('auth store — 로그인 후 이동', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    push.mockClear()
    login.mockReset()
  })

  it('PLATFORM_ADMIN 은 테넌트 목록으로 간다', async () => {
    login.mockResolvedValue({
      data: { access_token: fakeToken(AdminRole.PLATFORM_ADMIN), tenants: [] },
    })
    await useAuthStore().login('a@example.com', 'pw')
    expect(push).toHaveBeenCalledWith('/admin/tenants')
  })

  it('배정이 하나면 선택 화면을 건너뛰고 대시보드로 간다', async () => {
    login.mockResolvedValue({
      data: { access_token: fakeToken(AdminRole.TENANT_ADMIN), tenants: [TENANT_A] },
    })
    await useAuthStore().login('a@example.com', 'pw')
    expect(push).toHaveBeenCalledWith('/admin/tenants/a/dashboard')
  })

  it('배정이 둘 이상이면 선택 화면으로 간다', async () => {
    login.mockResolvedValue({
      data: { access_token: fakeToken(AdminRole.TENANT_ADMIN), tenants: [TENANT_A, TENANT_B] },
    })
    await useAuthStore().login('a@example.com', 'pw')
    expect(push).toHaveBeenCalledWith('/admin/select-tenant')
  })

  it('배정이 회수된 계정은 403 으로 보낸다', async () => {
    login.mockResolvedValue({
      data: { access_token: fakeToken(AdminRole.TENANT_ADMIN), tenants: [] },
    })
    await useAuthStore().login('a@example.com', 'pw')
    expect(push).toHaveBeenCalledWith('/403')
  })
})

describe('auth store — 배정 캐시', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    push.mockClear()
    login.mockReset()
  })

  it('로그인하면 배정 목록을 캐시한다 — 라우터 가드를 동기로 유지하기 위해', async () => {
    login.mockResolvedValue({
      data: { access_token: fakeToken(AdminRole.TENANT_ADMIN), tenants: [TENANT_A, TENANT_B] },
    })
    const auth = useAuthStore()
    await auth.login('a@example.com', 'pw')

    expect(auth.tenantIds).toEqual(['a', 'b'])
    expect(JSON.parse(localStorage.getItem('admin_tenants')!)).toEqual([TENANT_A, TENANT_B])
  })

  it('로그아웃하면 토큰과 배정 캐시를 모두 지운다', async () => {
    login.mockResolvedValue({
      data: { access_token: fakeToken(AdminRole.TENANT_ADMIN), tenants: [TENANT_A] },
    })
    const auth = useAuthStore()
    await auth.login('a@example.com', 'pw')

    auth.logout()

    expect(auth.tenants).toEqual([])
    expect(localStorage.getItem('admin_token')).toBeNull()
    expect(localStorage.getItem('admin_tenants')).toBeNull()
  })

  it('캐시가 깨져 있어도 던지지 않고 빈 목록으로 시작한다', () => {
    localStorage.setItem('admin_tenants', '{not json')
    expect(useAuthStore().tenants).toEqual([])
  })
})
