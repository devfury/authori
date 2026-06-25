<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  status: string
}>()

const cls = computed(() => {
  switch (props.status) {
    case 'ACTIVE':    return 'bg-green-100 text-green-700'
    case 'INACTIVE':  return 'bg-gray-100 text-gray-600'
    case 'LOCKED':    return 'bg-red-100 text-red-700'
    case 'DRAFT':     return 'bg-yellow-100 text-yellow-700'
    case 'PUBLISHED': return 'bg-green-100 text-green-700'
    case 'DEPRECATED': return 'bg-orange-100 text-orange-700'
    default: return 'bg-gray-100 text-gray-600'
  }
})

const label = computed(() => {
  const map: Record<string, string> = {
    ACTIVE:     '활성',
    INACTIVE:   '비활성',
    LOCKED:     '잠김',
    DRAFT:      '초안',
    PUBLISHED:  '게시됨',
    DEPRECATED: '지원 종료',
  }
  return map[props.status] ?? props.status
})
</script>

<template>
  <span
    class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
    :class="cls"
  >
    {{ label }}
  </span>
</template>
