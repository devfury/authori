<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'

const oauthHttp = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000',
  headers: { 'Content-Type': 'application/json' },
})

const route = useRoute()

const requestId = route.query.requestId as string
const tenantSlug = route.query.tenantSlug as string
const clientName = route.query.clientName as string
const scopesRaw = route.query.scopes as string

const requestedScopes = computed(() =>
  scopesRaw ? scopesRaw.split(' ').filter(Boolean) : [],
)

const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

onMounted(() => {
  if (!requestId || !tenantSlug) {
    error.value = '잘못된 접근입니다. 올바른 인증 요청 링크를 통해 접속하세요.'
  }
})

async function submit() {
  error.value = ''
  loading.value = true
  try {
    const { data } = await oauthHttp.post<{ url: string }>(
      `/t/${tenantSlug}/oauth/authorize`,
      {
        requestId,
        email: email.value,
        password: password.value,
        grantedScopes: requestedScopes.value,
      },
    )
    window.location.href = data.url
  } catch (e: unknown) {
    const axiosError = e as { response?: { data?: { message?: string } } }
    const msg = axiosError.response?.data?.message ?? ''
    if (msg === 'invalid_credentials') {
      error.value = '이메일 또는 비밀번호가 올바르지 않습니다.'
    } else if (msg === 'account_locked') {
      error.value = '계정이 잠겼습니다. 잠시 후 다시 시도하세요.'
    } else if (msg === 'invalid_request: expired or not found') {
      error.value = '인증 요청이 만료됐습니다. 앱에서 다시 시도하세요.'
    } else {
      error.value = msg || '로그인 중 오류가 발생했습니다.'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div>
    <!-- 요청 정보 -->
    <div v-if="clientName" class="mb-6 text-center">
      <p class="text-sm text-gray-500">
        <span class="font-semibold text-gray-800">{{ clientName }}</span>
        앱이 로그인을 요청합니다.
      </p>
      <div v-if="requestedScopes.length > 0" class="flex flex-wrap justify-center gap-1.5 mt-2">
        <span
          v-for="scope in requestedScopes"
          :key="scope"
          class="px-2 py-0.5 text-xs bg-indigo-50 text-indigo-600 rounded-full font-mono"
        >{{ scope }}</span>
      </div>
    </div>

    <!-- 오류: 잘못된 접근 -->
    <div v-if="!requestId || !tenantSlug" class="text-center text-sm text-red-600">
      {{ error }}
    </div>

    <!-- 로그인 폼 -->
    <form v-else class="space-y-4" @submit.prevent="submit">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">이메일</label>
        <input
          v-model="email"
          type="email"
          required
          autofocus
          placeholder="user@example.com"
          class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
        <input
          v-model="password"
          type="password"
          required
          placeholder="••••••••"
          class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      </div>

      <p v-if="error" class="text-sm text-red-600 text-center">{{ error }}</p>

      <button
        type="submit"
        :disabled="loading"
        class="w-full py-2 px-4 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        {{ loading ? '로그인 중...' : '로그인' }}
      </button>
    </form>
  </div>
</template>
