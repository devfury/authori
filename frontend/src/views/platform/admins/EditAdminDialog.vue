<script setup lang="ts">
import { ref, watch } from 'vue'
import { adminsApi, type AdminUser } from '@/api/admins'
import { tenantsApi, type Tenant } from '@/api/tenants'
import { AdminRole, TenantStatus } from '@/api/enums'

const props = defineProps<{
  open: boolean
  admin: AdminUser | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'updated'): void
}>()

const email = ref('')
const name = ref('')
const password = ref('')
const role = ref<AdminRole>(AdminRole.TENANT_ADMIN)
const tenantId = ref('')
const tenants = ref<Tenant[]>([])
const error = ref('')
const loading = ref(false)

watch(
  () => props.open,
  async (newOpen) => {
    if (newOpen && props.admin) {
      email.value = props.admin.email
      name.value = props.admin.name || ''
      password.value = ''
      role.value = props.admin.role
      tenantId.value = props.admin.tenantId || ''
      error.value = ''

      if (tenants.value.length === 0) {
        const { data } = await tenantsApi.findAll({ limit: 1000 })
        tenants.value = data.items.filter((t) => t.status === TenantStatus.ACTIVE)
      }
    }
  },
)

async function submit() {
  if (!props.admin) return
  error.value = ''
  loading.value = true
  try {
    await adminsApi.update(props.admin.id, {
      email: email.value,
      name: name.value || undefined,
      password: password.value || undefined,
      role: role.value,
      tenantId: role.value === AdminRole.TENANT_ADMIN ? tenantId.value : undefined,
    })
    emit('updated')
    emit('close')
  } catch (e: unknown) {
    const axiosError = e as { response?: { data?: { message?: string } } }
    error.value = axiosError.response?.data?.message ?? '수정 중 오류가 발생했습니다.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
    @click.self="emit('close')"
  >
    <div class="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
      <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 class="text-lg font-semibold text-gray-900">관리자 정보 수정</h3>
        <button
          @click="emit('close')"
          class="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <form @submit.prevent="submit" class="p-6 space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">이름</label>
          <input
            v-model="name"
            type="text"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="홍길동"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">이메일</label>
          <input
            v-model="email"
            type="email"
            required
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            비밀번호 <span class="text-xs text-gray-400">(변경 시에만 입력, 10자 이상)</span>
          </label>
          <input
            v-model="password"
            type="password"
            minlength="10"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">역할</label>
          <select
            v-model="role"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
          >
            <option :value="AdminRole.PLATFORM_ADMIN">플랫폼 관리자</option>
            <option :value="AdminRole.TENANT_ADMIN">테넌트 관리자</option>
          </select>
        </div>
        <div v-if="role === AdminRole.TENANT_ADMIN">
          <label class="block text-sm font-medium text-gray-700 mb-1">테넌트</label>
          <select
            v-model="tenantId"
            required
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
          >
            <option value="" disabled>테넌트 선택</option>
            <option v-for="t in tenants" :key="t.id" :value="t.id">
              {{ t.name }} ({{ t.slug }})
            </option>
          </select>
        </div>

        <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

        <div class="flex justify-end gap-3 pt-2">
          <button
            type="button"
            class="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            @click="emit('close')"
          >
            취소
          </button>
          <button
            type="submit"
            :disabled="loading"
            class="px-4 py-2 text-sm bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {{ loading ? '저장 중...' : '저장' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
