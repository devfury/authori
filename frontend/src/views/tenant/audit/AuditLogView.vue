<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { X, RefreshCw } from 'lucide-vue-next'
import { adminsApi, type AdminUser } from '@/api/admins'
import { auditApi, type AuditLog } from '@/api/audit'
import { clientsApi, type OAuthClient } from '@/api/clients'
import { usersApi, type User } from '@/api/users'
import PageHeader from '@/components/shared/PageHeader.vue'

const route = useRoute()
const router = useRouter()
const tenantId = route.params.tenantId as string

const logs = ref<AuditLog[]>([])
const loading = ref(true)
const adminMap = ref<Record<string, AdminUser>>({})
const userMap = ref<Record<string, User>>({})
const clientMap = ref<Record<string, OAuthClient>>({})

const currentPage = ref(1)
const pageLimit = ref(20)
const total = ref(0)
const totalPages = computed(() => Math.ceil(total.value / pageLimit.value))

// Filter state
const filterAction = ref('')
const filterSuccess = ref('') // '' | 'true' | 'false'
const filterActorType = ref('')
const filterFrom = ref('')
const filterTo = ref('')

const ACTION_OPTIONS = [
  { label: '전체 액션', value: '' },
  { label: '로그인 성공', value: 'LOGIN.SUCCESS' },
  { label: '로그인 실패', value: 'LOGIN.FAILURE' },
  { label: '사용자 생성', value: 'USER.CREATED' },
  { label: '사용자 수정', value: 'USER.UPDATED' },
  { label: '사용자 활성화', value: 'USER.ACTIVATED' },
  { label: '사용자 비활성화', value: 'USER.DEACTIVATED' },
  { label: '사용자 잠금', value: 'USER.LOCKED' },
  { label: '토큰 발급', value: 'TOKEN.ISSUED' },
  { label: '토큰 갱신', value: 'TOKEN.REFRESHED' },
  { label: '토큰 폐기', value: 'TOKEN.REVOKED' },
  { label: '인증 코드 발급', value: 'CODE.ISSUED' },
  { label: '외부 인증 오류', value: 'EXTERNAL_AUTH.ERROR' },
]

const ACTOR_TYPE_OPTIONS = [
  { label: '전체 행위자 유형', value: '' },
  { label: '사용자', value: 'user' },
  { label: '관리자', value: 'admin' },
  { label: '시스템', value: 'system' },
  { label: '클라이언트', value: 'client' },
]

const visiblePages = computed(() => {
  const pages: (number | '...')[] = []
  const delta = 2
  const left = currentPage.value - delta
  const right = currentPage.value + delta

  for (let i = 1; i <= totalPages.value; i++) {
    if (i === 1 || i === totalPages.value || (i >= left && i <= right)) {
      pages.push(i)
    } else if (pages.length > 0 && pages[pages.length - 1] !== '...') {
      pages.push('...')
    }
  }
  return pages
})

const activeFilters = computed(() => {
  const filters = []
  if (filterAction.value) {
    const option = ACTION_OPTIONS.find((o) => o.value === filterAction.value)
    filters.push({ key: 'action', label: option?.label || filterAction.value })
  }
  if (filterSuccess.value !== '') {
    filters.push({
      key: 'success',
      label: filterSuccess.value === 'true' ? '성공' : '실패',
    })
  }
  if (filterActorType.value) {
    const option = ACTOR_TYPE_OPTIONS.find((o) => o.value === filterActorType.value)
    filters.push({ key: 'actorType', label: option?.label || filterActorType.value })
  }
  if (filterFrom.value || filterTo.value) {
    filters.push({
      key: 'date',
      label: `${filterFrom.value || '...'} ~ ${filterTo.value || '...'}`,
    })
  }
  return filters
})

const actionColors: Record<string, string> = {
  'LOGIN.SUCCESS': 'bg-green-100 text-green-700',
  'LOGIN.FAILURE': 'bg-red-100 text-red-700',
  'USER.LOCKED': 'bg-red-100 text-red-700',
  'TOKEN.ISSUED': 'bg-blue-100 text-blue-700',
  'TOKEN.REFRESHED': 'bg-blue-100 text-blue-700',
  'TOKEN.REVOKED': 'bg-orange-100 text-orange-700',
  'CODE.ISSUED': 'bg-indigo-100 text-indigo-700',
}

function indexById<T>(items: T[], getId: (item: T) => string): Record<string, T> {
  return items.reduce<Record<string, T>>((acc, item) => {
    acc[getId(item)] = item
    return acc
  }, {})
}

async function loadPage() {
  loading.value = true
  try {
    const logsResult = await auditApi.findAll(tenantId, {
      page: currentPage.value,
      limit: pageLimit.value,
      action: filterAction.value || undefined,
      success: filterSuccess.value !== '' ? filterSuccess.value === 'true' : undefined,
      actorType: filterActorType.value || undefined,
      from: filterFrom.value || undefined,
      to: filterTo.value || undefined,
    })
    logs.value = logsResult.data?.items || []
    total.value = logsResult.data?.total || 0
  } finally {
    loading.value = false
  }
}

