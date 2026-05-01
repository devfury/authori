<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, type LocationQueryValue } from 'vue-router'
import type { LoginBranding } from '@/api/clients'
import { oauthApi } from '@/api/oauth'

const route = useRoute()

function getQueryValue(value: LocationQueryValue | LocationQueryValue[] | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

const requestId = getQueryValue(route.query.requestId)
const tenantSlug = getQueryValue(route.query.tenantSlug)
const clientId = getQueryValue(route.query.clientId)

const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const error = ref('')
const success = ref(false)

const branding = ref<LoginBranding>({})
const clientName = ref('')
const allowRegistration = ref(true)
const autoActivateRegistration = ref(false)

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

function initProfileValues(fields: FieldDef[]) {
  const values: Record<string, any> = {}
  for (const f of fields) {
    if (f.type === 'boolean') values[f.key] = false
    else if (f.type === 'enum') values[f.key] = f.enumValues[0] ?? ''
    else if (f.type === 'number' || f.type === 'integer') values[f.key] = ''
    else values[f.key] = ''
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
  if (!tenantSlug) {
    error.value = '잘못된 접근입니다.'
    return
  }

  try {
    const { data } = await oauthApi.getLoginConfig(tenantSlug, clientId)
    clientName.value = data.clientName
    branding.value = data.branding ?? {}
    allowRegistration.value = data.allowRegistration
    autoActivateRegistration.value = data.autoActivateRegistration
    
    if (!data.allowRegistration) {
      error.value = '이 서비스는 회원가입을 지원하지 않습니다.'
    }

    if (data.activeSchema) {
      schemaFields.value = parseJsonSchema(data.activeSchema.schemaJsonb)
      initProfileValues(schemaFields.value)
    }
    
    applyBranding(branding.value)
  } catch (e) {
    error.value = '정보를 불러오는 중 오류가 발생했습니다.'
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
  if (!tenantSlug || !allowRegistration.value) return
  if (password.value !== confirmPassword.value) {
    error.value = '비밀번호가 일치하지 않습니다.'
    return
  }
  if (!validateFields()) return

  error.value = ''
  loading.value = true
  try {
    const profile = Object.keys(builtProfile.value).length > 0 ? builtProfile.value : undefined
    
    await oauthApi.register(tenantSlug, {
      email: email.value,
      password: password.value,
      profile,
      requestId,
      clientId,
    })
    success.value = true
  } catch (e: any) {
    const msg = e.response?.data?.message ?? ''
    if (msg === 'email_already_exists') {
      error.value = '이미 사용 중인 이메일입니다.'
    } else if (msg === 'registration_disabled') {
      error.value = '이 서비스는 회원가입을 지원하지 않습니다.'
    } else {
      error.value = msg || '회원가입 중 오류가 발생했습니다.'
    }
  } finally {
    loading.value = false
  }
}

const loginRoute = computed(() => ({
  name: 'oauth-login',
  query: route.query,
}))
</script>

<template>
  <div>
    <!-- 상단 타이틀 Teleport -->
    <Teleport v-if="branding.title || clientName" to="#auth-header">
      <h1 class="text-2xl font-bold text-gray-900">{{ branding.title || clientName }}</h1>
    </Teleport>

    <!-- 로고 -->
    <div v-if="branding.logoUrl" class="flex justify-center mb-5">
      <img :src="branding.logoUrl" alt="logo" class="h-12 object-contain" />
    </div>

    <div v-if="success" class="text-center py-4">
      <div class="mb-4 flex justify-center">
        <div class="bg-green-100 p-3 rounded-full">
          <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </div>
      <h2 class="text-xl font-bold text-gray-800 mb-2">가입 신청 완료</h2>
      <p class="text-gray-600 mb-6">
        {{ autoActivateRegistration ? '바로 로그인하실 수 있습니다.' : '관리자 승인 후 로그인하실 수 있습니다.' }}
      </p>
      <RouterLink
        :to="loginRoute"
        class="inline-block py-2 px-6 text-white text-sm font-medium rounded-lg transition-colors"
        style="background-color: var(--auth-primary-color, #4f46e5)"
      >
        로그인으로 돌아가기
      </RouterLink>
    </div>

    <div v-else>
      <h2 class="text-lg font-semibold text-gray-900 text-center mb-6">회원가입</h2>

      <div v-if="error && !allowRegistration" class="text-center text-sm text-red-600 bg-red-50 p-4 rounded-lg">
        {{ error }}
      </div>

      <form v-else class="space-y-4" @submit.prevent="submit">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">이메일 <span class="text-red-500">*</span></label>
          <input
            v-model="email"
            type="email"
            required
            placeholder="user@example.com"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent"
            :style="branding.primaryColor ? { '--tw-ring-color': branding.primaryColor } : {}"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">비밀번호 <span class="text-red-500">*</span></label>
          <input
            v-model="password"
            type="password"
            required
            autocomplete="new-password"
            placeholder="••••••••"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent"
            :style="branding.primaryColor ? { '--tw-ring-color': branding.primaryColor } : {}"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">비밀번호 확인 <span class="text-red-500">*</span></label>
          <input
            v-model="confirmPassword"
            type="password"
            required
            autocomplete="new-password"
            placeholder="••••••••"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent"
            :style="branding.primaryColor ? { '--tw-ring-color': branding.primaryColor } : {}"
          />
        </div>

        <!-- 프로필 스키마 필드 -->
        <div v-if="schemaFields.length > 0" class="border-t border-gray-100 pt-4 space-y-3">
          <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">추가 정보</p>
          
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

        <p v-if="error && allowRegistration" class="text-sm text-red-600 text-center">{{ error }}</p>

        <button
          type="submit"
          :disabled="loading"
          class="w-full py-2 px-4 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
          style="background-color: var(--auth-primary-color, #4f46e5)"
        >
          {{ loading ? '처리 중...' : '회원가입' }}
        </button>

        <div class="text-center mt-4">
          <RouterLink
            :to="loginRoute"
            class="text-sm text-gray-500 hover:underline"
          >
            이미 계정이 있으신가요? 로그인
          </RouterLink>
        </div>
      </form>
    </div>
  </div>
</template>
