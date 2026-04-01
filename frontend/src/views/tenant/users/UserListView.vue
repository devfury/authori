<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Plus, Search, RefreshCw } from 'lucide-vue-next'
import { usersApi, type User } from '@/api/users'
import { UserStatus } from '@/api/enums'
import PageHeader from '@/components/shared/PageHeader.vue'
import StatusBadge from '@/components/shared/StatusBadge.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'

const route = useRoute()
const router = useRouter()
const tenantId = route.params.tenantId as string

const users = ref<User[]>([])
const loading = ref(true)
const deactivateTarget = ref<User | null>(null)

// Pagination state
const currentPage = ref(1)
const pageLimit = ref(20)
const total = ref(0)
const totalPages = computed(() => Math.ceil(total.value / pageLimit.value))

// Search/Filter state
const searchInput = ref('')
const searchQuery = ref('')
const statusFilter = ref<string>('')

function normalizeStatusFilter(value: unknown): string {
  return Object.values(UserStatus).includes(value as UserStatus) ? String(value) : ''
}

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

async function loadPage() {
  loading.value = true
  try {
    const { data } = await usersApi.findAll(tenantId, {
      page: currentPage.value,
      limit: pageLimit.value,
      search: searchQuery.value || undefined,
      status: (statusFilter.value as UserStatus) || undefined,
    })
    users.value = data?.items || []
    total.value = data?.total || 0
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
      search: searchQuery.value || undefined,
      status: statusFilter.value || undefined,
    },
  })
}

let debounceTimer: ReturnType<typeof setTimeout>
function onSearchInput() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    searchQuery.value = searchInput.value
    currentPage.value = 1
    syncUrl()
    loadPage()
  }, 300)
}

function onStatusChange() {
  currentPage.value = 1
  syncUrl()
  loadPage()
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

async function confirmDeactivate() {
  if (!deactivateTarget.value) return
  await usersApi.deactivate(tenantId, deactivateTarget.value.id)
  deactivateTarget.value = null
  await loadPage()
}

onMounted(() => {
  currentPage.value = Number(route.query.page ?? 1)
  pageLimit.value = Number(route.query.limit ?? 20)
  searchQuery.value = String(route.query.search ?? '')
  searchInput.value = searchQuery.value
  statusFilter.value = normalizeStatusFilter(route.query.status)
  loadPage()
})
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

    <div class="mb-4 flex flex-col sm:flex-row gap-3">
      <div class="relative flex-1">
        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search class="h-4 w-4 text-gray-400" />
        </div>
        <input
          v-model="searchInput"
          type="text"
          placeholder="이메일 또는 이름으로 검색"
          class="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
          @input="onSearchInput"
        />
      </div>
      <div class="w-full sm:w-40 flex gap-2">
        <select
          v-model="statusFilter"
          class="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
          @change="onStatusChange"
        >
          <option value="">상태 (전체)</option>
          <option :value="UserStatus.ACTIVE">활성</option>
          <option :value="UserStatus.INACTIVE">비활성</option>
          <option :value="UserStatus.LOCKED">잠김</option>
        </select>
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

    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div v-if="loading && users.length === 0" class="p-8 text-center text-sm text-gray-400">불러오는 중...</div>
      <div v-else-if="users.length === 0" class="p-8 text-center text-sm text-gray-400">
        등록된 사용자가 없습니다.
      </div>
      <div v-else>
        <div class="overflow-x-auto">
          <table class="w-full text-sm min-w-[800px]">
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
          <tbody class="divide-y divide-gray-100" :class="{ 'opacity-50': loading }">
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

          <!-- Pagination -->
          <div class="px-4 py-4 bg-gray-50 border-t border-gray-200 grid grid-cols-3 items-center">          <div class="text-xs text-gray-500">
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
