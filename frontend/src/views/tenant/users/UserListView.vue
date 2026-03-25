<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Plus } from 'lucide-vue-next'
import { usersApi, type User } from '@/api/users'
import { UserStatus } from '@/api/enums'
import PageHeader from '@/components/shared/PageHeader.vue'
import StatusBadge from '@/components/shared/StatusBadge.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'

const route = useRoute()
const tenantId = route.params.tenantId as string

const users = ref<User[]>([])
const loading = ref(true)
const deactivateTarget = ref<User | null>(null)

async function load() {
  loading.value = true
  try {
    const { data } = await usersApi.findAll(tenantId)
    users.value = data
  } finally {
    loading.value = false
  }
}

async function confirmDeactivate() {
  if (!deactivateTarget.value) return
  await usersApi.deactivate(tenantId, deactivateTarget.value.id)
  deactivateTarget.value = null
  await load()
}

onMounted(load)
</script>

<template>
  <div>
    <PageHeader title="사용자" description="테넌트 사용자를 관리합니다.">
      <template #actions>
        <RouterLink
          :to="{ name: 'user-create', params: { tenantId } }"
          class="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus class="w-4 h-4" />
          사용자 생성
        </RouterLink>
      </template>
    </PageHeader>

    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div v-if="loading" class="p-8 text-center text-sm text-gray-400">불러오는 중...</div>
      <div v-else-if="users.length === 0" class="p-8 text-center text-sm text-gray-400">
        등록된 사용자가 없습니다.
      </div>
      <table v-else class="w-full text-sm">
        <thead class="bg-gray-50 border-b border-gray-200">
          <tr>
            <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">이름</th>
            <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">이메일</th>
            <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">상태</th>
            <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">로그인 실패 횟수</th>
            <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">마지막 로그인</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="user in users" :key="user.id" class="hover:bg-gray-50 transition-colors">
            <td class="px-4 py-3 text-gray-500">{{ user.name ?? '—' }}</td>
            <td class="px-4 py-3 text-gray-900">
              <RouterLink
                :to="{ name: 'user-detail', params: { tenantId, userId: user.id } }"
                class="hover:text-indigo-600"
              >
                {{ user.email }}
              </RouterLink>
            </td>
            <td class="px-4 py-3"><StatusBadge :status="user.status" /></td>
            <td class="px-4 py-3 text-gray-500">{{ user.failedLoginAttempts }}</td>
            <td class="px-4 py-3 text-gray-400 text-xs">
              {{ user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('ko-KR') : '—' }}
            </td>
            <td class="px-4 py-3 text-right">
              <button
                v-if="user.status === UserStatus.ACTIVE"
                class="text-xs text-red-500 hover:underline"
                @click="deactivateTarget = user"
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
      title="사용자 비활성화"
      :message="`'${deactivateTarget?.email}' 사용자를 비활성화하시겠습니까?`"
      confirm-label="비활성화"
      danger
      @confirm="confirmDeactivate"
      @cancel="deactivateTarget = null"
    />
  </div>
</template>
