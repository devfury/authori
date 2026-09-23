<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth.store'

const auth = useAuthStore()

/**
 * 복귀 링크는 역할에 맞는 곳을 가리켜야 한다.
 * 이전에는 항상 /admin 으로 보냈는데, 그 경로는 플랫폼 관리자 전용이라
 * 테넌트 관리자가 누르면 라우터 가드가 다시 여기로 돌려보냈다.
 */
const home = computed(() => {
  if (auth.isPlatformAdmin) {
    return { to: '/admin/tenants', label: '테넌트 목록으로' }
  }
  if (auth.tenantId) {
    return { to: `/admin/tenants/${auth.tenantId}/dashboard`, label: '내 테넌트로 돌아가기' }
  }
  return { to: '/admin/login', label: '로그인 화면으로' }
})

// 테넌트 관리자가 여기 온 경우 대개 다른 테넌트의 URL 로 들어온 것이다.
const showTenantHint = computed(() => !auth.isPlatformAdmin && !!auth.tenantId)
</script>

<template>
  <div class="text-center">
    <h2 class="text-4xl font-bold text-gray-300 mb-2">403</h2>
    <p class="text-gray-600" :class="showTenantHint ? 'mb-1' : 'mb-4'">접근 권한이 없습니다.</p>
    <p v-if="showTenantHint" class="text-sm text-gray-400 mb-4">
      다른 테넌트의 자원이거나 플랫폼 관리자 전용 화면입니다.
    </p>
    <RouterLink :to="home.to" class="text-sm text-indigo-600 hover:underline">
      {{ home.label }}
    </RouterLink>
  </div>
</template>
