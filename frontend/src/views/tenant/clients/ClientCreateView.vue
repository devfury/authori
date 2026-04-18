<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { clientsApi } from '@/api/clients'
import { scopesApi, type TenantScope } from '@/api/scopes'
import PageHeader from '@/components/shared/PageHeader.vue'
import CopyableField from '@/components/shared/CopyableField.vue'

const router = useRouter()
const route = useRoute()
const tenantId = route.params.tenantId as string

const name = ref('')
const type = ref<'PUBLIC' | 'CONFIDENTIAL'>('PUBLIC')
const availableScopes = ref<TenantScope[]>([])
const selectedScopes = ref<string[]>([])
const redirectUrisInput = ref('http://localhost:8080/callback')

const GRANT_OPTIONS = [
  { value: 'authorization_code', label: 'Authorization Code', description: '사용자 로그인 플로우 (PKCE 포함)' },
  { value: 'refresh_token', label: 'Refresh Token', description: '액세스 토큰 갱신' },
  { value: 'client_credentials', label: 'Client Credentials', description: '서버 간 인증 (사용자 없음)' },
] as const

const selectedGrants = ref<string[]>(['authorization_code'])

const error = ref('')
const loading = ref(false)
const plainSecret = ref<string | null>(null)

onMounted(async () => {
  try {
    const { data } = await scopesApi.findAll(tenantId)
    availableScopes.value = data || []
    if (availableScopes.value.length > 0) {
      selectedScopes.value = availableScopes.value
        .filter((s) => s.isDefault)
        .map((s) => s.name)
    } else {
      selectedScopes.value = ['openid', 'profile', 'email']
    }
  } catch {
    selectedScopes.value = ['openid', 'profile', 'email']
  }
})

const grantsError = computed(() => selectedGrants.value.length === 0 ? '하나 이상의 Grant Type을 선택하세요.' : '')

async function submit() {
  if (grantsError.value) return
  error.value = ''
  loading.value = true
  try {
    const { data } = await clientsApi.create(tenantId, {
      name: name.value,
      type: type.value as 'PUBLIC' | 'CONFIDENTIAL',
      allowedScopes: selectedScopes.value,
      allowedGrants: selectedGrants.value,
      redirectUris: redirectUrisInput.value.split('\n').map((s) => s.trim()).filter(Boolean),
    })
    if (data.plainSecret) {
      plainSecret.value = data.plainSecret
    } else {
      router.push({ name: 'client-list', params: { tenantId } })
    }
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
    <PageHeader title="OAuth 클라이언트 생성" />

    <!-- 시크릿 발급 결과 -->
    <div v-if="plainSecret" class="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <div class="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
        Client Secret은 지금만 확인 가능합니다. 반드시 안전한 곳에 저장하세요.
      </div>
      <CopyableField :value="plainSecret" label="Client Secret" />
      <button
        class="w-full py-2 px-4 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        @click="router.push({ name: 'client-list', params: { tenantId } })"
      >
        목록으로
      </button>
    </div>

    <div v-else class="bg-white rounded-xl border border-gray-200 p-6">
      <form class="space-y-4" @submit.prevent="submit">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">클라이언트 이름</label>
          <input
            v-model="name"
            type="text"
            required
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">타입</label>
          <select
            v-model="type"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white focus:border-transparent"
          >
            <option value="PUBLIC">Public (SPA, 모바일)</option>
            <option value="CONFIDENTIAL">Confidential (서버 사이드)</option>
          </select>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">허용 Grant Type</label>
          <div class="space-y-2">
            <label
              v-for="opt in GRANT_OPTIONS"
              :key="opt.value"
              class="flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors"
              :class="selectedGrants.includes(opt.value)
                ? 'border-indigo-300 bg-indigo-50'
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'"
            >
              <input
                v-model="selectedGrants"
                type="checkbox"
                :value="opt.value"
                class="mt-0.5 w-4 h-4 accent-indigo-600 cursor-pointer shrink-0"
              />
              <div>
                <div class="text-sm font-medium text-gray-800">{{ opt.label }}</div>
                <div class="text-xs text-gray-500 mt-0.5">{{ opt.description }}</div>
              </div>
            </label>
          </div>
          <p v-if="grantsError" class="text-xs text-red-500 mt-1">{{ grantsError }}</p>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">허용 스코프</label>
          <div v-if="availableScopes.length > 0" class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label
              v-for="scope in availableScopes"
              :key="scope.id"
              class="flex items-center gap-2 p-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
            >
              <input
                v-model="selectedScopes"
                type="checkbox"
                :value="scope.name"
                class="w-4 h-4 accent-indigo-600 cursor-pointer"
              />
              <div>
                <div class="text-sm font-medium text-gray-800">{{ scope.name }}</div>
                <div class="text-xs text-gray-500">{{ scope.displayName }}</div>
              </div>
            </label>
          </div>
          <div v-else>
            <input
              type="text"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              :value="selectedScopes.join(' ')"
              placeholder="openid profile email"
              @input="(e) => selectedScopes = (e.target as HTMLInputElement).value.split(/\s+/).filter(Boolean)"
            />
            <p class="mt-1 text-xs text-gray-400">공백으로 구분하여 입력하세요.</p>
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Redirect URIs <span class="text-xs font-normal text-gray-400">(줄바꿈 구분)</span></label>
          <textarea
            v-model="redirectUrisInput"
            rows="3"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
          />
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
