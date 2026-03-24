<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Plus } from 'lucide-vue-next'
import { clientsApi, type OAuthClient } from '@/api/clients'
import { ClientStatus } from '@/api/enums'
import PageHeader from '@/components/shared/PageHeader.vue'
import StatusBadge from '@/components/shared/StatusBadge.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'

const route = useRoute()
const tenantId = route.params.tenantId as string

const clients = ref<OAuthClient[]>([])
const loading = ref(true)
const deactivateTarget = ref<OAuthClient | null>(null)

async function load() {
  loading.value = true
  try {
    const { data } = await clientsApi.findAll(tenantId)
    clients.value = data
  } finally {
    loading.value = false
  }
}

async function confirmDeactivate() {
  if (!deactivateTarget.value) return
  await clientsApi.deactivate(tenantId, deactivateTarget.value.clientId)
  deactivateTarget.value = null
  await load()
}

onMounted(load)
</script>

<template>
  <div>
    <PageHeader title="OAuth 클라이언트" description="등록된 OAuth2 클라이언트를 관리합니다.">
      <template #actions>
        <RouterLink
          :to="{ name: 'client-create', params: { tenantId } }"
          class="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus class="w-4 h-4" />
          클라이언트 생성
        </RouterLink>
      </template>
    </PageHeader>

    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div v-if="loading" class="p-8 text-center text-sm text-gray-400">불러오는 중...</div>
      <div v-else-if="clients.length === 0" class="p-8 text-center text-sm text-gray-400">
        등록된 클라이언트가 없습니다.
      </div>
      <table v-else class="w-full text-sm">
        <thead class="bg-gray-50 border-b border-gray-200">
          <tr>
            <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">이름</th>
            <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Client ID</th>
            <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">타입</th>
            <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">상태</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="client in clients" :key="client.clientId" class="hover:bg-gray-50 transition-colors">
            <td class="px-4 py-3 font-medium text-gray-900">
              <RouterLink
                :to="{ name: 'client-detail', params: { tenantId, clientId: client.clientId } }"
                class="hover:text-indigo-600"
              >
                {{ client.name }}
              </RouterLink>
            </td>
            <td class="px-4 py-3 text-gray-500 font-mono text-xs">{{ client.clientId }}</td>
            <td class="px-4 py-3 text-gray-500">{{ client.type }}</td>
            <td class="px-4 py-3"><StatusBadge :status="client.status" /></td>
            <td class="px-4 py-3 text-right">
              <button
                v-if="client.status === ClientStatus.ACTIVE"
                class="text-xs text-red-500 hover:underline"
                @click="deactivateTarget = client"
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
      title="클라이언트 비활성화"
      :message="`'${deactivateTarget?.name}' 클라이언트를 비활성화하시겠습니까?`"
      confirm-label="비활성화"
      danger
      @confirm="confirmDeactivate"
      @cancel="deactivateTarget = null"
    />
  </div>
</template>
