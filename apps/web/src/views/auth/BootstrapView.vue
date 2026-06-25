<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { authApi } from '@/api/auth'

const router = useRouter()

const secret = ref('')
const email = ref('')
const password = ref('')
const error = ref('')
const success = ref(false)
const loading = ref(false)

async function submit() {
  error.value = ''
  loading.value = true
  try {
    await authApi.bootstrap({ secret: secret.value, email: email.value, password: password.value })
    success.value = true
    setTimeout(() => router.push('/admin/login'), 2000)
  } catch (e: unknown) {
    const axiosError = e as { response?: { status?: number; data?: { message?: string } } }
    if (axiosError.response?.status === 409) {
      error.value = '이미 플랫폼 관리자가 존재합니다.'
    } else if (axiosError.response?.status === 401) {
      error.value = 'PLATFORM_ADMIN_SECRET이 올바르지 않습니다.'
    } else {
      error.value = '오류가 발생했습니다. 다시 시도해주세요.'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div>
    <h2 class="text-lg font-semibold text-gray-900 mb-1">플랫폼 관리자 생성</h2>
    <p class="text-sm text-gray-500 mb-6">
      최초 1회만 실행 가능합니다. <code class="text-xs bg-gray-100 px-1 rounded">PLATFORM_ADMIN_SECRET</code> 값이 필요합니다.
    </p>

    <div
      v-if="success"
      class="p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700"
    >
      플랫폼 관리자가 생성됐습니다. 로그인 페이지로 이동합니다...
    </div>

    <form v-else class="space-y-4" @submit.prevent="submit">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">
          PLATFORM_ADMIN_SECRET
        </label>
        <input
          v-model="secret"
          type="password"
          required
          class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          placeholder=".env의 PLATFORM_ADMIN_SECRET 값"
        />
      </div>
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
        <label class="block text-sm font-medium text-gray-700 mb-1">
          비밀번호 <span class="text-xs text-gray-400">(10자 이상)</span>
        </label>
        <input
          v-model="password"
          type="password"
          required
          minlength="10"
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
        {{ loading ? '생성 중...' : '관리자 생성' }}
      </button>
    </form>

    <p class="mt-4 text-center text-xs text-gray-400">
      이미 계정이 있으신가요?
      <RouterLink to="/admin/login" class="text-indigo-600 hover:underline">로그인</RouterLink>
    </p>
  </div>
</template>
