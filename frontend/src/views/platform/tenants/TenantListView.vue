<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { Plus } from 'lucide-vue-next'
import { tenantsApi, type Tenant } from '@/api/tenants'
import { TenantStatus } from '@/api/enums'
import PageHeader from '@/components/shared/PageHeader.vue'
import StatusBadge from '@/components/shared/StatusBadge.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'

const tenants = ref<Tenant[]>([])
const loading = ref(true)
const deactivateTarget = ref<Tenant | null>(null)

async function load() {
  loading.value = true
  try {
    const { data } = await tenantsApi.findAll()
    tenants.value = data
  } finally {
    loading.value = false
  }
}

async function confirmDeactivate() {
  if (!deactivateTarget.value) return
  await tenantsApi.deactivate(deactivateTarget.value.id)
  deactivateTarget.value = null
  await load()
}

async function activate(tenant: Tenant) {
  await tenantsApi.activate(tenant.id)
  await load()
}

onMounted(load)
</script>

<template>
  <div>
    <PageHeader title="테넌트 관리" description="등록된 모든 테넌트를 관리합니다.">
      <template #actions>
        <RouterLink
          to="/admin/tenants/new"
          class="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus class="w-4 h-4" />
          테넌트 생성
        </RouterLink>
      </template>
    </PageHeader>

    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div v-if="loading" class="p-8 text-center text-sm text-gray-400">불러오는 중...</div>
      <div v-else-if="tenants.length === 0" class="p-8 text-center text-sm text-gray-400">
        등록된 테넌트가 없습니다.
      </div>
      <table v-else class="w-full text-sm">
        <thead class="bg-gray-50 border-b border-gray-200">
          <tr>
            <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">이름</th>
            <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">슬러그</th>
            <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">상태</th>
            <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">생성일</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="tenant in tenants" :key="tenant.id" class="hover:bg-gray-50 transition-colors">
            <td class="px-4 py-3 font-medium text-gray-900">
              <RouterLink :to="`/admin/tenants/${tenant.id}`" class="hover:text-indigo-600">
                {{ tenant.name }}
              </RouterLink>
            </td>
            <td class="px-4 py-3 text-gray-500 font-mono text-xs">{{ tenant.slug }}</td>
            <td class="px-4 py-3"><StatusBadge :status="tenant.status" /></td>
            <td class="px-4 py-3 text-gray-400">{{ new Date(tenant.createdAt).toLocaleDateString('ko-KR') }}</td>
            <td class="px-4 py-3 text-right">
              <RouterLink
                :to="`/admin/tenants/${tenant.id}/clients`"
                class="text-xs text-indigo-600 hover:underline mr-3"
              >
                관리
              </RouterLink>
              <button
                v-if="tenant.status !== TenantStatus.ACTIVE"
                class="text-xs text-green-600 hover:underline mr-3"
                @click="activate(tenant)"
              >
                활성화
              </button>
              <button
                v-if="tenant.status === TenantStatus.ACTIVE"
                class="text-xs text-red-500 hover:underline"
                @click="deactivateTarget = tenant"
              >
                비활성화
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <ConfirmDialog
      :open="!!deactivateTarget"
      title="테넌트 비활성화"
      :message="`'${deactivateTarget?.name}' 테넌트를 비활성화하시겠습니까?`"
      confirm-label="비활성화"
      danger
      @confirm="confirmDeactivate"
      @cancel="deactivateTarget = null"
    />
  </div>
</template>
