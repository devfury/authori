<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { schemasApi } from '@/api/schemas'
import PageHeader from '@/components/shared/PageHeader.vue'

const router = useRouter()
const route = useRoute()
const tenantId = route.params.tenantId as string

const schemaJson = ref(JSON.stringify({
  type: 'object',
  properties: {
    name: { type: 'string' },
    phone: { type: 'string' }
  },
  required: ['name']
}, null, 2))

const jsonError = ref('')
const error = ref('')
const loading = ref(false)

function validateJson() {
  try {
    JSON.parse(schemaJson.value)
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
    await schemasApi.publish(tenantId, { schemaJsonb: JSON.parse(schemaJson.value) })
    router.push({ name: 'schema-list', params: { tenantId } })
  } catch (e: unknown) {
    const axiosError = e as { response?: { data?: { message?: string } } }
    error.value = axiosError.response?.data?.message ?? '발행 중 오류가 발생했습니다.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl">
    <PageHeader title="프로필 스키마 발행" description="JSON Schema 형식으로 사용자 프로필 구조를 정의합니다." />

    <div class="bg-white rounded-xl border border-gray-200 p-6">
      <form class="space-y-4" @submit.prevent="submit">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">JSON Schema</label>
          <textarea
            v-model="schemaJson"
            rows="16"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            :class="jsonError ? 'border-red-400' : ''"
            spellcheck="false"
            @blur="validateJson"
          />
          <p v-if="jsonError" class="text-xs text-red-500 mt-1">{{ jsonError }}</p>
          <p class="text-xs text-gray-400 mt-1">
            JSON Schema Draft-07 형식을 지원합니다.
          </p>
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
            {{ loading ? '발행 중...' : '발행' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
