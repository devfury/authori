<script setup lang="ts">
import { AlertCircle, RefreshCw } from 'lucide-vue-next'

/**
 * 조회 실패를 빈 화면 대신 이유와 함께 보여준다.
 * "불러오는 중..." 자리와 같은 박스(p-8 text-center) 안에 그려 레이아웃이 튀지 않게 한다.
 */
withDefaults(
  defineProps<{
    message: string
    /** 다시 시도해도 결과가 같은 오류(권한 오류 등)에서는 false 로 버튼을 감춘다. */
    retryable?: boolean
  }>(),
  { retryable: true },
)

defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="p-8 flex flex-col items-center text-center">
    <AlertCircle class="w-8 h-8 text-gray-300 mb-3" />
    <p class="text-sm text-gray-600">{{ message }}</p>
    <button
      v-if="retryable"
      type="button"
      class="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
      @click="$emit('retry')"
    >
      <RefreshCw class="w-3.5 h-3.5" />
      다시 시도
    </button>
  </div>
</template>
