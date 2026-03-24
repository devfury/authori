<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import {
  LayoutDashboard,
  Building2,
  Users,
  ShieldCheck,
  AppWindow,
  FileJson,
  ClipboardList,
  UserCog,
} from 'lucide-vue-next'

const props = defineProps<{
  isOpen: boolean
  isPlatformAdmin: boolean
  tenantId?: string
}>()

const route = useRoute()

function isActive(name: string) {
  return route.name === name
}

const platformLinks = [
  { name: 'tenant-list', label: '테넌트 관리', icon: Building2 },
  { name: 'admin-list', label: '관리자 계정', icon: UserCog },
]

const tenantLinks = computed(() => {
  if (!props.tenantId) return []
  return [
    { name: 'tenant-dashboard', label: '대시보드', icon: LayoutDashboard, params: { tenantId: props.tenantId } },
    { name: 'client-list', label: 'OAuth 클라이언트', icon: AppWindow, params: { tenantId: props.tenantId } },
    { name: 'user-list', label: '사용자', icon: Users, params: { tenantId: props.tenantId } },
    { name: 'schema-list', label: '프로필 스키마', icon: FileJson, params: { tenantId: props.tenantId } },
    { name: 'audit-log', label: '감사 로그', icon: ClipboardList, params: { tenantId: props.tenantId } },
  ]
})
</script>

<template>
  <aside
    v-if="isOpen"
    class="fixed inset-y-0 left-0 z-30 w-64 bg-white border-r border-gray-200 flex flex-col"
  >
    <!-- Logo -->
    <div class="h-16 flex items-center px-6 border-b border-gray-200">
      <ShieldCheck class="w-5 h-5 text-indigo-600 mr-2" />
      <span class="font-semibold text-gray-900">Authori Admin</span>
    </div>

    <nav class="flex-1 overflow-y-auto py-4 px-3 space-y-6">
      <!-- Platform Admin 메뉴 -->
      <div v-if="isPlatformAdmin">
        <p class="px-3 mb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
          플랫폼
        </p>
        <ul class="space-y-1">
          <li v-for="link in platformLinks" :key="link.name">
            <RouterLink
              :to="{ name: link.name }"
              class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              :class="
                isActive(link.name)
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-700 hover:bg-gray-100'
              "
            >
              <component :is="link.icon" class="w-4 h-4 shrink-0" />
              {{ link.label }}
            </RouterLink>
          </li>
        </ul>
      </div>

      <!-- Tenant Admin 메뉴 -->
      <div v-if="tenantLinks.length">
        <p class="px-3 mb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
          테넌트
        </p>
        <ul class="space-y-1">
          <li v-for="link in tenantLinks" :key="link.name">
            <RouterLink
              :to="{ name: link.name, params: link.params }"
              class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              :class="
                isActive(link.name)
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-700 hover:bg-gray-100'
              "
            >
              <component :is="link.icon" class="w-4 h-4 shrink-0" />
              {{ link.label }}
            </RouterLink>
          </li>
        </ul>
      </div>
    </nav>
  </aside>
</template>
