<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'
import { useUiStore } from '@/stores/ui.store'
import AppSidebar from '@/components/shared/AppSidebar.vue'
import AppHeader from '@/components/shared/AppHeader.vue'

const auth = useAuthStore()
const ui = useUiStore()
const route = useRoute()

const tenantId = computed(() => route.params.tenantId as string | undefined)
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex">
    <AppSidebar
      :is-open="ui.sidebarOpen"
      :is-platform-admin="auth.isPlatformAdmin"
      :tenant-id="tenantId"
    />
    <div
      class="flex-1 flex flex-col min-w-0 transition-all duration-200"
      :class="ui.sidebarOpen ? 'ml-64' : 'ml-0'"
    >
      <AppHeader :email="auth.email ?? ''" @toggle-sidebar="ui.toggleSidebar" />
      <main class="flex-1 p-6">
        <slot />
      </main>
    </div>
  </div>
</template>
