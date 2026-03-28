<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { externalAuthApi, type CreateProviderPayload, type FieldMapping } from '@/api/external-auth'
import { clientsApi, type OAuthClient } from '@/api/clients'
import PageHeader from '@/components/shared/PageHeader.vue'

const route = useRoute()
const router = useRouter()
const tenantId = route.params.tenantId as string
const id = route.params.id as string | undefined
const isEdit = computed(() => !!id)

// 폼 상태
const clientId = ref<string>('')
const applyToAll = ref(true)
const enabled = ref(true)
const providerUrl = ref('')
const credentialHeader = ref('')
const credentialValue = ref('')
const jitProvision = ref(true)
const syncOnLogin = ref(false)

// 필드 매핑
const mappingEmail = ref('')
const mappingName = ref('')
const mappingLoginId = ref('')
const profileMappingRows = ref<{ ext: string; local: string }[]>([])

// 클라이언트 목록 (clientId 선택용)
const clients = ref<OAuthClient[]>([])

const loading = ref(false)
const saving = ref(false)
const error = ref('')

function addProfileRow() {
  profileMappingRows.value.push({ ext: '', local: '' })
}

function removeProfileRow(i: number) {
  profileMappingRows.value.splice(i, 1)
}

function buildPayload(): CreateProviderPayload {
  const profileMapping: Record<string, string> = {}
  for (const row of profileMappingRows.value) {
    if (row.ext && row.local) profileMapping[row.ext] = row.local
  }

  const fieldMapping: FieldMapping = {}
  if (mappingEmail.value) fieldMapping.email = mappingEmail.value
  if (mappingName.value) fieldMapping.name = mappingName.value
  if (mappingLoginId.value) fieldMapping.loginId = mappingLoginId.value
  if (Object.keys(profileMapping).length > 0) fieldMapping.profile = profileMapping

  return {
    clientId: applyToAll.value ? null : (clientId.value || null),
    enabled: enabled.value,
    providerUrl: providerUrl.value,
    credentialHeader: credentialHeader.value || null,
    credentialValue: credentialValue.value || null,
    jitProvision: jitProvision.value,
    syncOnLogin: syncOnLogin.value,
    fieldMapping: Object.keys(fieldMapping).length > 0 ? fieldMapping : null,
  }
}

function fillForm(data: Awaited<ReturnType<typeof externalAuthApi.findOne>>['data']) {
  applyToAll.value = !data.clientId
  clientId.value = data.clientId ?? ''
  enabled.value = data.enabled
  providerUrl.value = data.providerUrl
  credentialHeader.value = data.credentialHeader ?? ''
  credentialValue.value = data.credentialValue ?? ''
  jitProvision.value = data.jitProvision
  syncOnLogin.value = data.syncOnLogin
  if (data.fieldMapping) {
    mappingEmail.value = data.fieldMapping.email ?? ''
    mappingName.value = data.fieldMapping.name ?? ''
    mappingLoginId.value = data.fieldMapping.loginId ?? ''
    if (data.fieldMapping.profile) {
      profileMappingRows.value = Object.entries(data.fieldMapping.profile).map(([ext, local]) => ({ ext, local }))
    }
  }
}

