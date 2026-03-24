<script setup lang="ts">
import { ref } from 'vue'
import { Copy, Check } from 'lucide-vue-next'

defineProps<{ value: string; label?: string }>()

const copied = ref(false)

async function copy(value: string) {
  await navigator.clipboard.writeText(value)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}
</script>

<template>
  <div>
    <p v-if="label" class="text-xs font-medium text-gray-500 mb-1">{{ label }}</p>
    <div class="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
      <span class="flex-1 text-sm font-mono text-gray-800 break-all">{{ value }}</span>
      <button
        class="shrink-0 text-gray-400 hover:text-gray-700 transition-colors"
        @click="copy(value)"
      >
        <Check v-if="copied" class="w-4 h-4 text-green-500" />
        <Copy v-else class="w-4 h-4" />
      </button>
    </div>
  </div>
</template>
