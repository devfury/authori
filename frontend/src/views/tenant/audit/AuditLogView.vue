<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { adminsApi, type AdminUser } from '@/api/admins'
import { auditApi, type AuditLog } from '@/api/audit'
import { clientsApi, type OAuthClient } from '@/api/clients'
import { usersApi, type User } from '@/api/users'
import PageHeader from '@/components/shared/PageHeader.vue'

const route = useRoute()
const tenantId = route.params.tenantId as string

const logs = ref<AuditLog[]>([])
const loading = ref(true)
const adminMap = ref<Record<string, AdminUser>>({})
const userMap = ref<Record<string, User>>({})
const clientMap = ref<Record<string, OAuthClient>>({})

const actionColors: Record<string, string> = {
  LOGIN_SUCCESS: 'bg-green-100 text-green-700',
  LOGIN_FAILURE: 'bg-red-100 text-red-700',
  USER_LOCKED: 'bg-red-100 text-red-700',
  TOKEN_ISSUED: 'bg-blue-100 text-blue-700',
  TOKEN_REFRESHED: 'bg-blue-100 text-blue-700',
  TOKEN_REVOKED: 'bg-orange-100 text-orange-700',
  CODE_ISSUED: 'bg-indigo-100 text-indigo-700',
}

function indexById<T>(items: T[], getId: (item: T) => string): Record<string, T> {
  return items.reduce<Record<string, T>>((acc, item) => {
    acc[getId(item)] = item
    return acc
  }, {})
}

function formatActor(log: AuditLog): string {
  if (log.actorType === 'admin') {
    const admin = log.actorId ? adminMap.value[log.actorId] : null
    return admin?.name || admin?.email || (log.actorId ? `관리자 (${log.actorId})` : '관리자')
  }

  if (log.actorType === 'user') {
    const user = log.actorId ? userMap.value[log.actorId] : null
    return user?.name || user?.email || (log.actorId ? `사용자 (${log.actorId})` : '사용자')
  }

  if (log.actorType === 'client') {
    const client = log.actorId ? clientMap.value[log.actorId] : null
    return client?.name || (log.actorId ? `클라이언트 (${log.actorId})` : '클라이언트')
  }

  if (log.actorType === 'system') {
    return log.actorId ? `시스템 (${log.actorId})` : '시스템'
  }

  return log.actorId ?? '—'
}

onMounted(async () => {
  try {
    const [logsResult, adminsResult, usersResult, clientsResult] = await Promise.allSettled([
      auditApi.findAll(tenantId, { limit: 50 }),
      adminsApi.findAll(),
      usersApi.findAll(tenantId),
      clientsApi.findAll(tenantId),
    ])

    if (logsResult.status === 'fulfilled') {
      logs.value = logsResult.value.data
    }
    if (adminsResult.status === 'fulfilled') {
      adminMap.value = indexById(adminsResult.value.data, (admin) => admin.id)
    }
    if (usersResult.status === 'fulfilled') {
      userMap.value = indexById(usersResult.value.data, (user) => user.id)
    }
    if (clientsResult.status === 'fulfilled') {
      clientMap.value = indexById(clientsResult.value.data, (client) => client.clientId)
    }
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <PageHeader title="감사 로그" description="테넌트 내 주요 이벤트 기록입니다." />

    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div v-if="loading" class="p-8 text-center text-sm text-gray-400">불러오는 중...</div>
      <div v-else-if="logs.length === 0" class="p-8 text-center text-sm text-gray-400">
        기록이 없습니다.
      </div>
      <table v-else class="w-full text-sm">
        <thead class="bg-gray-50 border-b border-gray-200">
          <tr>
            <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">액션</th>
            <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">행위자</th>
            <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">행위자 유형</th>
            <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">결과</th>
            <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">IP</th>
            <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">시각</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="log in logs" :key="log.id" class="hover:bg-gray-50 transition-colors">
            <td class="px-4 py-3">
              <span
                class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                :class="actionColors[log.action] ?? 'bg-gray-100 text-gray-600'"
              >
                {{ log.action }}
              </span>
            </td>
            <td class="px-4 py-3 text-gray-500 text-xs">
              {{ formatActor(log) }}
            </td>
            <td class="px-4 py-3 text-gray-500 text-xs">{{ log.actorType ?? '—' }}</td>
            <td class="px-4 py-3">
              <span
                class="text-xs font-medium"
                :class="log.success ? 'text-green-600' : 'text-red-600'"
              >
                {{ log.success ? '성공' : '실패' }}
              </span>
            </td>
            <td class="px-4 py-3 text-gray-400 font-mono text-xs">{{ log.ipAddress ?? '—' }}</td>
            <td class="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
              {{ new Date(log.createdAt).toLocaleString('ko-KR') }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
