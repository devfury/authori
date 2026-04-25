<template>
  <div class="min-h-screen flex items-center justify-center p-4" style="background-color: var(--auth-bg-color, #f9fafb)">
    <div class="w-full max-w-md">
      <!-- 상단 타이틀 (Teleport 타겟) -->
      <div id="auth-header" class="text-center mb-8"></div>

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
