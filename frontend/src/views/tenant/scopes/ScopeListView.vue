<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { Plus, RefreshCw, Pencil, Trash2, CheckCircle2 } from 'lucide-vue-next'
import { scopesApi, type TenantScope } from '@/api/scopes'
import PageHeader from '@/components/shared/PageHeader.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import ScopeFormDialog from './ScopeFormDialog.vue'

const route = useRoute()
const tenantId = route.params.tenantId as string

const scopes = ref<TenantScope[]>([])
const loading = ref(true)
const showForm = ref(false)
const selectedScope = ref<TenantScope | null>(null)
const deleteTarget = ref<TenantScope | null>(null)

async function loadScopes() {
  loading.value = true
  try {
    const { data } = await scopesApi.findAll(tenantId)
    scopes.value = data || []
  } finally {
    loading.value = false
  }
}

function openCreate() {
  selectedScope.value = null
  showForm.value = true
}

function openEdit(scope: TenantScope) {
  selectedScope.value = scope
  showForm.value = true
}

async function confirmDelete() {
  if (!deleteTarget.value) return
  try {
    await scopesApi.delete(tenantId, deleteTarget.value.id)
    await loadScopes()
  } finally {
    deleteTarget.value = null
  }
}

onMounted(loadScopes)
</script>

<template>
  <div>
    <PageHeader title="OAuth2 스코프" description="테넌트의 OAuth2 스코프를 관리합니다.">
      <template #actions>
        <button
          @click="openCreate"
          class="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus class="w-4 h-4" />
          스코프 생성
        </button>
      </template>
    </PageHeader>

    <div class="mb-4 flex justify-end">
      <button
        @click="loadScopes"
        :disabled="loading"
        class="p-2 rounded-lg border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
        title="새로고침"
      >
        <RefreshCw class="w-5 h-5" :class="{ 'animate-spin': loading }" />
      </button>
    </div>

    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div v-if="loading && scopes.length === 0" class="p-8 text-center text-sm text-gray-400">불러오는 중...</div>
      <div v-else-if="scopes.length === 0" class="p-8 text-center text-sm text-gray-400">
        등록된 스코프가 없습니다.
      </div>
      <div v-else>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 border-b border-gray-200">
              <tr>
                <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">식별자 (ID)</th>
                <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">표시 이름</th>
                <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">설명</th>
                <th class="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">기본값</th>
                <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">생성일</th>
                <th class="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="scope in scopes" :key="scope.id" class="hover:bg-gray-50 transition-colors">
                <td class="px-4 py-3 font-mono text-xs text-gray-900">{{ scope.name }}</td>
                <td class="px-4 py-3 text-gray-900 font-medium">{{ scope.displayName }}</td>
                <td class="px-4 py-3 text-gray-500 max-w-xs truncate" :title="scope.description || ''">
                  {{ scope.description || '—' }}
                </td>
                <td class="px-4 py-3 text-center">
                  <CheckCircle2 v-if="scope.isDefault" class="w-4 h-4 text-green-500 mx-auto" />
                </td>
                <td class="px-4 py-3 text-gray-400 text-xs">
                  {{ new Date(scope.createdAt).toLocaleDateString('ko-KR') }}
                </td>
                <td class="px-4 py-3 text-right space-x-2">
                  <button
                    class="text-gray-400 hover:text-indigo-600 transition-colors"
                    title="수정"
                    @click="openEdit(scope)"
                  >
                    <Pencil class="w-4 h-4" />
                  </button>
                  <button
                    class="text-gray-400 hover:text-red-600 transition-colors"
                    title="삭제"
                    @click="deleteTarget = scope"
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

    <ScopeFormDialog
      :open="showForm"
      :tenant-id="tenantId"
      :scope="selectedScope"
      @close="showForm = false"
      @updated="loadScopes"
    />

    <ConfirmDialog
      :open="!!deleteTarget"
      title="스코프 삭제"
      :message="`'${deleteTarget?.name}' 스코프를 삭제하시겠습니까? 이 작업은 되돌릴 수 없으며 해당 스코프를 사용하는 클라이언트에 영향을 줄 수 있습니다.`"
      confirm-label="삭제"
      danger
      @confirm="confirmDelete"
      @cancel="deleteTarget = null"
    />
  </div>
</template>