function syncUrl() {
  router.replace({
    query: {
      ...route.query,
      page: currentPage.value > 1 ? currentPage.value : undefined,
      limit: pageLimit.value !== 20 ? pageLimit.value : undefined,
      action: filterAction.value || undefined,
      success: filterSuccess.value || undefined,
      actorType: filterActorType.value || undefined,
      from: filterFrom.value || undefined,
      to: filterTo.value || undefined,
    },
  })
}

function onFilterChange() {
  currentPage.value = 1
  syncUrl()
  loadPage()
}

function removeFilter(key: string) {
  if (key === 'action') filterAction.value = ''
  if (key === 'success') filterSuccess.value = ''
  if (key === 'actorType') filterActorType.value = ''
  if (key === 'date') {
    filterFrom.value = ''
    filterTo.value = ''
  }
  onFilterChange()
}

function resetFilters() {
  filterAction.value = ''
  filterSuccess.value = ''
  filterActorType.value = ''
  filterFrom.value = ''
  filterTo.value = ''
  onFilterChange()
}

function refresh() {
  loadPage()
}

async function goToPage(page: number) {
  if (page < 1 || page > totalPages.value) return
  currentPage.value = page
  syncUrl()
  await loadPage()
}

async function changeLimit(newLimit: number) {
  pageLimit.value = newLimit
  currentPage.value = 1
  syncUrl()
  await loadPage()
}

function formatActor(log: AuditLog): string {
  if (log.actorType === 'admin') {
    const name = log.actorId
      ? adminMap.value[log.actorId]?.name ?? adminMap.value[log.actorId]?.email ?? log.actorId
      : ''
    return `관리자${name && ` (${name})`}`
  }

  if (log.actorType === 'user') {
    const name = log.actorId
      ? userMap.value[log.actorId]?.name ?? userMap.value[log.actorId]?.email ?? log.actorId
      : ''
    return `사용자${name && ` (${name})`}`
  }

  if (log.actorType === 'client') {
    const name = log.actorId ? clientMap.value[log.actorId]?.name ?? log.actorId : ''
    return `클라이언트${name && ` (${name})`}`
  }

  if (log.actorType === 'system') {
    return '시스템'
  }

  return log.actorId ?? '—'
}

function formatTarget(log: AuditLog): string {
  if (!log.targetType && !log.targetId) return '—'

  if (log.targetType === 'admin') {
    const name = log.targetId
      ? adminMap.value[log.targetId]?.name ?? adminMap.value[log.targetId]?.email ?? log.targetId
      : ''
    return `관리자${name && ` (${name})`}`
  }

  if (log.targetType === 'user') {
    const name = log.targetId
      ? userMap.value[log.targetId]?.name ?? userMap.value[log.targetId]?.email ?? log.targetId
      : ''
    return `사용자${name && ` (${name})`}`
  }

  if (log.targetType === 'oauth_client') {
    const name = log.targetId ? clientMap.value[log.targetId]?.name ?? log.targetId : ''
    return `클라이언트${name && ` (${name})`}`
  }

  if (log.targetType === 'auth_code') {
    const value = log.targetId ?? ''
    return `인증 코드${value && ` (${value})`}`
  }

  if (log.targetType === 'access_token') {
    const value = log.targetId ?? ''
    return `액세스 토큰${value && ` (${value})`}`
  }

  if (log.targetType === 'refresh_token') {
    const value = log.targetId ?? ''
    return `리프레시 토큰${value && ` (${value})`}`
  }

  if (log.targetType === 'external_auth_provider') {
    const value = log.targetId ?? ''
    return `외부 인증 제공자${value && ` (${value})`}`
  }

  return log.targetId ?? '—'
}

onMounted(async () => {
  currentPage.value = Number(route.query.page ?? 1)
  pageLimit.value = Number(route.query.limit ?? 20)
  filterAction.value = String(route.query.action ?? '')
  filterSuccess.value = String(route.query.success ?? '')
  filterActorType.value = String(route.query.actorType ?? '')
  filterFrom.value = String(route.query.from ?? '')
  filterTo.value = String(route.query.to ?? '')

  try {
    const [adminsResult, usersResult, clientsResult] = await Promise.allSettled([
      adminsApi.findAll(),
      usersApi.findAll(tenantId, { limit: 1000 }),
      clientsApi.findAll(tenantId),
    ])

    if (adminsResult.status === 'fulfilled') {
      adminMap.value = indexById(adminsResult.value.data?.items || [], (admin) => admin.id)
    }
    if (usersResult.status === 'fulfilled') {
      userMap.value = indexById(usersResult.value.data.items, (user) => user.id)
    }
    if (clientsResult.status === 'fulfilled') {
      clientMap.value = indexById(clientsResult.value.data.items, (client) => client.clientId)
    }
  } finally {
    await loadPage()
  }
})
</script>

