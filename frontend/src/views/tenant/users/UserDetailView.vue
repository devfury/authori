<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { usersApi, type User } from '@/api/users'
import { UserStatus } from '@/api/enums'
import PageHeader from '@/components/shared/PageHeader.vue'
import StatusBadge from '@/components/shared/StatusBadge.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'

const route = useRoute()
const tenantId = route.params.tenantId as string
const userId = route.params.userId as string

const user = ref<User | null>(null)
const loading = ref(true)
const showDeactivate = ref(false)
const showActivate = ref(false)

async function load() {
  const { data } = await usersApi.findOne(tenantId, userId)
  user.value = data
  loading.value = false
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
    <div v-if="loading" class="text-sm text-gray-400">불러오는 중...</div>
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

      <div class="bg-white rounded-xl border border-gray-200 p-5">
        <dl class="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt class="text-xs text-gray-400 mb-0.5">이름</dt>
            <dd class="text-gray-800">{{ user.name ?? '—' }}</dd>
          </div>
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
    </template>

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
