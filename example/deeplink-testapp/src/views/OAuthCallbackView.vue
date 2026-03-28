<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { bridgeConfig } from '../config/app'
import { buildDeepLinkUrl, hasValidCallbackPayload, parseCallbackQuery, truncateCode } from '../lib/deeplink'

const payload = parseCallbackQuery(window.location.search)

const copied = ref(false)
const handoffAttempted = ref(false)

const status = computed<'invalid' | 'error' | 'success'>(() => {
  if (payload.error) {
    return 'error'
  }

  if (payload.code) {
    return 'success'
  }

  return 'invalid'
})

const deepLinkUrl = computed(() => buildDeepLinkUrl(payload))
const truncatedCode = computed(() => truncateCode(payload.code))

async function copyCode(): Promise<void> {
  if (!payload.code) {
    return
  }

  await navigator.clipboard.writeText(payload.code)
  copied.value = true

  window.setTimeout(() => {
    copied.value = false
  }, 1500)
}

function attemptOpenApp(): void {
  handoffAttempted.value = true
  window.location.href = deepLinkUrl.value
}

onMounted(() => {
  if (status.value === 'success') {
    window.setTimeout(() => {
      attemptOpenApp()
      window.history.replaceState({}, document.title, bridgeConfig.callbackPath)
    }, bridgeConfig.autoOpenDelayMs)
  }
})
</script>

<template>
  <section class="page page-callback">
    <div class="callback-card">
      <template v-if="status === 'success' && hasValidCallbackPayload(payload)">
        <p class="eyebrow success">OAuth Callback</p>
        <h1>Handing off to Flutter…</h1>
        <p class="message">
          The bridge received an authorization response and is opening the registered custom scheme now.
        </p>

        <div class="panel">
          <div>
            <span class="label">Authorization code</span>
            <strong>{{ truncatedCode }}</strong>
          </div>

          <button v-if="bridgeConfig.debugCodeFallback" type="button" class="action-button" @click="copyCode">
            {{ copied ? 'Copied' : 'Copy code' }}
          </button>
        </div>

        <div class="panel panel-secondary">
          <div>
            <span class="label">Deep link target</span>
            <code>{{ deepLinkUrl }}</code>
          </div>
        </div>

        <div class="fallback">
          <p v-if="!handoffAttempted">If the app does not open automatically, use the manual action below.</p>
          <p v-else>The redirect was attempted. If the app is still closed, try the manual action below.</p>
          <a :href="deepLinkUrl" class="action-button">Open Flutter app manually</a>
        </div>
      </template>

      <template v-else-if="status === 'error'">
        <p class="eyebrow error">OAuth Error</p>
        <h1>The authorization flow returned an error.</h1>
        <p class="message error-text">{{ payload.error }}</p>
        <p v-if="payload.errorDescription" class="message muted">{{ payload.errorDescription }}</p>
      </template>

      <template v-else>
        <p class="eyebrow">OAuth Callback</p>
        <h1>Missing callback parameters.</h1>
        <p class="message muted">
          This route expects either a code or an error from the OAuth redirect. Open it through Authori or the
          sample callback link on the home page.
        </p>
      </template>
    </div>
  </section>
</template>

<style scoped>
.page-callback {
  display: grid;
  place-items: center;
}

.callback-card {
  width: min(720px, 100%);
  border-radius: 28px;
  padding: 34px;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.92), rgba(15, 23, 42, 0.76));
  border: 1px solid rgba(148, 163, 184, 0.18);
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.22);
}

.eyebrow {
  margin: 0 0 10px;
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #cbd5e1;
}

.eyebrow.success {
  color: #67e8f9;
}

.eyebrow.error,
.error-text {
  color: #fda4af;
}

h1 {
  margin: 0;
  font-size: clamp(2rem, 4vw, 3.2rem);
  line-height: 1.05;
}

.message {
  margin: 18px 0 0;
  line-height: 1.75;
  color: rgba(226, 232, 240, 0.84);
}

.muted {
  color: rgba(148, 163, 184, 0.9);
}

.panel {
  margin-top: 24px;
  padding: 18px 20px;
  border-radius: 20px;
  background: rgba(15, 118, 110, 0.12);
  border: 1px solid rgba(103, 232, 249, 0.18);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.panel-secondary {
  background: rgba(30, 41, 59, 0.7);
  border-color: rgba(148, 163, 184, 0.18);
}

.label {
  display: block;
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 12px;
  color: #94a3b8;
}

strong,
code {
  font-family: 'IBM Plex Mono', 'SFMono-Regular', monospace;
  color: #f8fafc;
  word-break: break-all;
}

.fallback {
  margin-top: 28px;
  padding-top: 22px;
  border-top: 1px solid rgba(148, 163, 184, 0.16);
}

.action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 18px;
  border: none;
  border-radius: 999px;
  background: linear-gradient(135deg, #67e8f9, #22d3ee);
  color: #083344;
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
}

@media (max-width: 720px) {
  .callback-card {
    padding: 24px;
  }

  .panel {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
