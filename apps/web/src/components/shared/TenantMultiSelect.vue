<script setup lang="ts">
import { computed, ref } from 'vue'
import { Search } from 'lucide-vue-next'
import type { Tenant } from '@/api/tenants'

/**
 * 관리자에게 배정할 테넌트를 여러 개 고른다.
 * 테넌트가 늘어나면 목록이 길어지므로 검색을 함께 둔다.
 */
const props = defineProps<{
  tenants: Tenant[]
  modelValue: string[]
}>()

const emit = defineEmits<{ 'update:modelValue': [string[]] }>()

const query = ref('')

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return props.tenants
  return props.tenants.filter(
    (t) => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q),
  )
})

function toggle(tenantId: string) {
  const next = new Set(props.modelValue)
  if (next.has(tenantId)) next.delete(tenantId)
  else next.add(tenantId)
  emit('update:modelValue', [...next])
}
</script>

<template>
  <div>
    <div v-if="tenants.length > 8" class="relative mb-2">
      <Search class="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
      <input
        v-model="query"
        type="search"
        placeholder="테넌트 검색"
        class="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
      />
    </div>

    <div class="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto">
      <label
        v-for="tenant in filtered"
        :key="tenant.id"
        class="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors"
      >
        <input
          type="checkbox"
          class="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
          :checked="modelValue.includes(tenant.id)"
          @change="toggle(tenant.id)"
        />
        <span class="min-w-0">
          <span class="block text-sm text-gray-800 truncate">{{ tenant.name }}</span>
          <span class="block text-xs text-gray-400 font-mono truncate">{{ tenant.slug }}</span>
        </span>
      </label>

      <p v-if="filtered.length === 0" class="px-3 py-4 text-xs text-gray-400 text-center">
        {{ tenants.length === 0 ? '등록된 활성 테넌트가 없습니다.' : '검색 결과가 없습니다.' }}
      </p>
    </div>

    <p class="text-xs mt-1" :class="modelValue.length === 0 ? 'text-red-500' : 'text-gray-400'">
      {{ modelValue.length === 0 ? '최소 1개를 선택하세요.' : `${modelValue.length}개 선택됨` }}
    </p>
  </div>
</template>
