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

// ── 수정 모드 ───────────────────────────────────────────
const editing = ref(false)
const editName = ref('')
const editScopes = ref('')
const editGrants = ref<string[]>([])
const editRedirectUris = ref('')
const saving = ref(false)
const saveError = ref('')

const GRANT_OPTIONS = [
  { value: 'authorization_code', label: 'Authorization Code', description: '사용자 로그인 플로우 (PKCE 포함)' },
  { value: 'refresh_token', label: 'Refresh Token', description: '액세스 토큰 갱신' },
  { value: 'client_credentials', label: 'Client Credentials', description: '서버 간 인증 (사용자 없음)' },
] as const

function startEdit() {
  if (!client.value) return
  editName.value = client.value.name
  editScopes.value = client.value.allowedScopes.join(' ')
  editGrants.value = [...client.value.allowedGrants]
  editRedirectUris.value = client.value.redirectUris.map((r) => r.uri).join('\n')
  saveError.value = ''
  editing.value = true
}

function cancelEdit() {
  editing.value = false
}

async function saveEdit() {
  if (editGrants.value.length === 0) {
    saveError.value = '하나 이상의 Grant Type을 선택하세요.'
    return
  }
  saving.value = true
  saveError.value = ''
  try {
    const { data } = await clientsApi.update(tenantId, clientId, {
      name: editName.value,
      allowedScopes: editScopes.value.split(/\s+/).filter(Boolean),
      allowedGrants: editGrants.value,
      redirectUris: editRedirectUris.value.split('\n').map((s) => s.trim()).filter(Boolean),
    })
    client.value = data
    editing.value = false
  } catch (e: unknown) {
    const axiosError = e as { response?: { data?: { message?: string | string[] } } }
    const msg = axiosError.response?.data?.message
    saveError.value = Array.isArray(msg) ? msg.join(', ') : (msg ?? '저장 중 오류가 발생했습니다.')
  } finally {
    saving.value = false
  }
}

async function load() {
  const { data } = await clientsApi.findOne(tenantId, clientId)
  client.value = data
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
        <!-- 기본 정보 -->
        <div class="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <CopyableField :value="client.clientId" label="Client ID" />

          <div v-if="newSecret">
            <div class="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 mb-3">
              새 Client Secret입니다. 지금만 확인 가능합니다.
            </div>
            <CopyableField :value="newSecret" label="New Client Secret" />
          </div>

          <!-- 보기 모드 -->
          <template v-if="!editing">
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
                <p class="text-gray-800 font-mono text-xs">{{ client.allowedScopes.join(' ') }}</p>
              </div>
              <div>
                <p class="text-xs text-gray-400 mb-1">허용 Grant</p>
                <p class="text-gray-800 font-mono text-xs">{{ client.allowedGrants.join(', ') }}</p>
              </div>
              <div class="col-span-2">
                <p class="text-xs text-gray-400 mb-1">Redirect URIs</p>
                <p
                  v-for="r in client.redirectUris"
                  :key="r.uri"
                  class="text-gray-800 font-mono text-xs"
                >{{ r.uri }}</p>
                <p v-if="client.redirectUris.length === 0" class="text-gray-400 text-xs">—</p>
              </div>
            </div>
            <div class="pt-2">
              <button
                class="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                @click="startEdit"
              >
                수정
              </button>
            </div>
          </template>

          <!-- 편집 모드 -->
          <template v-else>
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">클라이언트 이름</label>
                <input
                  v-model="editName"
                  type="text"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">허용 Grant Type</label>
                <div class="space-y-2">
                  <label
                    v-for="opt in GRANT_OPTIONS"
                    :key="opt.value"
                    class="flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors"
                    :class="editGrants.includes(opt.value)
                      ? 'border-indigo-300 bg-indigo-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'"
                  >
                    <input
                      v-model="editGrants"
                      type="checkbox"
                      :value="opt.value"
                      class="mt-0.5 w-4 h-4 accent-indigo-600 cursor-pointer shrink-0"
                    />
                    <div>
                      <div class="text-sm font-medium text-gray-800">{{ opt.label }}</div>
                      <div class="text-xs text-gray-500 mt-0.5">{{ opt.description }}</div>
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">허용 스코프 <span class="text-xs font-normal text-gray-400">(공백 구분)</span></label>
                <input
                  v-model="editScopes"
                  type="text"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Redirect URIs <span class="text-xs font-normal text-gray-400">(줄바꿈 구분)</span></label>
                <textarea
                  v-model="editRedirectUris"
                  rows="3"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                />
              </div>

              <p v-if="saveError" class="text-sm text-red-600">{{ saveError }}</p>

              <div class="flex gap-3">
                <button
                  type="button"
                  :disabled="saving"
                  class="px-4 py-2 text-sm bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  @click="saveEdit"
                >
                  {{ saving ? '저장 중...' : '저장' }}
                </button>
                <button
                  type="button"
                  class="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  @click="cancelEdit"
                >
                  취소
                </button>
              </div>
            </div>
          </template>
        </div>

        <!-- 시크릿 관리 -->
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
