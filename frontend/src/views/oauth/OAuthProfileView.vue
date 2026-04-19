<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { LoginBranding } from '@/api/clients'
import { oauthApi, type UserinfoResponse } from '@/api/oauth'

const route = useRoute()
const router = useRouter()

const tenantSlug = (route.query.tenantSlug as string) || ''
const token = (route.query.token as string) || localStorage.getItem('user_token') || ''
const clientId = (route.query.clientId as string) || ''

const loading = ref(true)
const saving = ref(false)
const error = ref('')
const successMessage = ref('')

const branding = ref<LoginBranding>({})
const clientName = ref('')
const userinfo = ref<UserinfoResponse | null>(null)
const loginId = ref('')

// ── 스키마 기반 프로필 ──────────────────────────────────
type FieldType = 'string' | 'number' | 'integer' | 'boolean' | 'enum'

interface FieldDef {
  key: string
  label: string
  type: FieldType | string
  required: boolean
  minLength?: number | null
  maxLength?: number | null
  pattern?: string
  minimum?: number | null
  maximum?: number | null
  enumValues: string[]
}

const schemaFields = ref<FieldDef[]>([])
const profileValues = ref<Record<string, any>>({})
const fieldErrors = ref<Record<string, string>>({})

function parseJsonSchema(schema: Record<string, any>): FieldDef[] {
  const props = (schema.properties as Record<string, Record<string, any>>) ?? {}
  const req = (schema.required as string[]) ?? []
  const order = (schema['x-order'] as string[]) ?? []

  const entries = Object.entries(props)
  if (order.length > 0) {
    entries.sort(([a], [b]) => {
      const ai = order.indexOf(a)
      const bi = order.indexOf(b)
      const an = ai === -1 ? Infinity : ai
      const bn = bi === -1 ? Infinity : bi
      return an - bn
    })
  }

  return entries.map(([key, def]) => {
    const field: FieldDef = {
      key,
      label: (def.title as string) ?? key,
      type: 'string',
      required: req.includes(key),
      enumValues: [],
    }
    if ('enum' in def) {
      field.type = 'enum'
      field.enumValues = (def.enum as any[]).map(String)
    } else {
      field.type = (def.type as string) ?? 'string'
      if (def.minLength != null) field.minLength = def.minLength as number
      if (def.maxLength != null) field.maxLength = def.maxLength as number
      if (def.pattern) field.pattern = def.pattern as string
      if (def.minimum != null) field.minimum = def.minimum as number
      if (def.maximum != null) field.maximum = def.maximum as number
    }
    return field
  })
}

function initProfileValues(fields: FieldDef[], existingProfile: Record<string, any> = {}) {
  const values: Record<string, any> = {}
  for (const f of fields) {
    const existingValue = existingProfile[f.key]
    if (existingValue !== undefined) {
      values[f.key] = existingValue
    } else {
      if (f.type === 'boolean') values[f.key] = false
      else if (f.type === 'enum') values[f.key] = f.enumValues[0] ?? ''
      else if (f.type === 'number' || f.type === 'integer') values[f.key] = ''
      else values[f.key] = ''
    }
  }
  profileValues.value = values
}

function applyBranding(b: LoginBranding) {
  const root = document.documentElement
  if (b.bgColor) {
    root.style.setProperty('--auth-bg-color', b.bgColor)
  }
  if (b.primaryColor) {
    root.style.setProperty('--auth-primary-color', b.primaryColor)
  }
}

onUnmounted(() => {
  const root = document.documentElement
  root.style.removeProperty('--auth-bg-color')
  root.style.removeProperty('--auth-primary-color')
})

onMounted(async () => {
  if (!tenantSlug || !token) {
    error.value = '인증 정보가 부족합니다. 토큰과 테넌트 정보가 필요합니다.'
    loading.value = false
    return
  }

  try {
    // 1. Userinfo 조회
    const { data: info } = await oauthApi.userinfo(tenantSlug, token)
    userinfo.value = info
    loginId.value = info.loginId ?? ''

    // 2. Login Config (Branding + Schema) 조회
    const { data: config } = await oauthApi.getLoginConfig(tenantSlug, clientId || undefined)
    clientName.value = config.clientName
    branding.value = config.branding ?? {}
    applyBranding(branding.value)

    if (config.activeSchema) {
      schemaFields.value = parseJsonSchema(config.activeSchema.schemaJsonb)
      initProfileValues(schemaFields.value, info.profile ?? {})
    }
    
    // 토큰 저장 (필요 시)
    localStorage.setItem('user_token', token)
  } catch (e: any) {
    if (e.response?.status === 401) {
      error.value = '인증 세션이 만료되었습니다. 다시 로그인해 주세요.'
    } else {
      error.value = '정보를 불러오는 중 오류가 발생했습니다.'
    }
  } finally {
    loading.value = false
  }
})

const builtProfile = computed<Record<string, any>>(() => {
  const result: Record<string, any> = {}
  for (const f of schemaFields.value) {
    const v = profileValues.value[f.key]
    if (v === '' || v === null || v === undefined) continue
    if (f.type === 'number') result[f.key] = Number(v)
    else if (f.type === 'integer') result[f.key] = parseInt(String(v), 10)
    else result[f.key] = v
  }
  return result
})

