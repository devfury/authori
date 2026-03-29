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
const syncOnLogin = ref(true)

// 필드 매핑
const mappingEmail = ref('')
const mappingName = ref('')
const mappingLoginId = ref('')
const profileMappingRows = ref<{ ext: string; local: string }[]>([])

// 클라이언트 목록 (clientId 선택용)
const clients = ref<OAuthClient[]>([])

const loading = ref(false)
const guideOpen = ref(false)
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
      <!-- API 구현 가이드 -->
      <div class="bg-blue-50 border border-blue-200 rounded-xl overflow-hidden">
        <button
          type="button"
          class="w-full flex items-center justify-between px-5 py-3 text-left"
          @click="guideOpen = !guideOpen"
        >
          <div class="flex items-center gap-2">
            <svg class="w-4 h-4 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span class="text-sm font-medium text-blue-800">외부 인증 프로바이더 API 구현 가이드</span>
          </div>
          <svg
            class="w-4 h-4 text-blue-500 transition-transform"
            :class="guideOpen ? 'rotate-180' : ''"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <div v-if="guideOpen" class="px-5 pb-5 space-y-4 border-t border-blue-200">
          <p class="text-xs text-blue-700 pt-3">
            Authori는 사용자 로그인 시 아래 규격으로 외부 인증 서버에 요청합니다. 외부 서버는 이 스펙에 맞게 API를 구현해야 합니다.
          </p>

          <!-- 요청 규격 -->
          <div>
            <p class="text-xs font-semibold text-blue-800 mb-1.5">요청 (Request)</p>
            <div class="bg-white rounded-lg border border-blue-100 p-3 font-mono text-xs text-gray-700 space-y-0.5">
              <p class="text-gray-400">// POST {프로바이더 URL}</p>
              <p class="text-gray-400">// Content-Type: application/json</p>
              <p class="text-gray-400">// {인증 헤더 이름}: {인증 헤더 값}  ← 설정된 경우</p>
              <p class="mt-1">{</p>
              <p class="pl-4">"email": "user@example.com",</p>
              <p class="pl-4">"password": "사용자가 입력한 비밀번호"</p>
              <p>}</p>
            </div>
          </div>

          <!-- 응답 규격 -->
          <div>
            <p class="text-xs font-semibold text-blue-800 mb-1.5">응답 (Response)</p>
            <div class="space-y-2">
              <!-- 성공 -->
              <div>
                <p class="text-xs text-green-700 font-medium mb-1">✓ 인증 성공 (HTTP 200)</p>
                <div class="bg-white rounded-lg border border-green-100 p-3 font-mono text-xs text-gray-700 space-y-0.5">
                  <p>{</p>
                  <p class="pl-4">"authenticated": true,</p>
                  <p class="pl-4">"user": {</p>
                  <p class="pl-8">"email": "user@example.com",  <span class="text-gray-400">// 필수</span></p>
                  <p class="pl-8">"name": "홍길동",             <span class="text-gray-400">// 선택</span></p>
                  <p class="pl-8">"loginId": "gildong",         <span class="text-gray-400">// 선택</span></p>
                  <p class="pl-8">"profile": { ... }            <span class="text-gray-400">// 선택</span></p>
                  <p class="pl-4">}</p>
                  <p>}</p>
                </div>
              </div>

              <!-- 명시적 거부 -->
              <div>
                <p class="text-xs text-red-700 font-medium mb-1">✗ 인증 거부 (HTTP 200, 로컬 폴백 없음)</p>
                <div class="bg-white rounded-lg border border-red-100 p-3 font-mono text-xs text-gray-700 space-y-0.5">
                  <p>{</p>
                  <p class="pl-4">"authenticated": false,</p>
                  <p class="pl-4">"reason": "invalid_password"  <span class="text-gray-400">// 선택</span></p>
                  <p>}</p>
                </div>
                <p class="text-xs text-gray-500 mt-1">외부 서버가 명시적으로 거부한 경우. 로컬 비밀번호 폴백 없이 로그인이 차단됩니다.</p>
              </div>

              <!-- 장애 -->
              <div>
                <p class="text-xs text-orange-700 font-medium mb-1">⚠ 연동 장애 (HTTP 500, 로컬 폴백 허용)</p>
                <div class="bg-white rounded-lg border border-orange-100 p-3 font-mono text-xs text-gray-700">
                  <p class="text-gray-400">// HTTP 500 응답 또는 타임아웃(5초 초과)</p>
                </div>
                <p class="text-xs text-gray-500 mt-1">외부 서버 장애 시 Authori는 로컬 비밀번호로 폴백합니다. 5xx 응답이나 응답 없음으로 장애를 표현하세요.</p>
              </div>
            </div>
          </div>

          <!-- 주의사항 -->
          <div class="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p class="text-xs font-semibold text-amber-800 mb-1">주의사항</p>
            <ul class="text-xs text-amber-700 space-y-1 list-disc list-inside">
              <li>4xx 응답(401, 403 등)은 명시적 거부로 처리됩니다. 장애 표현에는 5xx를 사용하세요.</li>
              <li>Authori는 타임아웃을 <strong>5초</strong>로 설정합니다. 응답이 5초를 초과하면 로컬 폴백이 시도됩니다.</li>
              <li>JIT 프로비저닝이 활성화된 경우 성공 응답의 <code class="bg-amber-100 px-1 rounded">user</code> 필드가 없으면 신규 사용자 생성에 실패합니다.</li>
            </ul>
          </div>
        </div>
      </div>

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
            placeholder="https://your-auth-server.com/auth"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <p class="mt-1.5 text-xs text-gray-500">
            Authori가 이 URL로 <code class="bg-gray-100 px-1 py-0.5 rounded font-mono">POST</code> 요청을 전송합니다.
            베이스 URL이 아닌 <strong>인증 엔드포인트 전체 경로</strong>를 입력하세요.
            예: <code class="bg-gray-100 px-1 py-0.5 rounded font-mono">https://your-auth-server.com/auth</code>
          </p>
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
        <p class="text-xs text-gray-500 mt-1">
          설정 시 Authori가 요청 헤더에 지정한 값을 포함해 전송합니다. 외부 서버에서 해당 헤더를 검증합니다. 설정하지 않으면 헤더 없이 요청합니다.
        </p>
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
