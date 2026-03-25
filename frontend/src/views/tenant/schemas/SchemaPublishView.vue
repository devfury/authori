<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-vue-next'
import { schemasApi } from '@/api/schemas'
import PageHeader from '@/components/shared/PageHeader.vue'

const router = useRouter()
const route = useRoute()
const tenantId = route.params.tenantId as string

// ── 타입 정의 ──────────────────────────────────────────

type FieldType = 'string' | 'number' | 'integer' | 'boolean' | 'enum'

interface FieldDef {
  _id: string
  label: string
  key: string
  type: FieldType
  required: boolean
  minLength?: number | null
  maxLength?: number | null
  pattern?: string
  minimum?: number | null
  maximum?: number | null
  enumValues: string  // 쉼표 구분 문자열
}

// ── 유틸 함수 ──────────────────────────────────────────

function newField(): FieldDef {
  return {
    _id: Math.random().toString(36).slice(2),
    label: '',
    key: '',
    type: 'string',
    required: false,
    enumValues: '',
  }
}

function buildJsonSchema(fields: FieldDef[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  const required: string[] = []

  for (const f of fields) {
    if (!f.key) continue
    if (f.type === 'enum') {
      const values = f.enumValues.split(',').map((v) => v.trim()).filter(Boolean)
      const prop: Record<string, unknown> = { enum: values }
      if (f.label) prop.title = f.label
      properties[f.key] = prop
    } else {
      const prop: Record<string, unknown> = { type: f.type }
      if (f.label) prop.title = f.label
      if (f.type === 'string') {
        if (f.minLength != null) prop.minLength = f.minLength
        if (f.maxLength != null) prop.maxLength = f.maxLength
        if (f.pattern) prop.pattern = f.pattern
      }
      if (f.type === 'number' || f.type === 'integer') {
        if (f.minimum != null) prop.minimum = f.minimum
        if (f.maximum != null) prop.maximum = f.maximum
      }
      properties[f.key] = prop
    }
    if (f.required) required.push(f.key)
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  }
}

function parseJsonSchema(schema: Record<string, unknown>): FieldDef[] {
  const props = (schema.properties as Record<string, Record<string, unknown>>) ?? {}
  const req = (schema.required as string[]) ?? []
  return Object.entries(props).map(([key, def]) => {
    const f = newField()
    f.key = key
    f.label = (def.title as string) ?? key
    f.required = req.includes(key)
    if ('enum' in def) {
      f.type = 'enum'
      f.enumValues = (def.enum as unknown[]).join(', ')
    } else {
      f.type = (def.type as FieldType) ?? 'string'
      if (def.minLength != null) f.minLength = def.minLength as number
      if (def.maxLength != null) f.maxLength = def.maxLength as number
      if (def.pattern) f.pattern = def.pattern as string
      if (def.minimum != null) f.minimum = def.minimum as number
      if (def.maximum != null) f.maximum = def.maximum as number
    }
    return f
  })
}

function checkWarnings(
  prev: Record<string, unknown> | null,
  next: Record<string, unknown>,
): string[] {
  if (!prev) return []
  const warnings: string[] = []
  const prevProps = (prev.properties as Record<string, unknown>) ?? {}
  const nextProps = (next.properties as Record<string, unknown>) ?? {}
  const prevReq = (prev.required as string[]) ?? []
  const nextReq = (next.required as string[]) ?? []

  for (const key of Object.keys(prevProps)) {
    if (!(key in nextProps)) {
      warnings.push(`'${key}' 필드가 제거됐습니다. 기존 사용자 데이터에 이 필드가 있을 수 있습니다.`)
    }
  }
  for (const key of nextReq) {
    if (!prevReq.includes(key)) {
      warnings.push(`'${key}' 필드가 새로 필수 항목이 됩니다. 이 필드가 없는 기존 사용자는 검증에 실패합니다.`)
    }
  }
  for (const [key, def] of Object.entries(nextProps)) {
    if (key in prevProps) {
      const prevType = (prevProps[key] as Record<string, unknown>).type
      const nextType = (def as Record<string, unknown>).type
      if (prevType && nextType && prevType !== nextType) {
        warnings.push(`'${key}' 필드의 타입이 ${prevType} → ${nextType}으로 변경됐습니다.`)
      }
    }
  }
  return warnings
}

// ── 상태 ──────────────────────────────────────────────

const fields = ref<FieldDef[]>([])
const expandedField = ref<string | null>(null)
const showJsonPreview = ref(false)
const directEditMode = ref(false)
const directJson = ref('')
const directJsonError = ref('')
const prevSchema = ref<Record<string, unknown> | null>(null)
const loading = ref(false)
const error = ref('')

const jsonSchema = computed(() => buildJsonSchema(fields.value))
const jsonPreview = computed(() => JSON.stringify(jsonSchema.value, null, 2))
const warnings = computed(() => checkWarnings(prevSchema.value, jsonSchema.value))

onMounted(async () => {
  try {
    const { data } = await schemasApi.findAll(tenantId)
    if (data.length > 0) {
      prevSchema.value = data[0].schemaJsonb
      fields.value = parseJsonSchema(data[0].schemaJsonb)
    }
  } catch {
    // 이전 스키마 없음 — 빈 상태로 시작
  }
})

// ── 액션 ──────────────────────────────────────────────

function addField() {
  const f = newField()
  fields.value.push(f)
}

function removeField(id: string) {
  fields.value = fields.value.filter((f) => f._id !== id)
  if (expandedField.value === id) expandedField.value = null
}

function toggleExpand(id: string) {
  expandedField.value = expandedField.value === id ? null : id
}

function onTypeChange(field: FieldDef) {
  field.minLength = null
  field.maxLength = null
  field.pattern = ''
  field.minimum = null
  field.maximum = null
  field.enumValues = ''
  if (field.type === 'enum') expandedField.value = field._id
}

function toggleDirectEdit() {
  if (!directEditMode.value) {
    directJson.value = jsonPreview.value
    directJsonError.value = ''
    directEditMode.value = true
  } else {
    if (!validateDirectJson()) return
    try {
      fields.value = parseJsonSchema(JSON.parse(directJson.value))
      directEditMode.value = false
    } catch {
      directJsonError.value = '올바른 JSON Schema 형식이 아닙니다.'
    }
  }
}

function validateDirectJson() {
  try {
    JSON.parse(directJson.value)
    directJsonError.value = ''
    return true
  } catch {
    directJsonError.value = '올바른 JSON 형식이 아닙니다.'
    return false
  }
}

async function submit() {
  let schemaToPublish: Record<string, unknown>

  if (directEditMode.value) {
    if (!validateDirectJson()) return
    schemaToPublish = JSON.parse(directJson.value)
  } else {
    const emptyKey = fields.value.find((f) => !f.key)
    if (emptyKey) {
      error.value = '키가 비어 있는 필드가 있습니다.'
      return
    }
    schemaToPublish = jsonSchema.value
  }

  loading.value = true
  error.value = ''
  try {
    await schemasApi.publish(tenantId, { schemaJsonb: schemaToPublish })
    router.push({ name: 'schema-list', params: { tenantId } })
  } catch (e: unknown) {
    const axiosError = e as { response?: { data?: { message?: string } } }
    error.value = axiosError.response?.data?.message ?? '발행 중 오류가 발생했습니다.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl">
    <PageHeader title="프로필 스키마 발행" description="사용자 프로필에 포함될 필드를 정의합니다." />

    <!-- 편집 모드 토글 -->
    <div class="flex justify-end mb-3">
      <button
        type="button"
        class="text-xs text-gray-400 hover:text-indigo-600 underline underline-offset-2 transition-colors"
        @click="toggleDirectEdit"
      >
        {{ directEditMode ? '시각적 편집기로 전환' : 'JSON으로 직접 편집' }}
      </button>
    </div>

    <!-- 시각적 편집기 -->
    <div v-if="!directEditMode" class="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
      <!-- 빈 상태 -->
      <div v-if="fields.length === 0" class="py-8 text-center text-sm text-gray-400">
        정의된 필드가 없습니다. 아래 버튼으로 필드를 추가하세요.
      </div>

      <!-- 필드 목록 -->
      <template v-else>
        <!-- 헤더 -->
        <div class="grid grid-cols-[1fr_1fr_110px_52px_28px] gap-2 px-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
          <span>표시명</span>
          <span>키</span>
          <span>타입</span>
          <span class="text-center">필수</span>
          <span></span>
        </div>

        <!-- 필드 행 -->
        <div
          v-for="field in fields"
          :key="field._id"
          class="rounded-lg border border-gray-200"
        >
          <!-- 기본 행 -->
          <div class="grid grid-cols-[1fr_1fr_110px_52px_28px] gap-2 items-center p-2">
            <input
              v-model="field.label"
              type="text"
              placeholder="예: 닉네임"
              class="px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <input
              v-model="field.key"
              type="text"
              placeholder="예: nickname"
              class="px-2 py-1.5 text-sm font-mono border rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400"
              :class="!field.key ? 'border-red-300 bg-red-50' : 'border-gray-200'"
            />
            <select
              v-model="field.type"
              class="px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
              @change="onTypeChange(field)"
            >
              <option value="string">문자열</option>
              <option value="number">숫자</option>
              <option value="integer">정수</option>
              <option value="boolean">참/거짓</option>
              <option value="enum">선택지</option>
            </select>
            <div class="flex justify-center">
              <input
                v-model="field.required"
                type="checkbox"
                class="w-4 h-4 accent-indigo-600 cursor-pointer"
              />
            </div>
            <button
              type="button"
              class="flex items-center justify-center text-gray-300 hover:text-red-400 transition-colors"
              @click="removeField(field._id)"
            >
              <Trash2 class="w-4 h-4" />
            </button>
          </div>

          <!-- 고급 옵션 (boolean 제외) -->
          <div v-if="field.type !== 'boolean'" class="px-3 pb-2">
            <button
              type="button"
              class="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
              @click="toggleExpand(field._id)"
            >
              <ChevronDown v-if="expandedField !== field._id" class="w-3 h-3" />
              <ChevronUp v-else class="w-3 h-3" />
              고급 옵션
            </button>

            <div v-if="expandedField === field._id" class="mt-2">
              <!-- string 옵션 -->
              <template v-if="field.type === 'string'">
                <div class="grid grid-cols-3 gap-2">
                  <div>
                    <label class="block text-xs text-gray-500 mb-1">최소 길이</label>
                    <input
                      v-model.number="field.minLength"
                      type="number"
                      min="0"
                      placeholder="—"
                      class="w-full px-2 py-1 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                  </div>
                  <div>
                    <label class="block text-xs text-gray-500 mb-1">최대 길이</label>
                    <input
                      v-model.number="field.maxLength"
                      type="number"
                      min="0"
                      placeholder="—"
                      class="w-full px-2 py-1 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                  </div>
                  <div>
                    <label class="block text-xs text-gray-500 mb-1">패턴 (정규식)</label>
                    <input
                      v-model="field.pattern"
                      type="text"
                      placeholder="^[a-z]+$"
                      class="w-full px-2 py-1 text-sm font-mono border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                  </div>
                </div>
              </template>

              <!-- number / integer 옵션 -->
              <template v-if="field.type === 'number' || field.type === 'integer'">
                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <label class="block text-xs text-gray-500 mb-1">최솟값</label>
                    <input
                      v-model.number="field.minimum"
                      type="number"
                      placeholder="—"
                      class="w-full px-2 py-1 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                  </div>
                  <div>
                    <label class="block text-xs text-gray-500 mb-1">최댓값</label>
                    <input
                      v-model.number="field.maximum"
                      type="number"
                      placeholder="—"
                      class="w-full px-2 py-1 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                  </div>
                </div>
              </template>

              <!-- enum 옵션 -->
              <template v-if="field.type === 'enum'">
                <div>
                  <label class="block text-xs text-gray-500 mb-1">
                    선택지 <span class="text-gray-400">(쉼표로 구분)</span>
                  </label>
                  <input
                    v-model="field.enumValues"
                    type="text"
                    placeholder="남성, 여성, 기타"
                    class="w-full px-2 py-1 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                  <!-- 선택지 미리보기 -->
                  <div v-if="field.enumValues" class="flex flex-wrap gap-1 mt-1.5">
                    <span
                      v-for="v in field.enumValues.split(',').map(s => s.trim()).filter(Boolean)"
                      :key="v"
                      class="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded"
                    >
                      {{ v }}
                    </span>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </template>

      <!-- 필드 추가 버튼 -->
      <button
        type="button"
        class="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
        @click="addField"
      >
        <Plus class="w-4 h-4" />
        필드 추가
      </button>
    </div>

    <!-- JSON 직접 편집 -->
    <div v-else class="bg-white rounded-xl border border-gray-200 p-6">
      <textarea
        v-model="directJson"
        rows="18"
        spellcheck="false"
        class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
        :class="directJsonError ? 'border-red-400' : ''"
        @blur="validateDirectJson"
      />
      <p v-if="directJsonError" class="text-xs text-red-500 mt-1">{{ directJsonError }}</p>
      <p class="text-xs text-gray-400 mt-1">JSON Schema Draft-07 형식을 지원합니다.</p>
    </div>

    <!-- JSON Schema 미리보기 (시각적 편집기 모드에서만) -->
    <div v-if="!directEditMode" class="mt-3 rounded-xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        class="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 text-xs text-gray-500 hover:bg-gray-100 transition-colors"
        @click="showJsonPreview = !showJsonPreview"
      >
        <span class="font-medium">JSON Schema 미리보기</span>
        <ChevronDown v-if="!showJsonPreview" class="w-3.5 h-3.5" />
        <ChevronUp v-else class="w-3.5 h-3.5" />
      </button>
      <div v-if="showJsonPreview" class="bg-gray-50 border-t border-gray-200 p-4">
        <pre class="text-xs font-mono text-gray-700 whitespace-pre-wrap">{{ jsonPreview }}</pre>
      </div>
    </div>

    <!-- 하위 호환성 경고 -->
    <div v-if="warnings.length > 0" class="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
      <p class="text-sm font-semibold text-amber-800 mb-2">발행 전 확인하세요</p>
      <ul class="space-y-1.5">
        <li
          v-for="w in warnings"
          :key="w"
          class="text-sm text-amber-700 flex items-start gap-2"
        >
          <span class="shrink-0 mt-0.5">⚠</span>
          <span>{{ w }}</span>
        </li>
      </ul>
    </div>

    <!-- 액션 버튼 -->
    <div class="flex items-center justify-end gap-3 mt-4">
      <p v-if="error" class="text-sm text-red-600 mr-auto">{{ error }}</p>
      <button
        type="button"
        class="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
        @click="router.back()"
      >
        취소
      </button>
      <button
        type="button"
        :disabled="loading"
        class="px-4 py-2 text-sm bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        @click="submit"
      >
        {{ loading ? '발행 중...' : '발행' }}
      </button>
    </div>
  </div>
</template>
