<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { Plus, RefreshCw, Pencil, Trash2, ShieldCheck, Key } from 'lucide-vue-next'
import { rbacApi, type Role } from '@/api/rbac'
import PageHeader from '@/components/shared/PageHeader.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import RoleFormDialog from './RoleFormDialog.vue'
import RolePermissionDialog from './RolePermissionDialog.vue'

const route = useRoute()
const tenantId = route.params.tenantId as string

const roles = ref<Role[]>([])
const loading = ref(true)
const showForm = ref(false)
const showPermissionDialog = ref(false)
const selectedRole = ref<Role | null>(null)
const deleteTarget = ref<Role | null>(null)

async function loadRoles() {
  loading.value = true
  try {
    const { data } = await rbacApi.findRoles(tenantId)
    roles.value = data || []
  } finally {
    loading.value = false
  }
}

function openCreate() {
  selectedRole.value = null
  showForm.value = true
}

function openEdit(role: Role) {
  selectedRole.value = role
  showForm.value = true
}

function openPermissions(role: Role) {
  selectedRole.value = role
  showPermissionDialog.value = true
}

async function confirmDelete() {
  if (!deleteTarget.value) return
  try {
    await rbacApi.deleteRole(tenantId, deleteTarget.value.id)
    await loadRoles()
  } finally {
    deleteTarget.value = null
  }
}

onMounted(loadRoles)
</script>

<template>
  <div>
    <PageHeader title="역할 관리" description="테넌트의 사용자 역할을 정의하고 관리합니다.">
      <template #actions>
        <button
          @click="openCreate"
          class="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus class="w-4 h-4" />
          역할 생성
        </button>
      </template>
    </PageHeader>

    <div class="mb-4 flex justify-end">
      <button
        @click="loadRoles"
        :disabled="loading"
        class="p-2 rounded-lg border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
        title="새로고침"
      >
        <RefreshCw class="w-5 h-5" :class="{ 'animate-spin': loading }" />
      </button>
    </div>

    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div v-if="loading && roles.length === 0" class="p-8 text-center text-sm text-gray-400">불러오는 중...</div>
      <div v-else-if="roles.length === 0" class="p-8 text-center text-sm text-gray-400">
        등록된 역할이 없습니다.
      </div>
      <div v-else>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 border-b border-gray-200">
              <tr>
                <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">식별자 (ID)</th>
                <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">표시 이름</th>
                <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">설명</th>
                <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">생성일</th>
                <th class="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="role in roles" :key="role.id" class="hover:bg-gray-50 transition-colors">
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    <ShieldCheck class="w-4 h-4 text-indigo-500" />
                    <span class="font-mono text-xs text-gray-900">{{ role.name }}</span>
                  </div>
                </td>
                <td class="px-4 py-3 text-gray-900 font-medium">{{ role.displayName }}</td>
                <td class="px-4 py-3 text-gray-500 max-w-xs truncate" :title="role.description || ''">
                  {{ role.description || '—' }}
                </td>
                <td class="px-4 py-3 text-gray-400 text-xs">
                  {{ new Date(role.createdAt).toLocaleDateString('ko-KR') }}
                </td>
                <td class="px-4 py-3 text-right space-x-2">
                  <button
                    class="text-gray-400 hover:text-indigo-600 transition-colors"
                    title="권한 설정"
                    @click="openPermissions(role)"
                  >
                    <Key class="w-4 h-4" />
                  </button>
                  <button
                    class="text-gray-400 hover:text-indigo-600 transition-colors"
                    title="수정"
                    @click="openEdit(role)"
                  >
                    <Pencil class="w-4 h-4" />
                  </button>
                  <button
                    class="text-gray-400 hover:text-red-600 transition-colors"
                    title="삭제"
                    @click="deleteTarget = role"
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <RoleFormDialog
      v-if="showForm"
      :open="showForm"
      :tenant-id="tenantId"
      :role="selectedRole"
      @close="showForm = false"
      @updated="loadRoles"
    />

    <RolePermissionDialog
      v-if="showPermissionDialog"
      :open="showPermissionDialog"
      :tenant-id="tenantId"
      :role="selectedRole!"
      @close="showPermissionDialog = false"
    />

    <ConfirmDialog
      :open="!!deleteTarget"
      title="역할 삭제"
      :message="`'${deleteTarget?.name}' 역할을 삭제하시겠습니까? 이 역할이 부여된 모든 사용자에게서 권한이 회수됩니다.`"
      confirm-label="삭제"
      danger
      @confirm="confirmDelete"
      @cancel="deleteTarget = null"
    />
  </div>
</template>
