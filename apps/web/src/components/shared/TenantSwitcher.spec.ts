import { describe, expect, it, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TenantSwitcher from './TenantSwitcher.vue'

const push = vi.fn()
let currentRoute: { name: string; params: Record<string, string> } = {
  name: 'user-list',
  params: { tenantId: 'a' },
}

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => currentRoute,
}))

const TENANTS = [
  { id: 'a', slug: 'acme', name: 'Acme' },
  { id: 'b', slug: 'globex', name: 'Globex' },
]

function mountSwitcher(tenants = TENANTS) {
  return mount(TenantSwitcher, {
    props: { tenantId: 'a', tenantName: 'Acme', tenants },
  })
}

describe('TenantSwitcher', () => {
  beforeEach(() => {
    push.mockClear()
    currentRoute = { name: 'user-list', params: { tenantId: 'a' } }
  })

  it('배정이 하나뿐이면 전환 버튼 없이 이름만 보여준다', () => {
    const wrapper = mountSwitcher([TENANTS[0]])
    expect(wrapper.text()).toContain('Acme')
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('배정이 둘 이상이면 전환 버튼이 생긴다', () => {
    const wrapper = mountSwitcher()
    expect(wrapper.find('button[aria-haspopup="listbox"]').exists()).toBe(true)
  })

  it('버튼을 누르면 배정된 테넌트가 모두 나열된다', async () => {
    const wrapper = mountSwitcher()
    await wrapper.find('button[aria-haspopup="listbox"]').trigger('click')

    const options = wrapper.findAll('[role="option"]')
    expect(options).toHaveLength(2)
    expect(wrapper.text()).toContain('Globex')
  })

  it('tenantId 만 다른 화면이면 같은 화면을 유지한 채 테넌트만 바꾼다', async () => {
    const wrapper = mountSwitcher()
    await wrapper.find('button[aria-haspopup="listbox"]').trigger('click')
    await wrapper.findAll('[role="option"]')[1].trigger('click')

    expect(push).toHaveBeenCalledWith({ name: 'user-list', params: { tenantId: 'b' } })
  })

  it('다른 파라미터가 있으면 대시보드로 보낸다 — 그 자원은 새 테넌트에 없다', async () => {
    currentRoute = { name: 'user-detail', params: { tenantId: 'a', userId: 'u1' } }
    const wrapper = mountSwitcher()
    await wrapper.find('button[aria-haspopup="listbox"]').trigger('click')
    await wrapper.findAll('[role="option"]')[1].trigger('click')

    expect(push).toHaveBeenCalledWith({ name: 'tenant-dashboard', params: { tenantId: 'b' } })
  })

  it('현재 테넌트를 다시 고르면 이동하지 않는다', async () => {
    const wrapper = mountSwitcher()
    await wrapper.find('button[aria-haspopup="listbox"]').trigger('click')
    await wrapper.findAll('[role="option"]')[0].trigger('click')

    expect(push).not.toHaveBeenCalled()
  })
})
