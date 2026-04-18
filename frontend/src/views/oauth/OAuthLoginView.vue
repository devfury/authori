<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, type LocationQueryValue } from 'vue-router'
import type { LoginBranding } from '@/api/clients'
import { oauthApi } from '@/api/oauth'

const route = useRoute()

function getQueryValue(value: LocationQueryValue | LocationQueryValue[] | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

const requestId = getQueryValue(route.query.requestId)
const tenantSlug = getQueryValue(route.query.tenantSlug)
const clientId = getQueryValue(route.query.clientId)
const scopesRaw = getQueryValue(route.query.scopes)

const requestedScopes = computed(() =>
  scopesRaw ? scopesRaw.split(' ').filter(Boolean) : [],
)

const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

const branding = ref<LoginBranding>({})
const clientName = ref('')
const scopeMetadata = ref<Record<string, { displayName: string; description: string | null }>>({})
const allowRegistration = ref(false)

const registerRoute = computed(() => ({
  name: 'oauth-register',
  query: route.query,
}))

function applyBranding(b: LoginBranding) {
  const root = document.documentElement
  if (b.bgColor) {
    root.style.setProperty('--auth-bg-color', b.bgColor)
  }
  if (b.primaryColor) {
    root.style.setProperty('--auth-primary-color', b.primaryColor)
  }
}

onUnmounted(() => {
  const root = document.documentElement
  root.style.removeProperty('--auth-bg-color')
  root.style.removeProperty('--auth-primary-color')
})

onMounted(async () => {
  if (!requestId || !tenantSlug) {
    error.value = '잘못된 접근입니다. 올바른 인증 요청 링크를 통해 접속하세요.'
    return
  }

  if (!clientId) {
    return
  }

  try {
    const { data } = await oauthApi.getLoginConfig(tenantSlug, clientId)
    clientName.value = data.clientName
    branding.value = data.branding ?? {}
    allowRegistration.value = data.allowRegistration
    if (data.scopes) {
      scopeMetadata.value = data.scopes.reduce((acc, s) => {
        acc[s.name] = { displayName: s.displayName, description: s.description }
        return acc
      }, {} as Record<string, { displayName: string; description: string | null }>)
    }
    applyBranding(branding.value)
  } catch {
    // 브랜딩 로딩 실패 시 기본값 유지
  }
})

async function submit() {
  if (!tenantSlug || !requestId) return
  error.value = ''
  loading.value = true
  try {
    const { data } = await oauthApi.authorize(tenantSlug, {
      requestId,
      email: email.value,
      password: password.value,
      grantedScopes: requestedScopes.value,
    })
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
    <!-- 로고 -->
    <div v-if="branding.logoUrl" class="flex justify-center mb-5">
      <img :src="branding.logoUrl" alt="logo" class="h-12 object-contain" />
    </div>

    <!-- 요청 정보 -->
    <div v-if="clientName" class="mb-6 text-center">
      <p class="text-sm text-gray-500">
        <span class="font-semibold text-gray-800">
          {{ branding.title ?? clientName }}
        </span>
        {{ branding.title ? '' : '앱이 로그인을 요청합니다.' }}
      </p>

      <!-- 스코프 목록 -->
      <div v-if="requestedScopes.length > 0" class="mt-4 text-left border-t border-gray-100 pt-4">
        <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">허용할 권한</p>
        <div class="space-y-3 px-1">
          <div v-for="scope in requestedScopes" :key="scope" class="flex items-start gap-2.5">
            <div
              class="mt-1 w-1.5 h-1.5 rounded-full shrink-0"
              :style="{ backgroundColor: branding.primaryColor || '#4f46e5' }"
            />
            <div>
              <p class="text-sm font-medium text-gray-800">
                {{ scopeMetadata[scope]?.displayName || scope }}
              </p>
              <p v-if="scopeMetadata[scope]?.description" class="text-xs text-gray-500 leading-normal">
                {{ scopeMetadata[scope].description }}
              </p>
            </div>
          </div>
        </div>
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
          class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent"
          :style="branding.primaryColor ? { '--tw-ring-color': branding.primaryColor } : {}"
        />
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
        <input
          v-model="password"
          type="password"
          required
          placeholder="••••••••"
          class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent"
          :style="branding.primaryColor ? { '--tw-ring-color': branding.primaryColor } : {}"
        />
      </div>

      <p v-if="error" class="text-sm text-red-600 text-center">{{ error }}</p>

      <button
        type="submit"
        :disabled="loading"
        class="w-full py-2 px-4 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
        style="background-color: var(--auth-primary-color, #4f46e5)"
      >
        {{ loading ? '로그인 중...' : '로그인' }}
      </button>

      <p v-if="allowRegistration" class="text-center text-sm text-gray-500 mt-4">
        계정이 없으신가요?
        <RouterLink
          :to="registerRoute"
          class="font-medium hover:underline"
          style="color: var(--auth-primary-color, #4f46e5)"
        >
          회원가입
        </RouterLink>
      </p>
    </form>
  </div>
</template>
