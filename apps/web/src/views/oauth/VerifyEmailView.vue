<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, type LocationQueryValue } from 'vue-router'
import { oauthApi } from '@/api/oauth'

const route = useRoute()

function getQueryValue(value: LocationQueryValue | LocationQueryValue[] | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

const token = getQueryValue(route.query.token)
const tenantSlug = getQueryValue(route.query.tenantSlug)

type State = 'loading' | 'success' | 'error'
const state = ref<State>('loading')
const errorMessage = ref('')
// 인증 후 서버가 결정한 복귀 목적지(BFF 자체 로그인 / 앱 진입 / 딥링크). 없으면 기본 안내.
const continueUrl = ref<string | null>(null)

onMounted(async () => {
  if (!token || !tenantSlug) {
    state.value = 'error'
    errorMessage.value = '잘못된 인증 링크입니다.'
    return
  }

  try {
    const { data } = await oauthApi.verifyEmail(tenantSlug, token)
    state.value = 'success'
    if (data.continueUrl) {
      continueUrl.value = data.continueUrl
      // 짧은 안내 노출 후 자동 이동. 수동 폴백 링크도 함께 제공한다.
      window.setTimeout(() => {
        if (continueUrl.value) window.location.href = continueUrl.value
      }, 1200)
    }
  } catch (e: any) {
    const msg = e.response?.data?.message ?? ''
    if (msg === 'token_expired') {
      errorMessage.value = '인증 링크가 만료되었습니다. 다시 회원가입을 진행해 주세요.'
    } else if (msg === 'invalid_token') {
      errorMessage.value = '유효하지 않은 인증 링크입니다.'
    } else {
      errorMessage.value = '이메일 인증 중 오류가 발생했습니다.'
    }
    state.value = 'error'
  }
})

const loginRoute = { name: 'oauth-login', query: tenantSlug ? { tenantSlug } : {} }
</script>

<template>
  <div class="text-center py-4">
    <!-- 로딩 -->
    <template v-if="state === 'loading'">
      <div class="mb-4 flex justify-center">
        <div class="animate-spin rounded-full h-10 w-10 border-2 border-gray-200 border-t-indigo-500"></div>
      </div>
      <p class="text-gray-600">이메일을 인증하는 중입니다...</p>
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
      <h2 class="text-xl font-bold text-gray-800 mb-2">이메일 인증 완료</h2>

      <!-- 서버가 복귀 목적지를 지정한 경우: 자동 이동 + 수동 폴백 -->
      <template v-if="continueUrl">
        <p class="text-gray-600 mb-6">계정이 활성화되었습니다. 로그인 화면으로 이동합니다...</p>
        <a
          :href="continueUrl"
          class="inline-block py-2 px-6 text-white text-sm font-medium rounded-lg transition-colors"
          style="background-color: var(--auth-primary-color, #4f46e5)"
        >
          지금 이동하기
        </a>
      </template>

      <!-- 목적지가 없는 경우: 기존 안내 + 테넌트 로그인 링크 -->
      <template v-else>
        <p class="text-gray-600 mb-6">계정이 활성화되었습니다. 이제 로그인하실 수 있습니다.</p>
        <RouterLink
          :to="loginRoute"
          class="inline-block py-2 px-6 text-white text-sm font-medium rounded-lg transition-colors"
          style="background-color: var(--auth-primary-color, #4f46e5)"
        >
          로그인하러 가기
        </RouterLink>
      </template>
    </template>

    <!-- 실패 -->
    <template v-else>
      <div class="mb-4 flex justify-center">
        <div class="bg-red-100 p-3 rounded-full">
          <svg class="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
      </div>
      <h2 class="text-xl font-bold text-gray-800 mb-2">인증 실패</h2>
      <p class="text-gray-600 mb-6">{{ errorMessage }}</p>
      <RouterLink
        :to="loginRoute"
        class="inline-block py-2 px-6 text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
      >
        로그인으로 돌아가기
      </RouterLink>
    </template>
  </div>
</template>
