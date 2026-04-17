<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth.store'
import { authApi } from '@/api/auth'

const auth = useAuthStore()

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
const bootstrapNeeded = ref(false)

onMounted(async () => {
  try {
    const { data } = await authApi.bootstrapStatus()
    bootstrapNeeded.value = data.needed
  } catch {
    // 확인 실패 시 링크 숨김
  }
})

async function submit() {
  error.value = ''
  loading.value = true
  try {
    await auth.login(email.value, password.value)
  } catch (e: unknown) {
    const axiosError = e as { response?: { data?: { message?: string } } }
    if (axiosError.response?.data?.message) {
      error.value = axiosError.response.data.message
    } else {
      error.value = '이메일 또는 비밀번호가 올바르지 않습니다.'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div>
    <h2 class="text-lg font-semibold text-gray-900 mb-6">관리자 로그인</h2>

    <form class="space-y-4" @submit.prevent="submit">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">이메일</label>
        <input
          v-model="email"
          type="email"
          required
          class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          placeholder="admin@example.com"
        />
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
        <input
          v-model="password"
          type="password"
          required
          class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          placeholder="••••••••••"
        />
      </div>

      <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

      <button
        type="submit"
        :disabled="loading"
        class="w-full py-2 px-4 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {{ loading ? '로그인 중...' : '로그인' }}
      </button>
    </form>

    <p v-if="bootstrapNeeded" class="mt-4 text-center text-xs text-gray-400">
      처음 설정하시나요?
      <RouterLink to="/admin/bootstrap" class="text-indigo-600 hover:underline">
        플랫폼 관리자 생성
      </RouterLink>
    </p>
  </div>
</template>
