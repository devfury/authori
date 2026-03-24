<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { clientsApi } from '@/api/clients'
import PageHeader from '@/components/shared/PageHeader.vue'
import CopyableField from '@/components/shared/CopyableField.vue'

const router = useRouter()
const route = useRoute()
const tenantId = route.params.tenantId as string

const name = ref('')
const type = ref<'public' | 'confidential'>('public')
const scopeInput = ref('openid profile email')
const grantsInput = ref('authorization_code')
const redirectUrisInput = ref('http://localhost:8080/callback')

const error = ref('')
const loading = ref(false)
const plainSecret = ref<string | null>(null)

async function submit() {
  error.value = ''
  loading.value = true
  try {
    const { data } = await clientsApi.create(tenantId, {
      name: name.value,
      type: type.value,
      allowedScopes: scopeInput.value.split(/\s+/).filter(Boolean),
      allowedGrants: grantsInput.value.split(/\s+/).filter(Boolean),
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
    <div
      v-if="plainSecret"
      class="bg-white rounded-xl border border-gray-200 p-6 space-y-4"
    >
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
            <option value="public">Public (SPA, 모바일)</option>
            <option value="confidential">Confidential (서버 사이드)</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">허용 스코프 (공백 구분)</label>
          <input
            v-model="scopeInput"
            type="text"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">허용 Grant (공백 구분)</label>
          <input
            v-model="grantsInput"
            type="text"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Redirect URIs (줄바꿈 구분)</label>
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
