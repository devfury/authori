<script setup lang="ts">
import AuthoriBadger from '@/components/common/AuthoriBadger.vue';
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-4 bg-authori-light-blue">
    <div class="w-full max-w-md">
      <div class="text-center mb-8 flex flex-col items-center">
        <AuthoriBadger size="lg" type="portal" class="mb-4" />
        <h1 class="text-3xl font-bold text-authori-blue tracking-tight">Authori</h1>
        <p class="text-sm text-gray-600 mt-2 font-medium">안전하고 강력한 멀티테넌트 인증 플랫폼</p>
      </div>
      <div class="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
        <slot />
      </div>
    </div>
  </div>
</template>
