<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Building2, ChevronRight } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth.store'

const auth = useAuthStore()
const router = useRouter()

/**
 * 고를 것이 없는 사람이 이 화면에 머무르면 안 된다.
 * 주소를 직접 입력한 경우에 대비해 진입 시 정리한다.
 */
onMounted(() => {
  if (auth.isPlatformAdmin || auth.tenants.length <= 1) {
    void router.replace(auth.landingRoute())
  }
})

function select(tenantId: string) {
  void router.push(`/admin/tenants/${tenantId}/dashboard`)
}
</script>

<template>
  <div class="w-full max-w-md">
    <h1 class="text-xl font-semibold text-gray-900 mb-1">테넌트 선택</h1>
    <p class="text-sm text-gray-500 mb-6">관리할 테넌트를 고르세요. 나중에 언제든 전환할 수 있습니다.</p>

    <ul class="space-y-2">
      <li v-for="tenant in auth.tenants" :key="tenant.id">
        <button
          type="button"
          class="w-full flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl text-left hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors"
          @click="select(tenant.id)"
        >
          <span class="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
            <Building2 class="w-4 h-4 text-indigo-500" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-medium text-gray-900 truncate">{{ tenant.name }}</span>
            <span class="block text-xs text-gray-400 font-mono truncate">{{ tenant.slug }}</span>
          </span>
          <ChevronRight class="w-4 h-4 text-gray-300 shrink-0" />
        </button>
      </li>
    </ul>

    <button
      type="button"
      class="mt-6 text-sm text-gray-400 hover:text-gray-600 transition-colors"
      @click="auth.logout()"
    >
      다른 계정으로 로그인
    </button>
  </div>
</template>
