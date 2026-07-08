<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, type LocationQueryValue } from 'vue-router'
import { oauthApi } from '@/api/oauth'

const route = useRoute()

function getQueryValue(value: LocationQueryValue | LocationQueryValue[] | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

const tenantSlug = getQueryValue(route.query.tenantSlug)

type State = 'form' | 'sent' | 'mail_delivery_failed'
const state = ref<State>('form')
const email = ref('')
const loading = ref(false)
const errorMessage = ref('')

async function submit() {
  if (!tenantSlug) {
    errorMessage.value = '잘못된 접근입니다. 올바른 링크를 통해 접속하세요.'
    return
  }

  errorMessage.value = ''
  loading.value = true
  try {
    const { data } = await oauthApi.requestPasswordReset(tenantSlug, email.value)
    state.value = data.status
  } catch {
    errorMessage.value = '요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
  } finally {
    loading.value = false
  }
}

const loginRoute = { name: 'oauth-login', query: tenantSlug ? { tenantSlug } : {} }
</script>

<template>
  <div class="text-center py-4">
    <!-- 입력 폼 -->
    <template v-if="state === 'form'">
      <h2 class="text-xl font-bold text-gray-800 mb-2">비밀번호 재설정</h2>
      <p class="text-gray-600 mb-6 text-sm">가입 시 사용한 이메일 주소를 입력하시면 재설정 링크를 보내드립니다.</p>

      <div v-if="!tenantSlug" class="text-center text-sm text-red-600">
        잘못된 접근입니다. 올바른 링크를 통해 접속하세요.
      </div>

      <form v-else class="space-y-4 text-left" @submit.prevent="submit">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">이메일</label>
          <input
            v-model="email"
            type="email"
            required
            autofocus
            placeholder="user@example.com"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent"
          />
        </div>

        <p v-if="errorMessage" class="text-sm text-red-600 text-center">{{ errorMessage }}</p>

        <button
          type="submit"
          :disabled="loading"
          class="w-full py-2 px-4 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
          style="background-color: var(--auth-primary-color, #4f46e5)"
        >
          {{ loading ? '요청 중...' : '재설정 메일 보내기' }}
        </button>

        <p class="text-center text-sm text-gray-500 mt-4">
          <RouterLink
            :to="loginRoute"
            class="font-medium hover:underline"
            style="color: var(--auth-primary-color, #4f46e5)"
          >
            로그인으로 돌아가기
          </RouterLink>
        </p>
      </form>
    </template>

    <!-- 발송 완료 -->
    <template v-else-if="state === 'sent'">
      <div class="mb-4 flex justify-center">
        <div class="bg-green-100 p-3 rounded-full">
          <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </div>
      <h2 class="text-xl font-bold text-gray-800 mb-2">메일 발송 완료</h2>
      <p class="text-gray-600 mb-6">재설정 메일을 보냈습니다. 메일함을 확인해 주세요.</p>
      <RouterLink
        :to="loginRoute"
        class="inline-block py-2 px-6 text-white text-sm font-medium rounded-lg transition-colors"
        style="background-color: var(--auth-primary-color, #4f46e5)"
      >
        로그인으로 돌아가기
      </RouterLink>
    </template>

    <!-- 메일 발송 실패 -->
    <template v-else>
      <div class="mb-4 flex justify-center">
        <div class="bg-red-100 p-3 rounded-full">
          <svg class="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
      </div>
      <h2 class="text-xl font-bold text-gray-800 mb-2">메일 발송 실패</h2>
      <p class="text-gray-600 mb-6">
        현재 메일 발송이 불가하여 재설정을 진행할 수 없습니다. 잠시 후 다시 시도하거나 관리자에게 문의해 주세요.
      </p>
      <RouterLink
        :to="loginRoute"
        class="inline-block py-2 px-6 text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
      >
        로그인으로 돌아가기
      </RouterLink>
    </template>
  </div>
</template>
