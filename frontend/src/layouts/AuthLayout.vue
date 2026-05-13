<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const isAdminLogin = computed(() => route.name === 'login')
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-4" style="background-color: var(--auth-bg-color, #f9fafb)">
    <div class="w-full max-w-md">
      <!-- 관리자 로그인 브랜드 -->
      <div v-if="isAdminLogin" class="flex flex-col items-center text-center mb-8">
        <img
          src="/brand/authori-admin-icon.png"
          alt=""
          class="w-14 h-14 object-contain mb-3"
        />
        <h1 class="text-2xl font-bold text-gray-900">Authori</h1>
      </div>

      <!-- OAuth 화면 상단 타이틀 Teleport 타겟 -->
      <div id="auth-header" class="text-center mb-8 empty:hidden empty:mb-0"></div>

      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <slot />
      </div>

      <!-- 하단 Authori 정보 (작게) -->
      <div class="text-center mt-8">
        <h1 class="text-sm font-bold text-gray-400">Authori</h1>
        <p class="text-xs text-gray-400 mt-0.5">멀티테넌트 OAuth2 플랫폼</p>
      </div>
    </div>
  </div>
</template>
