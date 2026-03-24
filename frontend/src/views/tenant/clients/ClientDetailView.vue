<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { clientsApi, type OAuthClient } from '@/api/clients'
import PageHeader from '@/components/shared/PageHeader.vue'
import StatusBadge from '@/components/shared/StatusBadge.vue'
import CopyableField from '@/components/shared/CopyableField.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'

const route = useRoute()
const tenantId = route.params.tenantId as string
const clientId = route.params.clientId as string

const client = ref<OAuthClient | null>(null)
const loading = ref(true)
const newSecret = ref<string | null>(null)
const showRotateConfirm = ref(false)
const rotating = ref(false)

async function load() {
  const { data } = await clientsApi.findAll(tenantId)
  client.value = data.find((c) => c.clientId === clientId) ?? null
  loading.value = false
}

async function rotateSecret() {
  rotating.value = true
  showRotateConfirm.value = false
  try {
    const { data } = await clientsApi.rotateSecret(tenantId, clientId)
    newSecret.value = data.plainSecret
  } finally {
    rotating.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div v-if="loading" class="text-sm text-gray-400">불러오는 중...</div>
    <template v-else-if="client">
      <PageHeader :title="client.name">
        <template #actions>
          <StatusBadge :status="client.status" />
        </template>
      </PageHeader>

      <div class="space-y-4">
        <div class="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <CopyableField :value="client.clientId" label="Client ID" />

          <div v-if="newSecret">
            <div class="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 mb-3">
              새 Client Secret입니다. 지금만 확인 가능합니다.
            </div>
            <CopyableField :value="newSecret" label="New Client Secret" />
          </div>

          <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p class="text-xs text-gray-400 mb-1">타입</p>
              <p class="text-gray-800">{{ client.type }}</p>
            </div>
            <div>
              <p class="text-xs text-gray-400 mb-1">생성일</p>
              <p class="text-gray-800">{{ new Date(client.createdAt).toLocaleDateString('ko-KR') }}</p>
            </div>
            <div>
              <p class="text-xs text-gray-400 mb-1">허용 스코프</p>
              <p class="text-gray-800 font-mono text-xs">{{ client.allowedScopes.join(', ') }}</p>
            </div>
            <div>
              <p class="text-xs text-gray-400 mb-1">허용 Grant</p>
              <p class="text-gray-800 font-mono text-xs">{{ client.allowedGrants.join(', ') }}</p>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-gray-200 p-5">
          <h2 class="text-sm font-semibold text-gray-900 mb-3">시크릿 관리</h2>
          <button
            :disabled="rotating"
            class="px-4 py-2 text-sm border border-orange-300 text-orange-700 rounded-lg hover:bg-orange-50 disabled:opacity-50 transition-colors"
            @click="showRotateConfirm = true"
          >
            {{ rotating ? '회전 중...' : 'Client Secret 재발급' }}
          </button>
        </div>
      </div>
    </template>

    <ConfirmDialog
      :open="showRotateConfirm"
      title="Client Secret 재발급"
      message="기존 Secret은 즉시 무효화됩니다. 계속하시겠습니까?"
      confirm-label="재발급"
      danger
      @confirm="rotateSecret"
      @cancel="showRotateConfirm = false"
    />
  </div>
</template>