function validateFields(): boolean {
  const errors: Record<string, string> = {}
  for (const f of schemaFields.value) {
    const v = profileValues.value[f.key]
    if (f.required && (v === '' || v === null || v === undefined)) {
      errors[f.key] = `${f.label} 항목은 필수입니다.`
      continue
    }
    if (f.type === 'string' && typeof v === 'string') {
      if (f.minLength != null && v.length < f.minLength)
        errors[f.key] = `최소 ${f.minLength}자 이상 입력하세요.`
      else if (f.maxLength != null && v.length > f.maxLength)
        errors[f.key] = `최대 ${f.maxLength}자까지 입력할 수 있습니다.`
      else if (f.pattern && v && !new RegExp(f.pattern).test(v))
        errors[f.key] = `형식이 올바르지 않습니다. (${f.pattern})`
    }
    if ((f.type === 'number' || f.type === 'integer') && v !== '') {
      const n = Number(v)
      if (f.minimum != null && n < f.minimum)
        errors[f.key] = `${f.minimum} 이상이어야 합니다.`
      else if (f.maximum != null && n > f.maximum)
        errors[f.key] = `${f.maximum} 이하이어야 합니다.`
    }
  }
  fieldErrors.value = errors
  return Object.keys(errors).length === 0
}

async function submit() {
  if (!validateFields()) return

  error.value = ''
  successMessage.value = ''
  saving.value = true
  try {
    await oauthApi.updateUserinfo(tenantSlug, token, {
      loginId: loginId.value || undefined,
      profile: builtProfile.value,
    })
    successMessage.value = '프로필이 성공적으로 업데이트되었습니다.'
  } catch (e: any) {
    const msg = e.response?.data?.message ?? ''
    if (msg === 'insufficient_scope') {
      error.value = '프로필을 수정할 권한이 없습니다. (profile:write 스코프 필요)'
    } else {
      error.value = msg || '업데이트 중 오류가 발생했습니다.'
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <!-- 로고 -->
    <div v-if="branding.logoUrl" class="flex justify-center mb-5">
      <img :src="branding.logoUrl" alt="logo" class="h-12 object-contain" />
    </div>

    <h1 class="text-xl font-bold text-gray-800 text-center mb-6">
      {{ branding.title || '내 프로필 관리' }}
    </h1>

    <div v-if="loading" class="text-center py-8 text-gray-400">
      정보를 불러오는 중...
    </div>

    <div v-else-if="error && !userinfo" class="text-center text-sm text-red-600 bg-red-50 p-4 rounded-lg">
      {{ error }}
    </div>

    <div v-else>
      <form class="space-y-4" @submit.prevent="submit">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">이메일 (수정 불가)</label>
          <input
            :value="userinfo?.email"
            type="email"
            disabled
            class="w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-lg text-sm text-gray-500 cursor-not-allowed"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">로그인 ID</label>
          <input
            v-model="loginId"
            type="text"
            placeholder="아이디"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent"
            :style="branding.primaryColor ? { '--tw-ring-color': branding.primaryColor } : {}"
          />
        </div>

        <!-- 프로필 스키마 필드 -->
        <div v-if="schemaFields.length > 0" class="border-t border-gray-100 pt-4 space-y-3">
          <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">추가 프로필 정보</p>
          
          <div v-for="field in schemaFields" :key="field.key">
            <label class="block text-sm font-medium text-gray-700 mb-1">
              {{ field.label }}
              <span v-if="field.required" class="text-red-500">*</span>
            </label>

            <!-- boolean: 체크박스 -->
            <template v-if="field.type === 'boolean'">
              <label class="inline-flex items-center gap-2 cursor-pointer">
                <input
                  v-model="profileValues[field.key]"
                  type="checkbox"
                  class="w-4 h-4"
                  :style="branding.primaryColor ? { accentColor: branding.primaryColor } : {}"
                />
                <span class="text-sm text-gray-600">예</span>
              </label>
            </template>

            <!-- enum: 선택 -->
            <template v-else-if="field.type === 'enum'">
              <select
                v-model="profileValues[field.key]"
                class="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:border-transparent"
                :class="fieldErrors[field.key] ? 'border-red-400' : 'border-gray-300'"
                :style="branding.primaryColor ? { '--tw-ring-color': branding.primaryColor } : {}"
              >
                <option v-if="!field.required" value="">선택 안 함</option>
                <option v-for="v in field.enumValues" :key="v" :value="v">{{ v }}</option>
              </select>
            </template>

            <!-- number / integer -->
            <template v-else-if="field.type === 'number' || field.type === 'integer'">
              <input
                v-model="profileValues[field.key]"
                type="number"
                :min="field.minimum ?? undefined"
                :max="field.maximum ?? undefined"
                :step="field.type === 'integer' ? 1 : undefined"
                class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                :class="fieldErrors[field.key] ? 'border-red-400' : 'border-gray-300'"
                :style="branding.primaryColor ? { '--tw-ring-color': branding.primaryColor } : {}"
              />
            </template>

            <!-- string (기본) -->
            <template v-else>
              <input
                v-model="profileValues[field.key]"
                type="text"
                :minlength="field.minLength ?? undefined"
                :maxlength="field.maxLength ?? undefined"
                :pattern="field.pattern ?? undefined"
                class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                :class="fieldErrors[field.key] ? 'border-red-400' : 'border-gray-300'"
                :style="branding.primaryColor ? { '--tw-ring-color': branding.primaryColor } : {}"
              />
            </template>

            <p v-if="fieldErrors[field.key]" class="text-xs text-red-500 mt-1">
              {{ fieldErrors[field.key] }}
            </p>
          </div>
        </div>

        <p v-if="error" class="text-sm text-red-600 text-center">{{ error }}</p>
        <p v-if="successMessage" class="text-sm text-green-600 text-center">{{ successMessage }}</p>

        <button
          type="submit"
          :disabled="saving"
          class="w-full py-2 px-4 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
          style="background-color: var(--auth-primary-color, #4f46e5)"
        >
          {{ saving ? '저장 중...' : '프로필 저장' }}
        </button>

        <div class="text-center mt-4">
          <button
            type="button"
            class="text-sm text-gray-500 hover:underline"
            @click="router.back()"
          >
            돌아가기
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
