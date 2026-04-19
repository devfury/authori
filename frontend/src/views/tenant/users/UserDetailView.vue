<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ShieldCheck, Plus } from 'lucide-vue-next'
import { usersApi, type User } from '@/api/users'
import { rbacApi, type Role } from '@/api/rbac'
import { UserStatus } from '@/api/enums'
import PageHeader from '@/components/shared/PageHeader.vue'
import StatusBadge from '@/components/shared/StatusBadge.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import UserRoleDialog from './UserRoleDialog.vue'

const route = useRoute()
const tenantId = route.params.tenantId as string
const userId = route.params.userId as string

const user = ref<User | null>(null)
const roles = ref<Role[]>([])
const loading = ref(true)
const showDeactivate = ref(false)
const showActivate = ref(false)
const showRoleDialog = ref(false)

async function load() {
  loading.value = true
  try {
    const [userRes, rolesRes] = await Promise.all([
      usersApi.findOne(tenantId, userId),
      rbacApi.getUserRoles(tenantId, userId),
    ])
    user.value = userRes.data
    roles.value = rolesRes.data || []
  } finally {
    loading.value = false
  }
}

async function deactivate() {
  await usersApi.deactivate(tenantId, userId)
  showDeactivate.value = false
  await load()
}

async function activate() {
  await usersApi.activate(tenantId, userId)
  showActivate.value = false
  await load()
}

onMounted(load)
</script>

<template>
  <div>
    <div v-if="loading && !user" class="text-sm text-gray-400">불러오는 중...</div>
    <template v-else-if="user">
      <PageHeader :title="user.email">
        <template #actions>
          <div class="flex items-center gap-3">
            <router-link
              :to="{ name: 'user-edit', params: { tenantId, userId } }"
              class="px-3 py-1.5 text-xs border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              수정
            </router-link>
            <StatusBadge :status="user.status" />
          </div>
        </template>
      </PageHeader>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 space-y-6">
          <div class="bg-white rounded-xl border border-gray-200 p-5">
            <h3 class="text-sm font-semibold text-gray-900 mb-4">기본 정보</h3>
            <dl class="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt class="text-xs text-gray-400 mb-0.5">ID</dt>
                <dd class="font-mono text-xs text-gray-800">{{ user.id }}</dd>
              </div>
              <div>
                <dt class="text-xs text-gray-400 mb-0.5">로그인 ID</dt>
                <dd class="text-gray-800">{{ user.loginId ?? '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs text-gray-400 mb-0.5">로그인 실패 횟수</dt>
                <dd class="text-gray-800">{{ user.failedLoginAttempts }}</dd>
              </div>
              <div>
                <dt class="text-xs text-gray-400 mb-0.5">마지막 로그인</dt>
                <dd class="text-gray-800">
                  {{ user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('ko-KR') : '—' }}
                </dd>
              </div>
              <div>
                <dt class="text-xs text-gray-400 mb-0.5">생성일</dt>
                <dd class="text-gray-800">{{ new Date(user.createdAt).toLocaleDateString('ko-KR') }}</dd>
              </div>
            </dl>

            <div class="mt-5 pt-4 border-t border-gray-100 flex gap-3">
              <button
                v-if="user.status === UserStatus.ACTIVE"
                class="px-4 py-2 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                @click="showDeactivate = true"
              >
                사용자 비활성화
              </button>
              <button
                v-else
                class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                @click="showActivate = true"
              >
                사용자 활성화
              </button>
            </div>
          </div>
        </div>

        <div class="space-y-6">
          <div class="bg-white rounded-xl border border-gray-200 p-5">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-sm font-semibold text-gray-900">역할</h3>
              <button
                @click="showRoleDialog = true"
                class="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
              >
                <Plus class="w-3 h-3" />
                설정
              </button>
            </div>

            <div v-if="roles.length === 0" class="text-center py-6 text-xs text-gray-400 border-2 border-dashed border-gray-50 rounded-lg">
              할당된 역할이 없습니다.
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="role in roles"
                :key="role.id"
                class="flex items-center gap-2 p-2 rounded-lg bg-gray-50 border border-gray-100"
              >
                <ShieldCheck class="w-4 h-4 text-indigo-500 flex-shrink-0" />
                <div class="min-w-0">
                  <div class="text-xs font-medium text-gray-900 truncate">{{ role.displayName }}</div>
                  <div class="text-[10px] text-gray-400 font-mono truncate">{{ role.name }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <UserRoleDialog
      v-if="showRoleDialog"
      :open="showRoleDialog"
      :tenant-id="tenantId"
      :user-id="userId"
      :user-name="user?.email || ''"
      @close="showRoleDialog = false"
      @updated="load"
    />

    <ConfirmDialog
      :open="showDeactivate"
      title="사용자 비활성화"
      :message="`'${user?.email}' 사용자를 비활성화하시겠습니까?`"
      confirm-label="비활성화"
      danger
      @confirm="deactivate"
      @cancel="showDeactivate = false"
    />

    <ConfirmDialog
      :open="showActivate"
      title="사용자 활성화"
      :message="`'${user?.email}' 사용자를 활성화하시겠습니까?`"
      confirm-label="활성화"
      @confirm="activate"
      @cancel="showActivate = false"
    />
  </div>
</template>

