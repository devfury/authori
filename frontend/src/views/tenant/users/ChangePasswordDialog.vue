<script setup lang="ts">
import { ref } from 'vue'
import { usersApi } from '@/api/users'
import Modal from '@/components/shared/Modal.vue'

const props = defineProps<{
  open: boolean
  tenantId: string
  userId: string
  userEmail: string
}>()

const emit = defineEmits(['close', 'updated'])

const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const error = ref<string | null>(null)

async function submit() {
  if (password.value !== confirmPassword.value) {
    error.value = '비밀번호가 일치하지 않습니다.'
    return
  }
  if (password.value.length < 8) {
    error.value = '비밀번호는 최소 8자 이상이어야 합니다.'
    return
  }

  loading.value = true
  error.value = null
  try {
    await usersApi.changePassword(props.tenantId, props.userId, password.value)
    emit('updated')
    emit('close')
  } catch (err: any) {
    error.value = err.response?.data?.message || '비밀번호 변경에 실패했습니다.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Modal :open="open" :title="`비밀번호 변경 - ${userEmail}`" @close="$emit('close')">
    <div class="space-y-4">
      <div v-if="error" class="p-3 text-xs text-red-600 bg-red-50 rounded-lg border border-red-100">
        {{ error }}
      </div>

      <div>
        <label class="block text-xs font-medium text-gray-700 mb-1">새 비밀번호</label>
        <input
          v-model="password"
          type="password"
          class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          placeholder="최소 8자 이상"
          @keyup.enter="submit"
        />
      </div>

      <div>
        <label class="block text-xs font-medium text-gray-700 mb-1">비밀번호 확인</label>
        <input
          v-model="confirmPassword"
          type="password"
          class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          @keyup.enter="submit"
        />
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end gap-3">
        <button
          type="button"
          class="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          @click="$emit('close')"
        >
          취소
        </button>
        <button
          type="button"
          class="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm flex items-center gap-2"
          :disabled="loading || !password || !confirmPassword"
          @click="submit"
        >
          <span v-if="loading" class="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
          변경하기
        </button>
      </div>
    </template>
  </Modal>
</template>
