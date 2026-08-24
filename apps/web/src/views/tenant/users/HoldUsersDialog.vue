<script setup lang="ts">
import { ref, watch } from 'vue'
import Modal from '@/components/shared/Modal.vue'

const props = defineProps<{
  open: boolean
  /** 대상 설명 (예: "'lee@example.com' 사용자" 또는 "선택한 3명") */
  subject: string
  loading?: boolean
}>()

const emit = defineEmits<{
  close: []
  confirm: [reason: string | undefined]
}>()

const reason = ref('')

watch(
  () => props.open,
  (open) => {
    if (open) reason.value = ''
  },
)

function submit() {
  emit('confirm', reason.value.trim() || undefined)
}
</script>

<template>
  <Modal :open="open" title="가입 보류" @close="$emit('close')">
    <div class="space-y-4">
      <p class="text-sm text-gray-700">
        {{ subject }}을(를) 가입 보류 처리하시겠습니까?
      </p>
      <p class="text-xs text-gray-500">
        보류된 사용자는 비활성 상태를 유지하며 승인 대기 알림에서 제외됩니다. 이후 승인하려면
        활성화하면 됩니다.
      </p>
      <div>
        <label class="block text-xs font-medium text-gray-700 mb-1">사유 (선택, 감사 로그에 기록)</label>
        <textarea
          v-model="reason"
          rows="3"
          maxlength="500"
          class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
          placeholder="예: 사내 임직원 확인 불가"
        ></textarea>
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
          class="px-4 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors shadow-sm flex items-center gap-2"
          :disabled="loading"
          @click="submit"
        >
          <span v-if="loading" class="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
          보류하기
        </button>
      </div>
    </template>
  </Modal>
</template>
