<script setup lang="ts">
import { ref, watch } from 'vue'
import { rbacApi, type Permission } from '@/api/rbac'

const props = defineProps<{
  open: boolean
  tenantId: string
  permission: Permission | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'updated'): void
}>()

const name = ref('')
const displayName = ref('')
const description = ref('')
const error = ref('')
const loading = ref(false)

watch(
  () => props.open,
  (newOpen) => {
    if (newOpen) {
      if (props.permission) {
        name.value = props.permission.name
        displayName.value = props.permission.displayName
        description.value = props.permission.description || ''
      } else {
        name.value = ''
        displayName.value = ''
        description.value = ''
      }
      error.value = ''
    }
  },
  { immediate: true }
)

async function submit() {
  error.value = ''
  loading.value = true
  try {
    if (props.permission) {
      await rbacApi.updatePermission(props.tenantId, props.permission.id, {
        displayName: displayName.value,
        description: description.value,
      })
    } else {
      await rbacApi.createPermission(props.tenantId, {
        name: name.value,
        displayName: displayName.value,
        description: description.value,
      })
    }
    emit('updated')
    emit('close')
  } catch (e: unknown) {
    const axiosError = e as { response?: { data?: { message?: string } } }
    error.value = axiosError.response?.data?.message ?? '저장 중 오류가 발생했습니다.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
    @click.self="emit('close')"
  >
    <div class="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
      <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 class="text-lg font-semibold text-gray-900">
          {{ permission ? '권한 수정' : '새 권한 생성' }}
        </h3>
        <button
          @click="emit('close')"
          class="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <form @submit.prevent="submit" class="p-6 space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">식별자 (ID)</label>
          <input
            v-model="name"
            type="text"
            required
            :disabled="!!permission"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
            placeholder="예: orders:write"
          />
          <p v-if="!permission" class="mt-1 text-xs text-gray-400">한 번 생성하면 변경할 수 없습니다.</p>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">표시 이름</label>
          <input
            v-model="displayName"
            type="text"
            required
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="예: 주문 작성"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">상세 설명</label>
          <textarea
            v-model="description"
            rows="3"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="권한의 용도에 대한 상세 설명입니다."
          ></textarea>
        </div>

        <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

        <div class="flex justify-end gap-3 pt-2">
          <button
            type="button"
            class="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            @click="emit('close')"
          >
            취소
          </button>
          <button
            type="submit"
            :disabled="loading"
            class="px-4 py-2 text-sm bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {{ loading ? '저장 중...' : '저장' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
