import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import AppSidebar from './AppSidebar.vue'

vi.mock('vue-router', () => ({
  RouterLink: {
    props: ['to'],
    template: '<a><slot /></a>',
  },
  useRoute: () => ({
    name: 'tenant-dashboard',
  }),
}))

describe('AppSidebar', () => {
  it('renders shortened client and scope menu labels', () => {
    const wrapper = mount(AppSidebar, {
      props: {
        isOpen: true,
        isPlatformAdmin: false,
        tenantId: 'tenant-1',
      },
    })

    expect(wrapper.text()).toContain('클라이언트')
    expect(wrapper.text()).toContain('스코프')
    expect(wrapper.text()).not.toContain('OAuth 클라이언트')
    expect(wrapper.text()).not.toContain('OAuth2 스코프')
  })
})
