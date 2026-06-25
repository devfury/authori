<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AuthLayout from '@/layouts/AuthLayout.vue'
import AdminLayout from '@/layouts/AdminLayout.vue'

const route = useRoute()
const Layout = computed(() => route.meta.layout === 'auth' ? AuthLayout : AdminLayout)
</script>

<template>
  <RouterView v-slot="{ Component }">
    <component :is="Layout">
      <component :is="Component" />
    </component>
  </RouterView>
</template>
