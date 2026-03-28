<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { externalAuthApi, type ExternalAuthProvider } from '@/api/external-auth'
import PageHeader from '@/components/shared/PageHeader.vue'

const route = useRoute()
const router = useRouter()
const tenantId = route.params.tenantId as string

const providers = ref<ExternalAuthProvider[]>([])
const loading = ref(true)
const deletingId = ref<string | null>(null)

async function load() {
  const { data } = await externalAuthApi.findAll(tenantId)
  providers.value = data
  loading.value = false
}

async function remove(id: string) {
  if (!confirm('프로바이더를 삭제하시겠습니까?')) return
  deletingId.value = id
  try {
    await externalAuthApi.remove(tenantId, id)
    providers.value = providers.value.filter((p) => p.id !== id)
  } finally {
    deletingId.value = null
  }
}

onMounted(load)
</script>

<template>
  <div>
    <PageHeader title="외부 인증 프로바이더">
      <template #actions>
        <button
          class="px-4 py-2 text-sm bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          @click="router.push({ name: 'external-auth-create', params: { tenantId } })"
        >
          + 프로바이더 추가
        </button>
      </template>
    </PageHeader>

    <div v-if="loading" class="text-sm text-gray-400">불러오는 중...</div>

    <div v-else-if="providers.length === 0" class="text-sm text-gray-400 py-10 text-center">
      등록된 외부 인증 프로바이더가 없습니다.
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="p in providers"
        :key="p.id"
        class="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between gap-4"
      >
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <span
              class="text-xs px-2 py-0.5 rounded-full font-medium"
              :class="p.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'"
            >{{ p.enabled ? '활성' : '비활성' }}</span>
            <span v-if="p.clientId" class="text-xs text-gray-400 font-mono">{{ p.clientId }}</span>
            <span v-else class="text-xs text-gray-400">테넌트 전체 적용</span>
          </div>
          <p class="text-sm font-mono text-gray-700 truncate">{{ p.providerUrl }}</p>
          <div class="flex gap-3 mt-1 text-xs text-gray-400">
            <span>JIT: {{ p.jitProvision ? 'O' : 'X' }}</span>
            <span>프로필 동기화: {{ p.syncOnLogin ? 'O' : 'X' }}</span>
          </div>
        </div>
        <div class="flex gap-2 shrink-0">
          <button
            class="px-3 py-1.5 text-xs border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            @click="router.push({ name: 'external-auth-detail', params: { tenantId, id: p.id } })"
          >
            수정
          </button>
          <button
            :disabled="deletingId === p.id"
            class="px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
            @click="remove(p.id)"
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
