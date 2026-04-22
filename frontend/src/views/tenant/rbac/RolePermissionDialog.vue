<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Search, X } from 'lucide-vue-next'
import { rbacApi, type Role, type Permission } from '@/api/rbac'

const props = defineProps<{
  open: boolean
  tenantId: string
  role: Role
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const allPermissions = ref<Permission[]>([])
const selectedPermissionIds = ref<string[]>([])
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const search = ref('')

const filteredPermissions = computed(() => {
  if (!search.value) return allPermissions.value
  const s = search.value.toLowerCase()
  return allPermissions.value.filter(
    (p) => p.name.toLowerCase().includes(s) || p.displayName.toLowerCase().includes(s),
  )
})

async function loadData() {
  loading.value = true
  error.value = ''
  try {
    const [allRes, roleRes] = await Promise.all([
      rbacApi.findPermissions(props.tenantId),
      rbacApi.getRolePermissions(props.tenantId, props.role.id),
    ])
    allPermissions.value = allRes.data || []
    selectedPermissionIds.value = (roleRes.data || []).map((p) => p.id)
  } catch (e: unknown) {
    console.error('[RolePermissionDialog] loadData failed', e)
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

function togglePermission(id: string) {
  const index = selectedPermissionIds.value.indexOf(id)
  if (index === -1) {
    selectedPermissionIds.value.push(id)
  } else {
    selectedPermissionIds.value.splice(index, 1)
  }
}

async function save() {
  saving.value = true
  error.value = ''
  try {
    await rbacApi.setRolePermissions(props.tenantId, props.role.id, selectedPermissionIds.value)
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
          <h3 class="text-lg font-semibold text-gray-900">역할 권한 설정</h3>
          <p class="text-sm text-gray-500">{{ role.displayName }} ({{ role.name }})</p>
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
            placeholder="권한 이름으로 검색..."
          />
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-4 min-h-[300px]">
        <div v-if="loading" class="flex items-center justify-center h-full text-gray-400 text-sm">불러오는 중...</div>
        <div v-else-if="allPermissions.length === 0" class="flex items-center justify-center h-full text-gray-400 text-sm">
          등록된 권한이 없습니다. 먼저 권한을 생성해주세요.
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="p in filteredPermissions"
            :key="p.id"
            class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
            :class="[
              selectedPermissionIds.includes(p.id)
                ? 'bg-indigo-50 border-indigo-200'
                : 'bg-white border-gray-100 hover:bg-gray-50',
            ]"
            @click="togglePermission(p.id)"
          >
            <div
              class="w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors"
              :class="[
                selectedPermissionIds.includes(p.id)
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'bg-white border-gray-300',
              ]"
            >
              <svg v-if="selectedPermissionIds.includes(p.id)" class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fill-rule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clip-rule="evenodd"
                ></path>
              </svg>
            </div>
            <div class="min-w-0">
              <div class="text-sm font-medium text-gray-900 truncate">{{ p.displayName }}</div>
              <div class="text-xs text-gray-500 font-mono truncate">{{ p.name }}</div>
            </div>
          </div>
          <div v-if="filteredPermissions.length === 0" class="text-center py-8 text-sm text-gray-400">
            검색 결과가 없습니다.
          </div>
        </div>
      </div>

      <div class="px-6 py-4 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
        <div class="text-xs text-gray-500">선택됨: {{ selectedPermissionIds.length }}개</div>
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
