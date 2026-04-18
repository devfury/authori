<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { Plus, RefreshCw, Pencil, Trash2, Key } from 'lucide-vue-next'
import { rbacApi, type Permission } from '@/api/rbac'
import PageHeader from '@/components/shared/PageHeader.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import PermissionFormDialog from './PermissionFormDialog.vue'

const route = useRoute()
const tenantId = route.params.tenantId as string

const permissions = ref<Permission[]>([])
const loading = ref(true)
const showForm = ref(false)
const selectedPermission = ref<Permission | null>(null)
const deleteTarget = ref<Permission | null>(null)

async function loadPermissions() {
  loading.value = true
  try {
    const { data } = await rbacApi.findPermissions(tenantId)
    permissions.value = data || []
  } finally {
    loading.value = false
  }
}

function openCreate() {
  selectedPermission.value = null
  showForm.value = true
}

function openEdit(permission: Permission) {
  selectedPermission.value = permission
  showForm.value = true
}

async function confirmDelete() {
  if (!deleteTarget.value) return
  try {
    await rbacApi.deletePermission(tenantId, deleteTarget.value.id)
    await loadPermissions()
  } finally {
    deleteTarget.value = null
  }
}

onMounted(loadPermissions)
</script>

<template>
  <div>
    <PageHeader title="권한 관리" description="테넌트의 세부 권한을 정의하고 관리합니다.">
      <template #actions>
        <button
          @click="openCreate"
          class="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus class="w-4 h-4" />
          권한 생성
        </button>
      </template>
    </PageHeader>

    <div class="mb-4 flex justify-end">
      <button
        @click="loadPermissions"
        :disabled="loading"
        class="p-2 rounded-lg border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
        title="새로고침"
      >
        <RefreshCw class="w-5 h-5" :class="{ 'animate-spin': loading }" />
      </button>
    </div>

    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div v-if="loading && permissions.length === 0" class="p-8 text-center text-sm text-gray-400">불러오는 중...</div>
      <div v-else-if="permissions.length === 0" class="p-8 text-center text-sm text-gray-400">
        등록된 권한이 없습니다.
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
              <tr v-for="permission in permissions" :key="permission.id" class="hover:bg-gray-50 transition-colors">
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    <Key class="w-4 h-4 text-amber-500" />
                    <span class="font-mono text-xs text-gray-900">{{ permission.name }}</span>
                  </div>
                </td>
                <td class="px-4 py-3 text-gray-900 font-medium">{{ permission.displayName }}</td>
                <td class="px-4 py-3 text-gray-500 max-w-xs truncate" :title="permission.description || ''">
                  {{ permission.description || '—' }}
                </td>
                <td class="px-4 py-3 text-gray-400 text-xs">
                  {{ new Date(permission.createdAt).toLocaleDateString('ko-KR') }}
                </td>
                <td class="px-4 py-3 text-right space-x-2">
                  <button
                    class="text-gray-400 hover:text-indigo-600 transition-colors"
                    title="수정"
                    @click="openEdit(permission)"
                  >
                    <Pencil class="w-4 h-4" />
                  </button>
                  <button
                    class="text-gray-400 hover:text-red-600 transition-colors"
                    title="삭제"
                    @click="deleteTarget = permission"
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

    <PermissionFormDialog
      v-if="showForm"
      :open="showForm"
      :tenant-id="tenantId"
      :permission="selectedPermission"
      @close="showForm = false"
      @updated="loadPermissions"
    />

    <ConfirmDialog
      :open="!!deleteTarget"
      title="권한 삭제"
      :message="`'${deleteTarget?.name}' 권한을 삭제하시겠습니까? 이 작업은 되돌릴 수 없으며 이 권한을 포함하는 모든 역할에서 해당 권한이 제거됩니다.`"
      confirm-label="삭제"
      danger
      @confirm="confirmDelete"
      @cancel="deleteTarget = null"
    />
  </div>
</template>
