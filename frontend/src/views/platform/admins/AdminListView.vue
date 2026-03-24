<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { Plus } from 'lucide-vue-next'
import { adminsApi, type AdminUser } from '@/api/admins'
import { AdminRole, AdminStatus } from '@/api/enums'
import PageHeader from '@/components/shared/PageHeader.vue'
import StatusBadge from '@/components/shared/StatusBadge.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'

const admins = ref<AdminUser[]>([])
const loading = ref(true)
const deactivateTarget = ref<AdminUser | null>(null)

async function load() {
  loading.value = true
  try {
    const { data } = await adminsApi.findAll()
    admins.value = data
  } finally {
    loading.value = false
  }
}

async function confirmDeactivate() {
  if (!deactivateTarget.value) return
  await adminsApi.deactivate(deactivateTarget.value.id)
  deactivateTarget.value = null
  await load()
}

onMounted(load)
</script>

<template>
  <div>
    <PageHeader title="관리자 계정" description="플랫폼 및 테넌트 관리자를 관리합니다.">
      <template #actions>
        <RouterLink
          to="/admin/admins/new"
          class="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus class="w-4 h-4" />
          관리자 생성
        </RouterLink>
      </template>
    </PageHeader>

    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div v-if="loading" class="p-8 text-center text-sm text-gray-400">불러오는 중...</div>
      <div v-else-if="admins.length === 0" class="p-8 text-center text-sm text-gray-400">
        등록된 관리자가 없습니다.
      </div>
      <table v-else class="w-full text-sm">
        <thead class="bg-gray-50 border-b border-gray-200">
          <tr>
            <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">이메일</th>
            <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">역할</th>
            <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">테넌트</th>
            <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">상태</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="admin in admins" :key="admin.id" class="hover:bg-gray-50 transition-colors">
            <td class="px-4 py-3 text-gray-900">{{ admin.email }}</td>
            <td class="px-4 py-3">
              <span
                class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                :class="admin.role === AdminRole.PLATFORM_ADMIN ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700'"
              >
                {{ admin.role === AdminRole.PLATFORM_ADMIN ? '플랫폼 관리자' : '테넌트 관리자' }}
              </span>
            </td>
            <td class="px-4 py-3 text-gray-400 font-mono text-xs">{{ admin.tenantId ?? '—' }}</td>
            <td class="px-4 py-3"><StatusBadge :status="admin.status" /></td>
            <td class="px-4 py-3 text-right">
              <button
                v-if="admin.status === AdminStatus.ACTIVE"
                class="text-xs text-red-500 hover:underline"
                @click="deactivateTarget = admin"
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
      title="관리자 비활성화"
      :message="`'${deactivateTarget?.email}' 계정을 비활성화하시겠습니까?`"
      confirm-label="비활성화"
      danger
      @confirm="confirmDeactivate"
      @cancel="deactivateTarget = null"
    />
  </div>
</template>
