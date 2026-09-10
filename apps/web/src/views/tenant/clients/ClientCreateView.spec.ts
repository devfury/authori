import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { AxiosHeaders } from 'axios'
import ClientCreateView from './ClientCreateView.vue'
import { clientsApi, type ClientCreatedResponse } from '@/api/clients'
import { scopesApi } from '@/api/scopes'

const push = vi.fn()

vi.mock('vue-router', () => ({
  useRouter: () => ({ push, back: vi.fn() }),
  useRoute: () => ({ params: { tenantId: 'tenant-1' } }),
}))

vi.mock('@/api/clients', () => ({
  clientsApi: { create: vi.fn() },
}))

vi.mock('@/api/scopes', () => ({
  scopesApi: { findAll: vi.fn() },
}))

const mockedClientsApi = vi.mocked(clientsApi)
const mockedScopesApi = vi.mocked(scopesApi)

const writeText = vi.fn()

function axiosResponse(data: ClientCreatedResponse) {
  return { data, status: 201, statusText: 'Created', headers: {}, config: { headers: new AxiosHeaders() } }
}

function createdResponse(plainSecret: string | null): ClientCreatedResponse {
  return {
    client: { clientId: 'client-uuid-1' } as ClientCreatedResponse['client'],
    plainSecret,
  }
}

function mountCreateView() {
  return mount(ClientCreateView, {
    global: { stubs: { PageHeader: true } },
  })
}

async function submitConfidential() {
  const wrapper = mountCreateView()
  await flushPromises()

  await wrapper.find('input[type="text"]').setValue('My Server App')
  await wrapper.find('select').setValue('CONFIDENTIAL')
  await wrapper.find('form').trigger('submit.prevent')
  await flushPromises()

  return wrapper
}

describe('ClientCreateView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(navigator, { clipboard: { writeText } })
    writeText.mockResolvedValue(undefined)
    mockedScopesApi.findAll.mockResolvedValue({
      data: [],
      status: 200,
      statusText: 'OK',
      headers: {},
      config: { headers: new AxiosHeaders() },
    })
  })

  it('shows both the client id and the client secret after creating a confidential client', async () => {
    mockedClientsApi.create.mockResolvedValue(axiosResponse(createdResponse('super-secret')))

    const wrapper = await submitConfidential()

    expect(wrapper.text()).toContain('Client ID')
    expect(wrapper.text()).toContain('client-uuid-1')
    expect(wrapper.text()).toContain('Client Secret')
    expect(wrapper.text()).toContain('super-secret')
    expect(push).not.toHaveBeenCalled()
  })

  it('copies the client id and the client secret to the clipboard independently', async () => {
    mockedClientsApi.create.mockResolvedValue(axiosResponse(createdResponse('super-secret')))

    const wrapper = await submitConfidential()

    const copyButtons = wrapper.findAll('button')
    // 결과 카드의 버튼: [Client ID 복사, Client Secret 복사, 목록으로]
    await copyButtons[0].trigger('click')
    expect(writeText).toHaveBeenCalledWith('client-uuid-1')

    await copyButtons[1].trigger('click')
    expect(writeText).toHaveBeenCalledWith('super-secret')
  })

  it('redirects to the client list when no secret is issued', async () => {
    mockedClientsApi.create.mockResolvedValue(axiosResponse(createdResponse(null)))

    const wrapper = await submitConfidential()

    expect(push).toHaveBeenCalledWith({ name: 'client-list', params: { tenantId: 'tenant-1' } })
    expect(wrapper.text()).not.toContain('Client Secret')
  })
})