<template>
  <div>
    <PageHeader title="감사 로그" description="테넌트 내 주요 이벤트 기록입니다." />

    <div class="mb-4 flex flex-col lg:flex-row lg:items-center gap-3">
      <!-- Date Range -->
      <div class="flex items-center gap-2">
        <input
          v-model="filterFrom"
          type="date"
          @change="onFilterChange"
          class="block w-full lg:w-36 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
        />
        <span class="text-gray-400">~</span>
        <input
          v-model="filterTo"
          type="date"
          :min="filterFrom"
          @change="onFilterChange"
          class="block w-full lg:w-36 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      <!-- Selects and Buttons -->
      <div class="flex flex-1 flex-col sm:flex-row items-center gap-3">
        <div class="grid grid-cols-3 gap-3 flex-1 w-full">
          <select
            v-model="filterAction"
            @change="onFilterChange"
            class="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option v-for="opt in ACTION_OPTIONS" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>

          <select
            v-model="filterSuccess"
            @change="onFilterChange"
            class="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">전체 결과</option>
            <option value="true">성공</option>
            <option value="false">실패</option>
          </select>

          <select
            v-model="filterActorType"
            @change="onFilterChange"
            class="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option v-for="opt in ACTOR_TYPE_OPTIONS" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>

        <div class="flex items-center gap-3 ml-auto lg:ml-0 self-end lg:self-center">
          <button
            v-if="activeFilters.length > 0"
            @click="resetFilters"
            class="text-xs text-gray-500 hover:text-indigo-600 font-medium whitespace-nowrap"
          >
            필터 초기화
          </button>

          <button
            @click="refresh"
            :disabled="loading"
            class="p-2 rounded-lg border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            title="새로고침"
          >
            <RefreshCw class="w-5 h-5" :class="{ 'animate-spin': loading }" />
          </button>
        </div>
      </div>
    </div>

    <!-- Active Filters -->
    <div v-if="activeFilters.length > 0" class="mb-4 flex flex-wrap gap-2 pt-1">
      <div
        v-for="filter in activeFilters"
        :key="filter.key"
        class="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-700 rounded-md text-xs font-medium border border-indigo-100"
      >
        {{ filter.label }}
        <button @click="removeFilter(filter.key)" class="hover:text-indigo-900">
          <X class="w-3 h-3" />
        </button>
      </div>
    </div>

    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div v-if="loading && logs.length === 0" class="p-8 text-center text-sm text-gray-400">불러오는 중...</div>
      <div v-else-if="logs.length === 0" class="p-8 text-center text-sm text-gray-400">
        기록이 없습니다.
      </div>
      <div v-else>
        <div class="overflow-x-auto">
          <table class="w-full text-sm min-w-[800px]">
            <thead class="bg-gray-50 border-b border-gray-200">
              <tr>
                <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">액션</th>
                <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">행위자</th>
                <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">행위자 유형</th>
                <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">대상</th>
                <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">대상 유형</th>
                <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">결과</th>
                <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">IP</th>
                <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">시각</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100" :class="{ 'opacity-50': loading }">
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
                <td class="px-4 py-3 text-gray-500 text-xs">{{ formatTarget(log) }}</td>
                <td class="px-4 py-3 text-gray-500 text-xs">{{ log.targetType ?? '—' }}</td>
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

        <!-- Pagination -->
        <div class="px-4 py-4 bg-gray-50 border-t border-gray-200 grid grid-cols-3 items-center">
          <div class="text-xs text-gray-500">
            총 <span class="font-medium text-gray-900">{{ total }}</span>건
          </div>

          <nav class="flex items-center justify-center space-x-1">
            <button
              @click="goToPage(currentPage - 1)"
              :disabled="currentPage === 1 || loading"
              class="p-1 rounded-md border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span class="sr-only">이전</span>
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <template v-for="(page, idx) in visiblePages" :key="idx">
              <span v-if="page === '...'" class="px-2 text-gray-400">...</span>
              <button
                v-else
                @click="goToPage(page as number)"
                :disabled="loading"
                class="px-3 py-1 rounded-md text-xs font-medium transition-colors"
                :class="[
                  currentPage === page
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                ]"
              >
                {{ page }}
              </button>
            </template>

            <button
              @click="goToPage(currentPage + 1)"
              :disabled="currentPage === totalPages || loading"
              class="p-1 rounded-md border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span class="sr-only">다음</span>
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </nav>

          <div class="flex items-center justify-end space-x-2">
            <span class="text-xs text-gray-500">표시:</span>
            <select
              :value="pageLimit"
              @change="changeLimit(Number(($event.target as HTMLSelectElement).value))"
              class="text-xs border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 py-1"
            >
              <option :value="20">20건씩</option>
              <option :value="50">50건씩</option>
              <option :value="100">100건씩</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
