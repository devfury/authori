<script setup lang="ts">
defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <div class="mb-6 flex items-start justify-between gap-4">
    <div>
      <h1 class="text-xl font-semibold text-gray-900">{{ title }}</h1>
      <p v-if="description" class="text-sm text-gray-500 mt-0.5">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="shrink-0">
      <slot name="actions" />
    </div>
  </div>
</template>
