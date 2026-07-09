<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { tenantsApi, type Tenant, type UpdateTenantPayload } from '@/api/tenants'
import PageHeader from '@/components/shared/PageHeader.vue'
import StatusBadge from '@/components/shared/StatusBadge.vue'

const route = useRoute()
const id = (route.params.tenantId || route.params.id) as string

const tenant = ref<Tenant | null>(null)
const loading = ref(true)

// ── 이름 수정 ────────────────────────────────────────────
const editingName = ref(false)
const editName = ref('')
const savingName = ref(false)
const nameError = ref('')

function startEditName() {
  if (!tenant.value) return
  editName.value = tenant.value.name
  nameError.value = ''
  editingName.value = true
}

function cancelEditName() {
  editingName.value = false
}

async function saveNameEdit() {
  if (!editName.value.trim()) {
    nameError.value = '이름을 입력하세요.'
    return
  }
  savingName.value = true
  nameError.value = ''
  try {
    const { data } = await tenantsApi.update(id, { name: editName.value.trim() })
    tenant.value = data
    editingName.value = false
  } catch {
    nameError.value = '저장 중 오류가 발생했습니다.'
  } finally {
    savingName.value = false
  }
}

// ── 보안 설정 ────────────────────────────────────────────
const saving = ref(false)
const error = ref('')
const successMsg = ref('')

async function load() {
  loading.value = true
  try {
    const { data } = await tenantsApi.findOne(id)
    tenant.value = data
  } finally {
    loading.value = false
  }
}

// 이메일 인증과 자동 활성화는 상호배타. 이메일 인증을 켜면 자동 활성화를 끈다.
function onEmailVerificationChange() {
  if (!tenant.value) return
  if (tenant.value.settings.emailVerificationRequired) {
    tenant.value.settings.autoActivateRegistration = false
  }
}

