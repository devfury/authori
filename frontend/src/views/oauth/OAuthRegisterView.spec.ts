import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { AxiosHeaders } from 'axios'
import OAuthRegisterView from './OAuthRegisterView.vue'
import { oauthApi } from '@/api/oauth'

vi.mock('vue-router', () => ({
  useRoute: () => ({
    query: {
      tenantSlug: 'test-tenant',
      clientId: 'test-client',
      requestId: 'request-1',
    },
  }),
}))

vi.mock('@/api/oauth', () => ({
  oauthApi: {
    getLoginConfig: vi.fn(),
    register: vi.fn(),
  },
}))

const mockedOAuthApi = vi.mocked(oauthApi)

function mountRegisterView() {
  return mount(OAuthRegisterView, {
    global: {
      stubs: {
        RouterLink: {
          props: ['to'],
          template: '<a><slot /></a>',
        },
        Teleport: true,
      },
    },
  })
}

describe('OAuthRegisterView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedOAuthApi.getLoginConfig.mockResolvedValue({
      data: {
        clientName: 'Test Client',
        branding: null,
        allowRegistration: true,
        autoActivateRegistration: false,
        activeSchema: null,
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: { headers: new AxiosHeaders() },
    })
  })

  it('requires users to confirm their password before registration', async () => {
    const wrapper = mountRegisterView()
    await flushPromises()

    const passwordInputs = wrapper.findAll('input[type="password"]')
    expect(passwordInputs).toHaveLength(2)

    await wrapper.find('input[type="email"]').setValue('user@example.com')
    await passwordInputs[0].setValue('password123')
    await passwordInputs[1].setValue('different123')
    await wrapper.find('form').trigger('submit.prevent')

    expect(mockedOAuthApi.register).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('비밀번호가 일치하지 않습니다.')
  })

  it('hides the admin approval message after registration when auto activation is enabled', async () => {
    mockedOAuthApi.getLoginConfig.mockResolvedValueOnce({
      data: {
        clientName: 'Test Client',
        branding: null,
        allowRegistration: true,
        autoActivateRegistration: true,
        activeSchema: null,
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: { headers: new AxiosHeaders() },
    })
    mockedOAuthApi.register.mockResolvedValue({
      data: { message: 'registered' },
      status: 201,
      statusText: 'Created',
      headers: {},
      config: { headers: new AxiosHeaders() },
    })

    const wrapper = mountRegisterView()
    await flushPromises()

    const passwordInputs = wrapper.findAll('input[type="password"]')
    await wrapper.find('input[type="email"]').setValue('user@example.com')
    await passwordInputs[0].setValue('password123')
    await passwordInputs[1].setValue('password123')
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(mockedOAuthApi.register).toHaveBeenCalledOnce()
    expect(wrapper.text()).not.toContain('관리자 승인 후 로그인하실 수 있습니다.')
    expect(wrapper.text()).toContain('바로 로그인하실 수 있습니다.')
  })
})
