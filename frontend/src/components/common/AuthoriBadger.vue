<script setup lang="ts">
import badgerDefault from '@/assets/brand/badger-default.svg';
import badgerPortal from '@/assets/brand/badger-portal.svg';

interface Props {
  type?: 'default' | 'shield' | 'key' | 'portal';
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const props = withDefaults(defineProps<Props>(), {
  type: 'default',
  size: 'md',
});

const sizeClasses = {
  sm: 'w-12 h-12',
  md: 'w-24 h-24',
  lg: 'w-48 h-48',
  xl: 'w-64 h-64',
};
</script>

<template>
  <div class="authori-badger flex flex-col items-center justify-center transition-all duration-300 hover:scale-105" :class="sizeClasses[props.size]">
    <img
      v-if="type === 'portal'"
      :src="badgerPortal"
      alt="Authori Portal Badger"
      class="w-full h-full object-contain drop-shadow-md"
    />
    <img
      v-else
      :src="badgerDefault"
      alt="Authori Default Badger"
      class="w-full h-full object-contain drop-shadow-md"
    />
  </div>
</template>

<style scoped>
.authori-badger {
  transition: transform 0.3s ease;
}
.authori-badger:hover {
  transform: scale(1.05);
}
</style>
