<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { usersApi } from '@/api/users'
import { schemasApi, type ProfileSchemaVersion } from '@/api/schemas'
import { SchemaStatus } from '@/api/enums'
import PageHeader from '@/components/shared/PageHeader.vue'

const router = useRouter()
const route = useRoute()
const tenantId = route.params.tenantId as string

// ── 기본 필드 ─────────────────────────────────────────
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

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

const activeSchema = ref<ProfileSchemaVersion | null>(null)
const schemaFields = ref<FieldDef[]>([])
const profileValues = ref<Record<string, unknown>>({})
const schemaLoading = ref(true)

// 고급 JSON 직접 입력 모드
const directEditMode = ref(false)
const profileJson = ref('{}')
const jsonError = ref('')

function parseJsonSchema(schema: Record<string, unknown>): FieldDef[] {
  const props = (schema.properties as Record<string, Record<string, unknown>>) ?? {}
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
      field.enumValues = (def.enum as unknown[]).map(String)
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
  const values: Record<string, unknown> = {}
  for (const f of fields) {
    if (f.type === 'boolean') values[f.key] = false
    else if (f.type === 'enum') values[f.key] = f.enumValues[0] ?? ''
    else if (f.type === 'number' || f.type === 'integer') values[f.key] = ''
    else values[f.key] = ''
  }
  profileValues.value = values
}

onMounted(async () => {
  try {
    const { data } = await schemasApi.findAll(tenantId)
    const published = data.find((s) => s.status === SchemaStatus.PUBLISHED)
    const schema = published ?? data[0] ?? null
    if (schema) {
      activeSchema.value = schema
      schemaFields.value = parseJsonSchema(schema.schemaJsonb)
      initProfileValues(schemaFields.value)
    }
  } catch {
    // 스키마 없음 — 계속 진행
  } finally {
    schemaLoading.value = false
  }
})

// 프로필 객체 빌드
const builtProfile = computed<Record<string, unknown>>(() => {
  const result: Record<string, unknown> = {}
  for (const f of schemaFields.value) {
    const v = profileValues.value[f.key]
    if (v === '' || v === null || v === undefined) continue
    if (f.type === 'number') result[f.key] = Number(v)
    else if (f.type === 'integer') result[f.key] = parseInt(String(v), 10)
    else result[f.key] = v
  }
  return result
})

function validateJson() {
  try {
    JSON.parse(profileJson.value)
    jsonError.value = ''
    return true
  } catch {
    jsonError.value = '올바른 JSON 형식이 아닙니다.'
    return false
  }
}

function toggleDirectEdit() {
  if (!directEditMode.value) {
    profileJson.value = JSON.stringify(builtProfile.value, null, 2)
    jsonError.value = ''
    directEditMode.value = true
  } else {
    if (!validateJson()) return
    directEditMode.value = false
  }
}

// 필드 유효성 검사
const fieldErrors = ref<Record<string, string>>({})

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
  error.value = ''

  if (directEditMode.value) {
    if (!validateJson()) return
  } else {
    if (!validateFields()) return
  }

  loading.value = true
  try {
    let profile: Record<string, unknown> | undefined

    if (directEditMode.value) {
      const parsed = JSON.parse(profileJson.value)
      profile = Object.keys(parsed).length > 0 ? parsed : undefined
    } else if (schemaFields.value.length > 0) {
      profile = Object.keys(builtProfile.value).length > 0 ? builtProfile.value : undefined
    }

    await usersApi.create(tenantId, {
      email: email.value,
      password: password.value,
      profile,
    })
    router.push({ name: 'user-list', params: { tenantId } })
  } catch (e: unknown) {
    const axiosError = e as { response?: { data?: { message?: string } } }
    error.value = axiosError.response?.data?.message ?? '생성 중 오류가 발생했습니다.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="max-w-lg">
    <PageHeader title="사용자 생성" />

    <div class="bg-white rounded-xl border border-gray-200 p-6">
      <form class="space-y-4" @submit.prevent="submit">
        <!-- 기본 정보 -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">이메일 <span class="text-red-500">*</span></label>
          <input
            v-model="email"
            type="email"
            required
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">비밀번호 <span class="text-red-500">*</span></label>
          <input
            v-model="password"
            type="password"
            required
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        <!-- 프로필 필드 구분선 -->
        <div v-if="!schemaLoading && schemaFields.length > 0" class="border-t border-gray-100 pt-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-medium text-gray-700">프로필 정보</h3>
            <button
              type="button"
              class="text-xs text-gray-400 hover:text-indigo-600 underline underline-offset-2 transition-colors"
              @click="toggleDirectEdit"
            >
              {{ directEditMode ? '시각적 편집기로 전환' : 'JSON으로 직접 입력' }}
            </button>
          </div>

          <!-- 시각적 편집기 -->
          <div v-if="!directEditMode" class="space-y-3">
            <div v-for="field in schemaFields" :key="field.key">
              <label class="block text-sm font-medium text-gray-700 mb-1">
                {{ field.label }}
                <span v-if="field.required" class="text-red-500">*</span>
                <span class="ml-1 text-xs text-gray-400 font-normal font-mono">{{ field.key }}</span>
              </label>

              <!-- boolean: 체크박스 -->
              <template v-if="field.type === 'boolean'">
                <label class="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    v-model="profileValues[field.key]"
                    type="checkbox"
                    class="w-4 h-4 accent-indigo-600"
                  />
                  <span class="text-sm text-gray-600">예</span>
                </label>
              </template>

              <!-- enum: 선택 -->
              <template v-else-if="field.type === 'enum'">
                <select
                  v-model="profileValues[field.key]"
                  class="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  :class="fieldErrors[field.key] ? 'border-red-400' : 'border-gray-300'"
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
                  class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  :class="fieldErrors[field.key] ? 'border-red-400' : 'border-gray-300'"
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
                  class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  :class="fieldErrors[field.key] ? 'border-red-400' : 'border-gray-300'"
                />
              </template>

              <p v-if="fieldErrors[field.key]" class="text-xs text-red-500 mt-1">
                {{ fieldErrors[field.key] }}
              </p>
            </div>
          </div>

          <!-- JSON 직접 입력 -->
          <div v-else>
            <textarea
              v-model="profileJson"
              rows="8"
              spellcheck="false"
              class="w-full px-3 py-2 border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
              :class="jsonError ? 'border-red-400' : 'border-gray-300'"
              @blur="validateJson"
            />
            <p v-if="jsonError" class="text-xs text-red-500 mt-1">{{ jsonError }}</p>
          </div>
        </div>

        <!-- 스키마 없음: 빈 상태 안내 -->
        <div v-else-if="!schemaLoading && schemaFields.length === 0" class="border-t border-gray-100 pt-4">
          <p class="text-xs text-gray-400">발행된 프로필 스키마가 없어 프로필 필드를 표시할 수 없습니다.</p>
        </div>

        <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

        <div class="flex justify-end gap-3 pt-2">
          <button
            type="button"
            class="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            @click="router.back()"
          >
            취소
          </button>
          <button
            type="submit"
            :disabled="loading"
            class="px-4 py-2 text-sm bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {{ loading ? '생성 중...' : '생성' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
