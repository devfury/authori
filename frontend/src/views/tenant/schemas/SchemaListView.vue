<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Plus } from 'lucide-vue-next'
import { schemasApi, type ProfileSchemaVersion } from '@/api/schemas'
import PageHeader from '@/components/shared/PageHeader.vue'
import StatusBadge from '@/components/shared/StatusBadge.vue'

const route = useRoute()
const tenantId = route.params.tenantId as string

const schemas = ref<ProfileSchemaVersion[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    const { data } = await schemasApi.findAll(tenantId)
    schemas.value = data
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
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="schema in schemas" :key="schema.id" class="hover:bg-gray-50 transition-colors">
            <td class="px-4 py-3 font-mono text-gray-800">v{{ schema.version }}</td>
            <td class="px-4 py-3"><StatusBadge :status="schema.status" /></td>
            <td class="px-4 py-3 text-gray-500">{{ schema.publishedBy ?? '—' }}</td>
            <td class="px-4 py-3 text-gray-400 text-xs">
              {{ new Date(schema.createdAt).toLocaleDateString('ko-KR') }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
