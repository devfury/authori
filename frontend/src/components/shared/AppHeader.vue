<script setup lang="ts">
import { Menu, LogOut } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth.store'

defineProps<{ email: string }>()
defineEmits<{ 'toggle-sidebar': [] }>()

const auth = useAuthStore()
</script>

<template>
  <header class="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4">
    <button
      class="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
      @click="$emit('toggle-sidebar')"
    >
      <Menu class="w-5 h-5" />
    </button>

    <div class="flex items-center gap-3">
      <span class="text-sm text-gray-600">{{ email }}</span>
      <button
        class="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        @click="auth.logout"
      >
        <LogOut class="w-4 h-4" />
        로그아웃
      </button>
    </div>
  </header>
</template>
