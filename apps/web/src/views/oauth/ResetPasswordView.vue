<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, type LocationQueryValue } from 'vue-router'
import { oauthApi } from '@/api/oauth'

const route = useRoute()

function getQueryValue(value: LocationQueryValue | LocationQueryValue[] | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

const token = getQueryValue(route.query.token)
const tenantSlug = getQueryValue(route.query.tenantSlug)

type State = 'form' | 'success' | 'error'
const state = ref<State>(token && tenantSlug ? 'form' : 'error')
const errorMessage = ref(token && tenantSlug ? '' : '잘못된 재설정 링크입니다.')

const newPassword = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const formError = ref('')

async function submit() {
  if (!token || !tenantSlug) return

  if (newPassword.value !== confirmPassword.value) {
    formError.value = '비밀번호가 일치하지 않습니다.'
    return
  }

  formError.value = ''
  loading.value = true
  try {
    await oauthApi.confirmPasswordReset(tenantSlug, token, newPassword.value)
    state.value = 'success'
  } catch (e: any) {
    const msg = e.response?.data?.message ?? ''
    if (msg === 'token_expired') {
      formError.value = '재설정 링크가 만료되었습니다. 다시 요청해 주세요.'
    } else if (msg === 'invalid_token') {
      formError.value = '유효하지 않은 재설정 링크입니다.'
    } else if (msg === 'password_too_short') {
      formError.value = '비밀번호가 너무 짧습니다. 더 긴 비밀번호를 입력해 주세요.'
    } else {
      formError.value = '비밀번호 재설정 중 오류가 발생했습니다.'
    }
  } finally {
    loading.value = false
  }
}

const loginRoute = { name: 'oauth-login', query: tenantSlug ? { tenantSlug } : {} }
const forgotPasswordRoute = { name: 'oauth-forgot-password', query: tenantSlug ? { tenantSlug } : {} }
</script>

<template>
  <div class="text-center py-4">
    <!-- 입력 폼 -->
    <template v-if="state === 'form'">
      <h2 class="text-xl font-bold text-gray-800 mb-2">새 비밀번호 설정</h2>
      <p class="text-gray-600 mb-6 text-sm">사용할 새 비밀번호를 입력해 주세요.</p>

      <form class="space-y-4 text-left" @submit.prevent="submit">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">새 비밀번호</label>
          <input
            v-model="newPassword"
            type="password"
            required
            autofocus
            placeholder="••••••••"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">새 비밀번호 확인</label>
          <input
            v-model="confirmPassword"
            type="password"
            required
            placeholder="••••••••"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent"
          />
        </div>

        <p v-if="formError" class="text-sm text-red-600 text-center">{{ formError }}</p>

        <button
          type="submit"
          :disabled="loading"
          class="w-full py-2 px-4 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
          style="background-color: var(--auth-primary-color, #4f46e5)"
        >
          {{ loading ? '변경 중...' : '비밀번호 변경' }}
        </button>
      </form>
    </template>

    <!-- 성공 -->
    <template v-else-if="state === 'success'">
      <div class="mb-4 flex justify-center">
        <div class="bg-green-100 p-3 rounded-full">
          <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </div>
      <h2 class="text-xl font-bold text-gray-800 mb-2">비밀번호 변경 완료</h2>
      <p class="text-gray-600 mb-6">비밀번호가 변경되었습니다. 다시 로그인해 주세요.</p>
      <RouterLink
        :to="loginRoute"
        class="inline-block py-2 px-6 text-white text-sm font-medium rounded-lg transition-colors"
        style="background-color: var(--auth-primary-color, #4f46e5)"
      >
        로그인하러 가기
      </RouterLink>
    </template>

    <!-- 잘못된 링크 -->
    <template v-else>
      <div class="mb-4 flex justify-center">
        <div class="bg-red-100 p-3 rounded-full">
          <svg class="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
      </div>
      <h2 class="text-xl font-bold text-gray-800 mb-2">재설정 실패</h2>
      <p class="text-gray-600 mb-6">{{ errorMessage }}</p>
      <RouterLink
        :to="forgotPasswordRoute"
        class="inline-block py-2 px-6 text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
      >
        재설정 다시 요청하기
      </RouterLink>
    </template>
  </div>
</template>
