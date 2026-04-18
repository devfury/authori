<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Search, X, ShieldCheck } from 'lucide-vue-next'
import { rbacApi, type Role } from '@/api/rbac'

const props = defineProps<{
  open: boolean
  tenantId: string
  userId: string
  userName: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'updated'): void
}>()

const allRoles = ref<Role[]>([])
const selectedRoleIds = ref<string[]>([])
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const search = ref('')

const filteredRoles = computed(() => {
  if (!search.value) return allRoles.value
  const s = search.value.toLowerCase()
  return allRoles.value.filter(
    (r) => r.name.toLowerCase().includes(s) || r.displayName.toLowerCase().includes(s),
  )
})

async function loadData() {
  loading.value = true
  error.value = ''
  try {
    const [allRes, userRes] = await Promise.all([
      rbacApi.findRoles(props.tenantId),
      rbacApi.getUserRoles(props.tenantId, props.userId),
    ])
    allRoles.value = allRes.data || []
    selectedRoleIds.value = (userRes.data || []).map((r) => r.id)
  } catch (e: unknown) {
    error.value = '데이터를 불러오는 중 오류가 발생했습니다.'
  } finally {
    loading.value = false
  }
}

watch(
  () => props.open,
  (newOpen) => {
    if (newOpen) {
      loadData()
      search.value = ''
    }
  },
  { immediate: true },
)

function toggleRole(id: string) {
  const index = selectedRoleIds.value.indexOf(id)
  if (index === -1) {
    selectedRoleIds.value.push(id)
  } else {
    selectedRoleIds.value.splice(index, 1)
  }
}

async function save() {
  saving.value = true
  error.value = ''
  try {
    await rbacApi.setUserRoles(props.tenantId, props.userId, selectedRoleIds.value)
    emit('updated')
    emit('close')
  } catch (e: unknown) {
    error.value = '저장 중 오류가 발생했습니다.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
    @click.self="emit('close')"
  >
    <div class="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
      <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
        <div>
          <h3 class="text-lg font-semibold text-gray-900">사용자 역할 설정</h3>
          <p class="text-sm text-gray-500">{{ userName }}</p>
        </div>
        <button @click="emit('close')" class="text-gray-400 hover:text-gray-600 transition-colors">
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="p-4 border-b border-gray-50 flex-shrink-0">
        <div class="relative">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            v-model="search"
            type="text"
            class="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="역할 이름으로 검색..."
          />
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-4 min-h-[300px]">
        <div v-if="loading" class="flex items-center justify-center h-full text-gray-400 text-sm">불러오는 중...</div>
        <div v-else-if="allRoles.length === 0" class="flex items-center justify-center h-full text-gray-400 text-sm">
          등록된 역할이 없습니다. 먼저 역할을 생성해주세요.
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="r in filteredRoles"
            :key="r.id"
            class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
            :class="[
              selectedRoleIds.includes(r.id)
                ? 'bg-indigo-50 border-indigo-200'
                : 'bg-white border-gray-100 hover:bg-gray-50',
            ]"
            @click="toggleRole(r.id)"
          >
            <div
              class="w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors"
              :class="[
                selectedRoleIds.includes(r.id)
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'bg-white border-gray-300',
              ]"
            >
              <svg v-if="selectedRoleIds.includes(r.id)" class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fill-rule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clip-rule="evenodd"
                ></path>
              </svg>
            </div>
            <div class="min-w-0 flex items-center gap-2">
              <ShieldCheck class="w-4 h-4 text-indigo-500 flex-shrink-0" />
              <div class="min-w-0">
                <div class="text-sm font-medium text-gray-900 truncate">{{ r.displayName }}</div>
                <div class="text-xs text-gray-500 font-mono truncate">{{ r.name }}</div>
              </div>
            </div>
          </div>
          <div v-if="filteredRoles.length === 0" class="text-center py-8 text-sm text-gray-400">
            검색 결과가 없습니다.
          </div>
        </div>
      </div>

      <div class="px-6 py-4 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
        <div class="text-xs text-gray-500">선택됨: {{ selectedRoleIds.length }}개</div>
        <div class="flex gap-3">
          <button
            type="button"
            class="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            @click="emit('close')"
          >
            취소
          </button>
          <button
            type="button"
            :disabled="saving || loading"
            class="px-4 py-2 text-sm bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            @click="save"
          >
            {{ saving ? '저장 중...' : '저장' }}
          </button>
        </div>
      </div>
      <p v-if="error" class="px-6 pb-4 text-sm text-red-600">{{ error }}</p>
    </div>
  </div>
</template>
