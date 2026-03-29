<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Plus, ChevronDown, ChevronUp } from 'lucide-vue-next'
import { adminsApi, type AdminUser } from '@/api/admins'
import { schemasApi, type ProfileSchemaVersion } from '@/api/schemas'
import PageHeader from '@/components/shared/PageHeader.vue'
import StatusBadge from '@/components/shared/StatusBadge.vue'

const route = useRoute()
const tenantId = route.params.tenantId as string

const schemas = ref<ProfileSchemaVersion[]>([])
const loading = ref(true)
const adminMap = ref<Record<string, AdminUser>>({})
const expandedId = ref<string | null>(null)

function indexById<T>(items: T[], getId: (item: T) => string): Record<string, T> {
  return items.reduce<Record<string, T>>((acc, item) => {
    acc[getId(item)] = item
    return acc
  }, {})
}

function formatPublisher(publishedBy: string | null): string {
  if (!publishedBy) return '—'

  const normalized = publishedBy.toLowerCase()
  if (normalized === 'system') return '시스템'

  const admin = adminMap.value[publishedBy]
  if (admin) return admin.name || admin.email || `관리자 (${publishedBy})`

  return `관리자 (${publishedBy})`
}

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

function parseJsonSchema(schema: Record<string, unknown>): FieldDef[] {
  const props = (schema.properties as Record<string, Record<string, unknown>>) ?? {}
  const req = (schema.required as string[]) ?? []
  return Object.entries(props).map(([key, def]) => {
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

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    string: '문자열',
    number: '숫자',
    integer: '정수',
    boolean: '참/거짓',
    enum: '선택지',
  }
  return map[type] ?? type
}

function toggleExpand(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}

onMounted(async () => {
  try {
    const [schemasResult, adminsResult] = await Promise.allSettled([
      schemasApi.findAll(tenantId),
      adminsApi.findAll(),
    ])

    if (schemasResult.status === 'fulfilled') {
      schemas.value = schemasResult.value.data
    }
    if (adminsResult.status === 'fulfilled') {
      adminMap.value = indexById(adminsResult.value.data?.items || [], (admin) => admin.id)
    }
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <PageHeader title="프로필 스키마" description="사용자 프로필의 JSON Schema 버전을 관리합니다.">
      <template #actions>
        <RouterLink
          :to="{ name: 'schema-publish', params: { tenantId } }"
          class="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus class="w-4 h-4" />
          스키마 발행
        </RouterLink>
      </template>
    </PageHeader>

    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div v-if="loading" class="p-8 text-center text-sm text-gray-400">불러오는 중...</div>
      <div v-else-if="schemas.length === 0" class="p-8 text-center text-sm text-gray-400">
        발행된 스키마가 없습니다.
      </div>
      <table v-else class="w-full text-sm">
        <thead class="bg-gray-50 border-b border-gray-200">
          <tr>
            <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">버전</th>
            <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">상태</th>
            <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">발행자</th>
            <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">발행일</th>
            <th class="w-8"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <template v-for="schema in schemas" :key="schema.id">
            <!-- 목록 행 -->
            <tr
              class="hover:bg-gray-50 transition-colors cursor-pointer"
              @click="toggleExpand(schema.id)"
            >
              <td class="px-4 py-3 font-mono text-gray-800">v{{ schema.version }}</td>
              <td class="px-4 py-3"><StatusBadge :status="schema.status" /></td>
              <td class="px-4 py-3 text-gray-500 text-xs">{{ formatPublisher(schema.publishedBy) }}</td>
              <td class="px-4 py-3 text-gray-400 text-xs">
                {{ new Date(schema.createdAt).toLocaleDateString('ko-KR') }}
              </td>
              <td class="px-4 py-3 text-gray-400">
                <ChevronUp v-if="expandedId === schema.id" class="w-4 h-4" />
                <ChevronDown v-else class="w-4 h-4" />
              </td>
            </tr>

            <!-- 상세 패널 -->
            <tr v-if="expandedId === schema.id">
              <td colspan="5" class="bg-gray-50 border-t border-gray-100 px-4 py-4">
                <div class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">필드 정의</div>

                <div v-if="Object.keys(schema.schemaJsonb.properties ?? {}).length === 0" class="text-sm text-gray-400">
                  정의된 필드가 없습니다.
                </div>

                <table v-else class="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                  <thead class="bg-white border-b border-gray-200">
                    <tr>
                      <th class="text-left px-3 py-2 text-xs font-medium text-gray-500">표시명</th>
                      <th class="text-left px-3 py-2 text-xs font-medium text-gray-500">키</th>
                      <th class="text-left px-3 py-2 text-xs font-medium text-gray-500">타입</th>
                      <th class="text-left px-3 py-2 text-xs font-medium text-gray-500">필수</th>
                      <th class="text-left px-3 py-2 text-xs font-medium text-gray-500">제약 조건</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-100 bg-white">
                    <tr v-for="field in parseJsonSchema(schema.schemaJsonb)" :key="field.key">
                      <td class="px-3 py-2 text-gray-700">{{ field.label }}</td>
                      <td class="px-3 py-2 font-mono text-gray-600 text-xs">{{ field.key }}</td>
                      <td class="px-3 py-2 text-gray-600">{{ typeLabel(field.type) }}</td>
                      <td class="px-3 py-2">
                        <span v-if="field.required" class="px-1.5 py-0.5 text-xs bg-indigo-50 text-indigo-600 rounded font-medium">필수</span>
                        <span v-else class="text-gray-300 text-xs">—</span>
                      </td>
                      <td class="px-3 py-2 text-xs text-gray-500">
                        <template v-if="field.type === 'enum'">
                          <div class="flex flex-wrap gap-1">
                            <span
                              v-for="v in field.enumValues"
                              :key="v"
                              class="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded"
                            >{{ v }}</span>
                          </div>
                        </template>
                        <template v-else>
                          <span v-if="field.minLength != null">최소 {{ field.minLength }}자</span>
                          <span v-if="field.minLength != null && field.maxLength != null"> · </span>
                          <span v-if="field.maxLength != null">최대 {{ field.maxLength }}자</span>
                          <span v-if="field.pattern" class="font-mono">{{ field.pattern }}</span>
                          <span v-if="field.minimum != null">최솟값 {{ field.minimum }}</span>
                          <span v-if="field.minimum != null && field.maximum != null"> · </span>
                          <span v-if="field.maximum != null">최댓값 {{ field.maximum }}</span>
                          <span v-if="!field.minLength && !field.maxLength && !field.pattern && field.minimum == null && field.maximum == null">—</span>
                        </template>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>
