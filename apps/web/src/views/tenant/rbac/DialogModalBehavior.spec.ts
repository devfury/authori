import { describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { AxiosHeaders, type AxiosResponse } from 'axios'
import type { Component } from 'vue'
import ScopeFormDialog from '../scopes/ScopeFormDialog.vue'
import RoleFormDialog from './RoleFormDialog.vue'
import RolePermissionDialog from './RolePermissionDialog.vue'
import PermissionFormDialog from './PermissionFormDialog.vue'
import { rbacApi, type Permission, type Role } from '@/api/rbac'

vi.mock('@/api/scopes', () => ({
  scopesApi: {
    create: vi.fn(),
    update: vi.fn(),
  },
}))

vi.mock('@/api/rbac', () => ({
  rbacApi: {
    createRole: vi.fn(),
    updateRole: vi.fn(),
    createPermission: vi.fn(),
    updatePermission: vi.fn(),
    findPermissions: vi.fn(),
    getRolePermissions: vi.fn(),
    setRolePermissions: vi.fn(),
  },
}))

const role: Role = {
  id: 'role-1',
  tenantId: 'tenant-1',
  name: 'manager',
  displayName: '매니저',
  description: null,
  isDefault: false,
  createdAt: '2026-05-14T00:00:00.000Z',
}

const permission: Permission = {
  id: 'permission-1',
  tenantId: 'tenant-1',
  name: 'orders:write',
  displayName: '주문 작성',
  description: null,
  createdAt: '2026-05-14T00:00:00.000Z',
}

function axiosResponse<T>(data: T): AxiosResponse<T> {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: { headers: new AxiosHeaders() },
  }
}

describe('tenant management dialogs', () => {
  const formDialogCases: Array<[string, Component, Record<string, unknown>]> = [
    ['scope form', ScopeFormDialog, { open: true, tenantId: 'tenant-1', scope: null }],
    ['role form', RoleFormDialog, { open: true, tenantId: 'tenant-1', role: null }],
    ['permission form', PermissionFormDialog, { open: true, tenantId: 'tenant-1', permission: null }],
  ]

  it.each(formDialogCases)('keeps the %s open when the backdrop is clicked', async (_name, component, props) => {
    const wrapper = mount(component, { props })

    await wrapper.find('.fixed.inset-0').trigger('click')

    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('keeps the role permission dialog open when the backdrop is clicked', async () => {
    vi.mocked(rbacApi.findPermissions).mockResolvedValue(axiosResponse([permission]))
    vi.mocked(rbacApi.getRolePermissions).mockResolvedValue(axiosResponse([]))

    const wrapper = mount(RolePermissionDialog, {
      props: {
        open: true,
        tenantId: 'tenant-1',
        role,
      },
    })
    await flushPromises()

    await wrapper.find('.fixed.inset-0').trigger('click')

    expect(wrapper.emitted('close')).toBeUndefined()
  })
})