async function saveSettings() {
  if (!tenant.value) return
  if (!tenant.value.settings.allowRegistration) {
    tenant.value.settings.autoActivateRegistration = false
    tenant.value.settings.emailVerificationRequired = false
  }
  if (tenant.value.settings.emailVerificationRequired) {
    tenant.value.settings.autoActivateRegistration = false
  }
  saving.value = true
  error.value = ''
  successMsg.value = ''
  try {
    const settings: NonNullable<UpdateTenantPayload['settings']> = {
      accessTokenTtl: tenant.value.settings.accessTokenTtl,
      refreshTokenTtl: tenant.value.settings.refreshTokenTtl,
      requirePkce: tenant.value.settings.requirePkce,
      passwordMinLength: tenant.value.settings.passwordMinLength,
      accountDeletionGracePeriodDays: tenant.value.settings.accountDeletionGracePeriodDays,
      refreshTokenRotation: tenant.value.settings.refreshTokenRotation,
      allowRegistration: tenant.value.settings.allowRegistration,
      autoActivateRegistration: tenant.value.settings.autoActivateRegistration,
      emailVerificationRequired: tenant.value.settings.emailVerificationRequired,
      mailFrom: tenant.value.settings.mailFrom ?? '',
    }
    // 개발용 강제 수신자는 편집 가능(비-production)할 때만 전송한다.
    if (tenant.value.mailDevRedirectEditable) {
      settings.mailDevRedirectTo = tenant.value.settings.mailDevRedirectTo ?? ''
    }
    const { data } = await tenantsApi.update(id, { settings })
    tenant.value = data
    successMsg.value = '설정이 저장됐습니다.'
  } catch {
    error.value = '저장 중 오류가 발생했습니다.'
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div v-if="loading" class="text-sm text-gray-400">불러오는 중...</div>
    <template v-else-if="tenant">
      <PageHeader :title="tenant.name">
        <template #actions>
          <StatusBadge :status="tenant.status" />
        </template>
      </PageHeader>

      <!-- 기본 정보 -->
      <div class="bg-white rounded-xl border border-gray-200 p-5 mb-4 space-y-4">
        <h2 class="text-sm font-semibold text-gray-900">기본 정보</h2>

        <!-- 이름 -->
        <div>
          <p class="text-xs text-gray-400 mb-1">이름</p>
          <template v-if="!editingName">
            <div class="flex items-center gap-3">
              <p class="text-sm text-gray-800">{{ tenant.name }}</p>
              <button
                class="text-xs text-indigo-600 hover:underline"
                @click="startEditName"
              >
                수정
              </button>
            </div>
          </template>
          <template v-else>
            <div class="flex items-center gap-2">
              <input
                v-model="editName"
                type="text"
                class="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent w-64"
                @keyup.enter="saveNameEdit"
                @keyup.esc="cancelEditName"
              />
              <button
                :disabled="savingName"
                class="px-3 py-1.5 text-xs bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                @click="saveNameEdit"
              >
                {{ savingName ? '저장 중...' : '저장' }}
              </button>
              <button
                class="px-3 py-1.5 text-xs border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                @click="cancelEditName"
              >
                취소
              </button>
            </div>
            <p v-if="nameError" class="mt-1 text-xs text-red-600">{{ nameError }}</p>
          </template>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p class="text-xs text-gray-400 mb-1">슬러그</p>
            <p class="text-sm font-mono text-gray-800">{{ tenant.slug }}</p>
          </div>
          <div>
            <p class="text-xs text-gray-400 mb-1">Issuer</p>
            <p class="text-sm font-mono text-gray-800">{{ tenant.issuer ?? '—' }}</p>
          </div>
        </div>
      </div>

      <!-- 보안 설정 -->
      <div class="bg-white rounded-xl border border-gray-200 p-6">
        <h2 class="text-sm font-semibold text-gray-900 mb-4">보안 설정</h2>
        <form class="space-y-4" @submit.prevent="saveSettings">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Access Token TTL (초)</label>
              <input
                v-model.number="tenant.settings.accessTokenTtl"
                type="number"
                min="60"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Refresh Token TTL (초)</label>
              <input
                v-model.number="tenant.settings.refreshTokenTtl"
                type="number"
                min="60"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">최소 비밀번호 길이</label>
              <input
                v-model.number="tenant.settings.passwordMinLength"
                type="number"
                min="6"
                max="128"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">계정 삭제 유예기간(일)</label>
              <input
                v-model.number="tenant.settings.accountDeletionGracePeriodDays"
                type="number"
                min="1"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>

          <div class="flex items-center gap-6">
            <label class="flex items-center gap-2 cursor-pointer">
              <input v-model="tenant.settings.requirePkce" type="checkbox" class="rounded" />
              <span class="text-sm text-gray-700">PKCE 강제</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input v-model="tenant.settings.refreshTokenRotation" type="checkbox" class="rounded" />
              <span class="text-sm text-gray-700">Refresh Token Rotation</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input v-model="tenant.settings.allowRegistration" type="checkbox" class="rounded" />
              <span class="text-sm text-gray-700">회원가입 허용</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                v-model="tenant.settings.autoActivateRegistration"
                type="checkbox"
                class="rounded disabled:opacity-50"
                :disabled="!tenant.settings.allowRegistration || tenant.settings.emailVerificationRequired"
              />
              <span class="text-sm text-gray-700">자동 활성화</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                v-model="tenant.settings.emailVerificationRequired"
                type="checkbox"
                class="rounded disabled:opacity-50"
                :disabled="!tenant.settings.allowRegistration"
                @change="onEmailVerificationChange"
              />
              <span class="text-sm text-gray-700">이메일 인증</span>
            </label>
          </div>
          <p v-if="tenant.settings.emailVerificationRequired" class="text-xs text-gray-400 -mt-2">
            회원가입 시 입력한 이메일로 인증 링크를 발송하며, 링크 클릭 후 계정이 활성화됩니다.
          </p>

          <!-- 메일 설정 -->
          <div class="border-t border-gray-100 pt-4 space-y-4">
            <h3 class="text-sm font-semibold text-gray-900">메일 설정</h3>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">발신자 주소</label>
              <input
                v-model="tenant.settings.mailFrom"
                type="text"
                placeholder="Acme <no-reply@acme.com>"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <p class="mt-1 text-xs text-gray-400">
                인증 메일의 발신자 주소입니다. 비워두면 기본 발신자가 사용됩니다.
              </p>
            </div>
            <div v-if="tenant.mailDevRedirectEditable">
              <label class="block text-sm font-medium text-gray-700 mb-1">개발용 강제 수신자</label>
              <input
                v-model="tenant.settings.mailDevRedirectTo"
                type="text"
                placeholder="dev1@acme.com, dev2@acme.com"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <p class="mt-1 text-xs text-gray-400">
                개발 환경 전용입니다. 설정 시 모든 인증 메일이 이 주소로만 발송됩니다.
                콤마(,)로 여러 주소를 입력하면 모두에게 동시 발송됩니다.
              </p>
            </div>
          </div>

          <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
          <p v-if="successMsg" class="text-sm text-green-600">{{ successMsg }}</p>

          <div class="flex justify-end">
            <button
              type="submit"
              :disabled="saving"
              class="px-4 py-2 text-sm bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {{ saving ? '저장 중...' : '저장' }}
            </button>
          </div>
        </form>
      </div>
    </template>
  </div>
</template>
