<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { adminsApi } from '@/api/admins'
import { tenantsApi, type Tenant } from '@/api/tenants'
import { AdminRole, TenantStatus } from '@/api/enums'
import PageHeader from '@/components/shared/PageHeader.vue'
import TenantMultiSelect from '@/components/shared/TenantMultiSelect.vue'

const router = useRouter()

const email = ref('')
const name = ref('')
const password = ref('')
const passwordConfirm = ref('')
const role = ref<typeof AdminRole[keyof typeof AdminRole]>(AdminRole.TENANT_ADMIN)
const tenantIds = ref<string[]>([])
const tenants = ref<Tenant[]>([])
const error = ref('')
const loading = ref(false)

onMounted(async () => {
  const { data } = await tenantsApi.findAll({ limit: 1000 })
  tenants.value = data.items.filter((t) => t.status === TenantStatus.ACTIVE)
})

async function submit() {
  error.value = ''
  if (password.value !== passwordConfirm.value) {
    error.value = '비밀번호가 일치하지 않습니다.'
    return
  }
  if (role.value === AdminRole.TENANT_ADMIN && tenantIds.value.length === 0) {
    error.value = '테넌트를 최소 1개 선택하세요.'
    return
  }
  loading.value = true
  try {
    await adminsApi.create({
      email: email.value,
      name: name.value || undefined,
      password: password.value,
      role: role.value,
      tenantIds: role.value === AdminRole.TENANT_ADMIN ? tenantIds.value : undefined,
    })
    router.push('/admin/admins')
  } catch (e: unknown) {
    const axiosError = e as { response?: { data?: { message?: string } } }
    error.value = axiosError.response?.data?.message ?? '생성 중 오류가 발생했습니다.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="max-w-lg">
    <PageHeader title="관리자 생성" />

    <div class="bg-white rounded-xl border border-gray-200 p-6">
      <form class="space-y-4" @submit.prevent="submit">
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
            비밀번호 <span class="text-xs text-gray-400">(10자 이상)</span>
          </label>
          <input
            v-model="password"
            type="password"
            required
            minlength="10"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            비밀번호 확인
          </label>
          <input
            v-model="passwordConfirm"
            type="password"
            required
            minlength="10"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            :class="{ 'border-red-400 focus:ring-red-400': passwordConfirm && password !== passwordConfirm }"
          />
          <p v-if="passwordConfirm && password !== passwordConfirm" class="text-xs text-red-500 mt-1">
            비밀번호가 일치하지 않습니다.
          </p>
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
          <p class="text-xs text-gray-400 mb-2">여러 테넌트를 배정할 수 있습니다.</p>
          <TenantMultiSelect v-model="tenantIds" :tenants="tenants" />
        </div>

        <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

        <div class="flex justify-end gap-3 pt-2">
          <button
            type="button"
            class="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            @click="router.back()"
          >
            취소
          </button>
          <button
            type="submit"
            :disabled="loading"
            class="px-4 py-2 text-sm bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {{ loading ? '생성 중...' : '생성' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
