<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { tenantsApi, type Tenant } from '@/api/tenants'
import PageHeader from '@/components/shared/PageHeader.vue'
import StatusBadge from '@/components/shared/StatusBadge.vue'

const route = useRoute()
const id = route.params.id as string

const tenant = ref<Tenant | null>(null)
const loading = ref(true)
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

async function saveSettings() {
  if (!tenant.value) return
  saving.value = true
  error.value = ''
  successMsg.value = ''
  try {
    const { data } = await tenantsApi.update(id, {
      settings: {
        accessTokenTtl: tenant.value.settings.accessTokenTtl,
        refreshTokenTtl: tenant.value.settings.refreshTokenTtl,
        requirePkce: tenant.value.settings.requirePkce,
        passwordMinLength: tenant.value.settings.passwordMinLength,
        refreshTokenRotation: tenant.value.settings.refreshTokenRotation,
        allowRegistration: tenant.value.settings.allowRegistration,
      },
    })
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

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div class="bg-white rounded-xl border border-gray-200 p-4">
          <p class="text-xs text-gray-400 mb-1">슬러그</p>
          <p class="text-sm font-mono text-gray-800">{{ tenant.slug }}</p>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4">
          <p class="text-xs text-gray-400 mb-1">Issuer</p>
          <p class="text-sm font-mono text-gray-800">{{ tenant.issuer ?? '—' }}</p>
        </div>
      </div>

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
