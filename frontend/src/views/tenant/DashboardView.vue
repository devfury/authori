<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { clientsApi } from '@/api/clients'
import { usersApi } from '@/api/users'
import { auditApi, type AuditLog } from '@/api/audit'
import PageHeader from '@/components/shared/PageHeader.vue'

const route = useRoute()
const tenantId = route.params.tenantId as string

const clientCount = ref(0)
const userCount = ref(0)
const recentLogs = ref<AuditLog[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    const [clients, users, logs] = await Promise.all([
      clientsApi.findAll(tenantId),
      usersApi.findAll(tenantId),
      auditApi.findAll(tenantId, { limit: 5 }),
    ])
    clientCount.value = clients.data.length
    userCount.value = users.data.length
    recentLogs.value = logs.data
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <PageHeader title="테넌트 대시보드" />

    <div v-if="loading" class="text-sm text-gray-400">불러오는 중...</div>
    <template v-else>
      <div class="grid grid-cols-2 gap-4 mb-6">
        <div class="bg-white rounded-xl border border-gray-200 p-5">
          <p class="text-xs text-gray-400 mb-1">OAuth 클라이언트</p>
          <p class="text-3xl font-bold text-gray-900">{{ clientCount }}</p>
          <RouterLink
            :to="{ name: 'client-list', params: { tenantId } }"
            class="text-xs text-indigo-600 hover:underline mt-2 inline-block"
          >
            관리 →
          </RouterLink>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-5">
          <p class="text-xs text-gray-400 mb-1">사용자</p>
          <p class="text-3xl font-bold text-gray-900">{{ userCount }}</p>
          <RouterLink
            :to="{ name: 'user-list', params: { tenantId } }"
            class="text-xs text-indigo-600 hover:underline mt-2 inline-block"
          >
            관리 →
          </RouterLink>
        </div>
      </div>

      <div class="bg-white rounded-xl border border-gray-200 p-5">
        <h2 class="text-sm font-semibold text-gray-900 mb-3">최근 감사 로그</h2>
        <div v-if="recentLogs.length === 0" class="text-sm text-gray-400">기록 없음</div>
        <ul v-else class="space-y-2">
          <li
            v-for="log in recentLogs"
            :key="log.id"
            class="flex items-center justify-between text-sm"
          >
            <span class="font-mono text-xs text-gray-600">{{ log.action }}</span>
            <span class="text-xs text-gray-400">
              {{ new Date(log.createdAt).toLocaleString('ko-KR') }}
            </span>
          </li>
        </ul>
        <RouterLink
          :to="{ name: 'audit-log', params: { tenantId } }"
          class="text-xs text-indigo-600 hover:underline mt-3 inline-block"
        >
          전체 보기 →
        </RouterLink>
      </div>
    </template>
  </div>
</template>
