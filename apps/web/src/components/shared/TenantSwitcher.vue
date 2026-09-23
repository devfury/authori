<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Building2, Check, ChevronsUpDown } from 'lucide-vue-next'
import type { AdminTenant } from '@/api/auth'

const props = defineProps<{
  /** 현재 보고 있는 테넌트 ID (경로 파라미터 기준) */
  tenantId?: string
  /** 현재 테넌트명. 배정 목록에 없을 수도 있어(플랫폼 관리자) 따로 받는다. */
  tenantName?: string
  /** 배정된 테넌트. 2개 이상일 때만 전환기가 된다. */
  tenants: AdminTenant[]
}>()

const route = useRoute()
const router = useRouter()

const open = ref(false)
const canSwitch = computed(() => props.tenants.length > 1)

const label = computed(
  () => props.tenantName ?? props.tenants.find((t) => t.id === props.tenantId)?.name ?? '테넌트',
)

function close() {
  open.value = false
}

function onDocumentClick() {
  close()
}

// 바깥 클릭으로 닫는다. 열려 있을 때만 리스너를 붙인다.
function toggle() {
  open.value = !open.value
  if (open.value) {
    // 이 클릭이 그대로 document 로 올라가 방금 연 목록을 닫지 않도록 다음 틱에 등록한다.
    setTimeout(() => document.addEventListener('click', onDocumentClick, { once: true }), 0)
  }
}

onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick))

/**
 * 전환해도 같은 성격의 화면을 유지한다.
 * :userId 처럼 다른 파라미터가 있으면 그 자원은 새 테넌트에 없으므로 대시보드로 보낸다.
 * 쿼리(페이지·검색어·필터)는 버린다 — 이전 테넌트의 조건을 새 테넌트에 적용하면 결과가 오해를 부른다.
 */
function switchTo(nextTenantId: string) {
  close()
  if (nextTenantId === props.tenantId) return

  const keepsView =
    typeof route.name === 'string' &&
    Object.keys(route.params).every((key) => key === 'tenantId')

  void router.push(
    keepsView
      ? { name: route.name as string, params: { tenantId: nextTenantId } }
      : { name: 'tenant-dashboard', params: { tenantId: nextTenantId } },
  )
}
</script>

<template>
  <!-- 배정이 하나뿐이면 고를 것이 없으므로 기존처럼 이름만 보여준다. -->
  <div
    v-if="!canSwitch"
    class="mx-3 mb-2 px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center gap-2 min-w-0"
  >
    <Building2 class="w-3.5 h-3.5 text-indigo-500 shrink-0" />
    <span class="text-xs font-medium text-indigo-700 truncate">{{ label }}</span>
  </div>

  <div v-else class="mx-3 mb-2 relative">
    <button
      type="button"
      class="w-full px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center gap-2 min-w-0 hover:bg-indigo-100 transition-colors"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click.stop="toggle"
    >
      <Building2 class="w-3.5 h-3.5 text-indigo-500 shrink-0" />
      <span class="text-xs font-medium text-indigo-700 truncate flex-1 text-left">{{ label }}</span>
      <ChevronsUpDown class="w-3.5 h-3.5 text-indigo-400 shrink-0" />
    </button>

    <ul
      v-if="open"
      role="listbox"
      class="absolute z-40 left-0 right-0 mt-1 py-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto"
      @click.stop
    >
      <li v-for="tenant in tenants" :key="tenant.id">
        <button
          type="button"
          role="option"
          :aria-selected="tenant.id === tenantId"
          class="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-gray-50 transition-colors"
          @click="switchTo(tenant.id)"
        >
          <Check
            class="w-3.5 h-3.5 shrink-0"
            :class="tenant.id === tenantId ? 'text-indigo-500' : 'text-transparent'"
          />
          <span class="min-w-0 flex-1">
            <span class="block text-xs font-medium text-gray-800 truncate">{{ tenant.name }}</span>
            <span class="block text-[11px] text-gray-400 font-mono truncate">{{ tenant.slug }}</span>
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>
