<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { usersApi } from '@/api/users'
import PageHeader from '@/components/shared/PageHeader.vue'

const router = useRouter()
const route = useRoute()
const tenantId = route.params.tenantId as string

const email = ref('')
const name = ref('')
const password = ref('')
const profileJson = ref('{}')
const jsonError = ref('')
const error = ref('')
const loading = ref(false)

function validateJson() {
  try {
    JSON.parse(profileJson.value)
    jsonError.value = ''
    return true
  } catch {
    jsonError.value = '올바른 JSON 형식이 아닙니다.'
    return false
  }
}

async function submit() {
  if (!validateJson()) return
  error.value = ''
  loading.value = true
  try {
    await usersApi.create(tenantId, {
      email: email.value,
      name: name.value || undefined,
      password: password.value,
      profile: JSON.parse(profileJson.value),
    })
    router.push({ name: 'user-list', params: { tenantId } })
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
    <PageHeader title="사용자 생성" />

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
          <label class="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
          <input
            v-model="password"
            type="password"
            required
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">프로필 (JSON)</label>
          <textarea
            v-model="profileJson"
            rows="5"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            :class="jsonError ? 'border-red-400' : ''"
            @blur="validateJson"
          />
          <p v-if="jsonError" class="text-xs text-red-500 mt-1">{{ jsonError }}</p>
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
