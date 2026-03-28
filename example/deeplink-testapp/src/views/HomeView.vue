<script setup lang="ts">
import { computed } from 'vue'

import { bridgeConfig } from '../config/app'

const sampleCallback = computed(() => `${bridgeConfig.callbackPath}?code=sample-code-123456&state=sample-state-7890`)
</script>

<template>
  <section class="page page-home">
    <div class="hero-grid">
      <article class="hero-card hero-card-primary">
        <p class="eyebrow">Authori Example</p>
        <h1>Deeplink Bridge Test App</h1>
        <p class="lede">
          This static app receives the OAuth callback on HTTP(S) and immediately hands the authorization result
          off to a Flutter app through a fixed custom scheme.
        </p>

        <div class="callout">
          <span class="callout-label">Bridge target</span>
          <code>{{ bridgeConfig.customSchemeUrl }}</code>
        </div>

        <div class="button-row">
          <RouterLink class="button button-primary" :to="sampleCallback">
            Open sample callback
          </RouterLink>
          <a class="button button-secondary" :href="bridgeConfig.customSchemeUrl">Open Flutter app directly</a>
        </div>
      </article>

      <article class="hero-card hero-card-secondary">
        <h2>Technical role</h2>
        <ul class="feature-list">
          <li>Receives the registered OAuth redirect URI.</li>
          <li>Forwards only code, state, error, and error_description.</li>
          <li>Never exchanges tokens or stores client secrets.</li>
          <li>Uses a fixed custom-scheme target to avoid open redirect behavior.</li>
        </ul>
      </article>
    </div>
  </section>
</template>

<style scoped>
.page-home {
  display: grid;
  place-items: center;
}

.hero-grid {
  width: min(1100px, 100%);
  display: grid;
  gap: 24px;
  grid-template-columns: minmax(0, 1.4fr) minmax(280px, 0.9fr);
}

.hero-card {
  position: relative;
  overflow: hidden;
  border-radius: 28px;
  padding: 32px;
  border: 1px solid rgba(148, 163, 184, 0.26);
  box-shadow: 0 32px 80px rgba(15, 23, 42, 0.16);
  backdrop-filter: blur(16px);
}

.hero-card-primary {
  background:
    radial-gradient(circle at top right, rgba(56, 189, 248, 0.24), transparent 36%),
    linear-gradient(160deg, rgba(15, 23, 42, 0.96), rgba(30, 41, 59, 0.94));
}

.hero-card-secondary {
  background: rgba(15, 23, 42, 0.68);
}

.eyebrow {
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 12px;
  color: #7dd3fc;
}

h1 {
  margin: 0;
  font-size: clamp(2.4rem, 4vw, 4.5rem);
  line-height: 0.98;
}

h2 {
  margin: 0 0 16px;
  font-size: 1.4rem;
}

.lede {
  margin: 20px 0 0;
  max-width: 56ch;
  color: rgba(226, 232, 240, 0.86);
  line-height: 1.8;
}

.callout {
  margin-top: 28px;
  padding: 18px 20px;
  border-radius: 20px;
  background: rgba(8, 47, 73, 0.52);
  border: 1px solid rgba(125, 211, 252, 0.25);
}

.callout-label {
  display: block;
  margin-bottom: 8px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #bae6fd;
}

code {
  font-family: 'IBM Plex Mono', 'SFMono-Regular', monospace;
  font-size: 0.95rem;
  color: #e0f2fe;
  word-break: break-all;
}

.button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 28px;
}

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 13px 18px;
  border-radius: 999px;
  text-decoration: none;
  font-weight: 700;
  transition: transform 160ms ease, box-shadow 160ms ease, background-color 160ms ease;
}

.button:hover {
  transform: translateY(-1px);
}

.button-primary {
  background: linear-gradient(135deg, #7dd3fc, #38bdf8);
  color: #082f49;
  box-shadow: 0 16px 30px rgba(56, 189, 248, 0.24);
}

.button-secondary {
  background: rgba(148, 163, 184, 0.12);
  border: 1px solid rgba(148, 163, 184, 0.22);
  color: #e2e8f0;
}

.feature-list {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 14px;
  color: rgba(226, 232, 240, 0.82);
  line-height: 1.65;
}

@media (max-width: 900px) {
  .hero-grid {
    grid-template-columns: 1fr;
  }
}
</style>
