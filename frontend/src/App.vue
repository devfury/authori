<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AuthLayout from '@/layouts/AuthLayout.vue'
import AdminLayout from '@/layouts/AdminLayout.vue'

const route = useRoute()
const layout = computed(() => route.meta.layout === 'auth' ? 'auth' : 'admin')
</script>

<template>
  <AuthLayout v-if="layout === 'auth'">
    <RouterView />
  </AuthLayout>
  <AdminLayout v-else>
    <RouterView />
  </AdminLayout>
</template>