async function save() {
  if (!providerUrl.value) {
    error.value = '프로바이더 URL을 입력하세요.'
    return
  }
  saving.value = true
  error.value = ''
  try {
    const payload = buildPayload()
    if (isEdit.value) {
      await externalAuthApi.update(tenantId, id!, payload)
    } else {
      await externalAuthApi.create(tenantId, payload)
    }
    router.push({ name: 'external-auth-list', params: { tenantId } })
  } catch (e: unknown) {
    const axiosError = e as { response?: { data?: { message?: string | string[] } } }
    const msg = axiosError.response?.data?.message
    error.value = Array.isArray(msg) ? msg.join(', ') : (msg ?? '저장 중 오류가 발생했습니다.')
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  loading.value = true
  try {
    const [clientsRes] = await Promise.all([clientsApi.findAll(tenantId)])
    clients.value = clientsRes.data
    if (isEdit.value) {
      const { data } = await externalAuthApi.findOne(tenantId, id!)
      fillForm(data)
    }
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <PageHeader :title="isEdit ? '외부 인증 프로바이더 수정' : '외부 인증 프로바이더 추가'" />

    <div v-if="loading" class="text-sm text-gray-400">불러오는 중...</div>

    <form v-else class="space-y-4 max-w-2xl" @submit.prevent="save">
      <!-- 기본 설정 -->
      <div class="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 class="text-sm font-semibold text-gray-900">기본 설정</h2>

        <div class="flex items-center gap-3">
          <input id="enabledToggle" v-model="enabled" type="checkbox" class="w-4 h-4 accent-indigo-600" />
          <label for="enabledToggle" class="text-sm text-gray-700">프로바이더 활성화</label>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">적용 범위</label>
          <div class="space-y-2">
            <label class="flex items-center gap-2 cursor-pointer">
              <input v-model="applyToAll" type="radio" :value="true" class="accent-indigo-600" />
              <span class="text-sm text-gray-700">테넌트 전체 클라이언트에 적용</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input v-model="applyToAll" type="radio" :value="false" class="accent-indigo-600" />
              <span class="text-sm text-gray-700">특정 클라이언트에만 적용</span>
            </label>
          </div>
          <div v-if="!applyToAll" class="mt-2">
            <select
              v-model="clientId"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">클라이언트 선택</option>
              <option v-for="c in clients" :key="c.clientId" :value="c.clientId">
                {{ c.name }} ({{ c.clientId }})
              </option>
            </select>
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">프로바이더 URL <span class="text-red-500">*</span></label>
          <input
            v-model="providerUrl"
            type="url"
            required
            placeholder="https://legacy-auth.example.com/validate"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">인증 헤더 이름</label>
            <input
              v-model="credentialHeader"
              type="text"
              placeholder="X-Api-Key"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">인증 헤더 값</label>
            <input
              v-model="credentialValue"
              type="password"
              placeholder="API 키 또는 토큰"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      <!-- 프로비저닝 설정 -->
      <div class="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h2 class="text-sm font-semibold text-gray-900">프로비저닝</h2>

        <label class="flex items-start gap-3 cursor-pointer">
          <input v-model="jitProvision" type="checkbox" class="mt-0.5 w-4 h-4 accent-indigo-600 shrink-0" />
          <div>
            <p class="text-sm font-medium text-gray-700">JIT 프로비저닝</p>
            <p class="text-xs text-gray-400 mt-0.5">외부 인증 성공 시 로컬 계정이 없으면 자동 생성</p>
          </div>
        </label>

        <label class="flex items-start gap-3 cursor-pointer">
          <input v-model="syncOnLogin" type="checkbox" class="mt-0.5 w-4 h-4 accent-indigo-600 shrink-0" />
          <div>
            <p class="text-sm font-medium text-gray-700">로그인마다 프로필 동기화</p>
            <p class="text-xs text-gray-400 mt-0.5">매 로그인 성공 시 외부 서비스에서 프로필 데이터를 갱신</p>
          </div>
        </label>
      </div>

      <!-- 필드 매핑 -->
      <div class="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div>
          <h2 class="text-sm font-semibold text-gray-900">필드 매핑 <span class="text-xs font-normal text-gray-400">(선택, 기본값: 동일 이름 사용)</span></h2>
          <p class="text-xs text-gray-400 mt-1">외부 서비스 응답 필드 이름이 기본 규격(email, name, loginId)과 다를 경우 매핑을 설정하세요.</p>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-gray-500 mb-1">이메일 필드</label>
            <input v-model="mappingEmail" type="text" placeholder="email" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">이름 필드</label>
            <input v-model="mappingName" type="text" placeholder="name" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">로그인 ID 필드</label>
            <input v-model="mappingLoginId" type="text" placeholder="loginId" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>

        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="text-xs text-gray-500">프로필 필드 매핑 (외부 → 로컬)</label>
            <button type="button" class="text-xs text-indigo-600 hover:text-indigo-800" @click="addProfileRow">+ 추가</button>
          </div>
          <div v-if="profileMappingRows.length === 0" class="text-xs text-gray-400 py-2">매핑 없음 (외부 profile 필드를 그대로 사용)</div>
          <div v-for="(row, i) in profileMappingRows" :key="i" class="flex gap-2 items-center mb-2">
            <input v-model="row.ext" type="text" placeholder="외부 필드" class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <span class="text-gray-400 text-xs">→</span>
            <input v-model="row.local" type="text" placeholder="로컬 필드" class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <button type="button" class="text-red-400 hover:text-red-600 text-xs px-1" @click="removeProfileRow(i)">✕</button>
          </div>
        </div>
      </div>

      <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

      <div class="flex gap-3">
        <button
          type="submit"
          :disabled="saving"
          class="px-4 py-2 text-sm bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {{ saving ? '저장 중...' : (isEdit ? '저장' : '추가') }}
        </button>
        <button
          type="button"
          class="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          @click="router.push({ name: 'external-auth-list', params: { tenantId } })"
        >
          취소
        </button>
      </div>
    </form>
  </div>
</template>
