<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  buildOAuthEndpoint,
  createPkcePair,
  createState,
  decodeJwtPayload,
  DEFAULT_OAUTH_SETTINGS,
  exchangeCodeForToken,
  initiateAuthorizeRequest,
  normalizeOAuthSettings,
  parseAuthorizeRedirect,
  persistOAuthSettings,
  readOAuthSettings,
  refreshAccessToken,
  revokeToken,
  submitAuthorizeLogin,
  type AuthorizeInitiationResponse,
  type OAuthSettings,
  type TokenResponse,
} from './lib/oauth'

type BusyAction = 'login' | 'refresh' | 'logout' | null

type TokenSession = {
  settings: OAuthSettings
  response: TokenResponse
  receivedAt: number
}

type PendingOAuthSession = {
  settings: OAuthSettings
  codeVerifier: string
  state: string
}

const settings = reactive<OAuthSettings>(readOAuthSettings())
const credentials = reactive({
  email: '',
  password: '',
})

const authorizeResponse = ref<AuthorizeInitiationResponse | null>(null)
const tokenSession = ref<TokenSession | null>(null)
const pendingSession = ref<PendingOAuthSession | null>(null)
const latestAuthorizationCode = ref('')
const successMessage = ref('')
const errorMessage = ref('')
const settingsMessage = ref('')
const busyAction = ref<BusyAction>(null)
let detachDeepLinkListener: (() => void) | null = null

watch(
  settings,
  (nextSettings) => {
    persistOAuthSettings({ ...nextSettings })
  },
  { deep: true },
)

function resetFeedback() {
  successMessage.value = ''
  errorMessage.value = ''
}

function setBusy(action: BusyAction) {
  busyAction.value = action
}

function clearAuthState() {
  authorizeResponse.value = null
  tokenSession.value = null
  pendingSession.value = null
  latestAuthorizationCode.value = ''
  credentials.password = ''
}

function updateSettings(nextSettings: OAuthSettings) {
  Object.assign(settings, nextSettings)
}

function currentSettings() {
  return normalizeOAuthSettings({ ...settings })
}

function translateError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback

  if (message === 'invalid_credentials') {
    return '이메일 또는 비밀번호가 올바르지 않습니다.'
  }

  if (message === 'account_locked') {
    return '계정이 잠겼습니다. 잠시 후 다시 시도하세요.'
  }

  if (message === 'invalid_request: expired or not found') {
    return '인증 요청이 만료됐습니다. 다시 시도하세요.'
  }

  if (message === 'invalid_client') {
    return 'Client ID 설정이 올바르지 않습니다. 등록된 클라이언트 정보를 확인해 주세요.'
  }

  if (message === 'redirect_uri_mismatch') {
    return 'Redirect URI가 등록된 값과 일치하지 않습니다.'
  }

  if (message === 'code_challenge_required') {
    return '이 클라이언트는 PKCE가 필수입니다. 로그인 흐름을 다시 시작해 주세요.'
  }

  if (message.startsWith('invalid_scope')) {
    return '요청한 scope에 허용되지 않은 값이 포함되어 있습니다.'
  }

  if (message === 'client_id required') {
    return 'Client ID를 입력해 주세요.'
  }

  if (message === 'code_verifier required') {
    return 'PKCE 검증 정보가 없습니다. 로그인 흐름을 다시 시작해 주세요.'
  }

  if (
    message === 'invalid_grant' ||
    message === 'invalid_grant: code already used' ||
    message === 'invalid_grant: code expired' ||
    message === 'invalid_grant: redirect_uri mismatch' ||
    message === 'invalid_grant: token revoked' ||
    message === 'invalid_grant: token reuse detected' ||
    message === 'invalid_grant: token expired'
  ) {
    return '인증 세션이 유효하지 않거나 만료됐습니다. 처음부터 다시 로그인해 주세요.'
  }

  if (message === 'unsupported_grant_type') {
    return '지원하지 않는 토큰 요청입니다.'
  }

  if (message === 'Failed to fetch') {
    return '인증 서버에 연결할 수 없습니다. 서버 주소와 CORS 설정을 확인하세요.'
  }

  return message || fallback
}

function resetSettings() {
  updateSettings({ ...DEFAULT_OAUTH_SETTINGS })
  settingsMessage.value = '기본 설정으로 되돌렸습니다.'
}

async function submitLogin() {
  resetFeedback()
  settingsMessage.value = ''

  const nextSettings = currentSettings()

  if (!nextSettings.clientId) {
    errorMessage.value = 'Client ID를 입력해 주세요.'
    return
  }

  if (!credentials.email || !credentials.password) {
    errorMessage.value = '이메일과 비밀번호를 모두 입력해 주세요.'
    return
  }

  try {
    setBusy('login')

    const { codeVerifier, codeChallenge } = await createPkcePair()
    const state = createState()
    const request = await initiateAuthorizeRequest(nextSettings, state, codeChallenge)
    const { url } = await submitAuthorizeLogin(nextSettings, {
      requestId: request.requestId,
      email: credentials.email,
      password: credentials.password,
      grantedScopes: request.requestedScopes,
    })

    updateSettings(nextSettings);
    authorizeResponse.value = request;
    tokenSession.value = null;
    latestAuthorizationCode.value = "";
    pendingSession.value = {
      settings: nextSettings,
      codeVerifier,
      state,
    };

    await openUrl(url);

    credentials.password = "";
    successMessage.value =
      "브라우저에서 인증을 완료하면 custom scheme deep link로 앱에 다시 돌아옵니다.";
  } catch (error) {
    errorMessage.value = translateError(error, "로그인 제출에 실패했습니다.");
  } finally {
    setBusy(null);
  }
}

function isAppDeepLinkCallback(url: string) {
  try {
    const parsedUrl = new URL(url);
    return (
      parsedUrl.protocol === "authori:" &&
      parsedUrl.hostname === "oauth" &&
      parsedUrl.pathname === "/callback"
    );
  } catch {
    return false;
  }
}

async function processAuthorizeCallback(url: string) {
  if (!isAppDeepLinkCallback(url)) {
    return;
  }

  const session = pendingSession.value;

  if (!session) {
    errorMessage.value =
      "진행 중인 인증 세션이 없어 deep link callback을 처리할 수 없습니다.";
    successMessage.value = "";
    return;
  }

  resetFeedback();

  const redirect = parseAuthorizeRedirect(url);

  if (redirect.error) {
    errorMessage.value = translateError(
      new Error(redirect.errorDescription ?? redirect.error),
      "deep link callback 처리에 실패했습니다.",
    );
    return;
  }

  if (!redirect.code) {
    errorMessage.value = "deep link callback에 authorization code가 없습니다.";
    return;
  }

  if (redirect.state !== session.state) {
    errorMessage.value = "state 검증에 실패했습니다. 다시 로그인해 주세요.";
    return;
  }

  try {
    setBusy("login");

    const appWindow = getCurrentWindow();
    await appWindow.show().catch(() => undefined);
    await appWindow.unminimize().catch(() => undefined);
    await appWindow.setFocus().catch(() => undefined);

    const tokenResponse = await exchangeCodeForToken(
      session.settings,
      redirect.code,
      session.codeVerifier,
    );

    updateSettings(session.settings);
    latestAuthorizationCode.value = redirect.code;
    tokenSession.value = {
      settings: session.settings,
      response: tokenResponse,
      receivedAt: Date.now(),
    };
    pendingSession.value = null;
    successMessage.value =
      "deep link callback 처리와 토큰 교환에 성공했습니다.";
  } catch (error) {
    errorMessage.value = translateError(
      error,
      "deep link callback 처리에 실패했습니다.",
    );
  } finally {
    setBusy(null);
  }
}

async function initializeDeepLinks() {
  const startUrls = (await getCurrent()) ?? [];

  for (const url of startUrls) {
    await processAuthorizeCallback(url);
  }

  detachDeepLinkListener = await onOpenUrl(async (urls) => {
    for (const url of urls) {
      await processAuthorizeCallback(url);
    }
  });
}

onMounted(() => {
  void initializeDeepLinks();
});

onBeforeUnmount(() => {
  detachDeepLinkListener?.();
});

async function refreshToken() {
  resetFeedback()

  if (!tokenSession.value?.response.refresh_token) {
    errorMessage.value = '갱신 가능한 refresh token이 없습니다.'
    return
  }

  try {
    setBusy('refresh')

    const session = tokenSession.value
    const refreshed = await refreshAccessToken(session.settings, tokenSession.value.response.refresh_token)

    tokenSession.value = {
      settings: session.settings,
      response: {
        ...refreshed,
        refresh_token: refreshed.refresh_token ?? tokenSession.value.response.refresh_token,
      },
      receivedAt: Date.now(),
    }
    successMessage.value = '토큰을 갱신했습니다.'
  } catch (error) {
    errorMessage.value = translateError(error, '토큰 갱신에 실패했습니다.')
  } finally {
    setBusy(null)
  }
}

async function revokeAndLogout() {
  resetFeedback()

  if (!tokenSession.value) {
    clearAuthState()
    successMessage.value = '메모리 세션을 초기화했습니다.'
    return
  }

  try {
    setBusy('logout')

    const session = tokenSession.value
    const tokens = [
      tokenSession.value.response.refresh_token
        ? { value: tokenSession.value.response.refresh_token, hint: 'refresh_token' as const }
        : null,
      tokenSession.value.response.access_token
        ? { value: tokenSession.value.response.access_token, hint: 'access_token' as const }
        : null,
    ].filter((token): token is { value: string; hint: 'refresh_token' | 'access_token' } => Boolean(token))

    for (const token of tokens) {
      await revokeToken(session.settings, token.value, token.hint)
    }

    clearAuthState()
    successMessage.value = '토큰을 폐기하고 로그아웃했습니다.'
  } catch (error) {
    errorMessage.value = translateError(error, '토큰 폐기에 실패했습니다.')
  } finally {
    setBusy(null)
  }
}

const authorizeEndpoint = computed(() => buildOAuthEndpoint(currentSettings(), 'authorize'))
const tokenEndpoint = computed(() => buildOAuthEndpoint(currentSettings(), 'token'))
const revokeEndpoint = computed(() => buildOAuthEndpoint(currentSettings(), 'revoke'))
const expiresAt = computed(() => {
  const expiresIn = tokenSession.value?.response.expires_in
  if (!expiresIn || !tokenSession.value) return null

  return new Date(tokenSession.value.receivedAt + expiresIn * 1000)
})
const accessTokenClaims = computed(() => decodeJwtPayload(tokenSession.value?.response.access_token))
const refreshTokenClaims = computed(() => decodeJwtPayload(tokenSession.value?.response.refresh_token))
const isBusy = computed(() => busyAction.value !== null)
const hasToken = computed(() => Boolean(tokenSession.value?.response.access_token))
const requestedScopes = computed(() => authorizeResponse.value?.requestedScopes ?? [])
</script>

<template>
  <main class="app-shell">
    <section class="hero-card">
      <div>
        <p class="eyebrow">Tauri OAuth2 PKCE Test Client</p>
        <h1>Authorization Code + PKCE 테스트 앱</h1>
        <p class="hero-copy">
          Tauri v2 + Vue 3 + TypeScript 기반 데스크톱 클라이언트입니다. 인증 서버의
          `/authorize`, `/token`, `/revoke` 흐름을 직접 호출하고, 토큰은 메모리에만 보관합니다.
        </p>
      </div>

      <div class="hero-meta">
        <span>Desktop App</span>
        <strong>{{ settings.tenantSlug || 'test' }}</strong>
      </div>
    </section>

    <section class="grid two-columns">
      <article class="panel">
        <div class="panel-header">
          <div>
            <p class="panel-eyebrow">Settings</p>
            <h2>연동 설정</h2>
          </div>
          <div class="panel-actions compact">
            <button class="ghost" type="button" :disabled="isBusy" @click="resetSettings">기본값</button>
          </div>
        </div>

        <p class="panel-description">
          설정은 로컬에 저장되며, access/refresh token은 앱 메모리에만 유지됩니다.
        </p>

        <div class="form-grid">
          <label>
            <span>Auth Server URL</span>
            <input v-model="settings.authServerBaseUrl" type="url" placeholder="http://localhost:3000" />
          </label>

          <label>
            <span>Tenant Slug</span>
            <input v-model="settings.tenantSlug" type="text" placeholder="test" />
          </label>

          <label>
            <span>Client ID</span>
            <input v-model="settings.clientId" type="text" placeholder="등록된 public client_id" />
          </label>

          <label>
            <span>Redirect URI</span>
            <input v-model="settings.redirectUri" type="url" placeholder="http://localhost:1420/callback" />
          </label>

          <label class="full-width">
            <span>Scope</span>
            <input v-model="settings.scope" type="text" placeholder="openid profile email" />
          </label>
        </div>

        <p v-if="settingsMessage" class="status info">{{ settingsMessage }}</p>
      </article>

      <article class="panel endpoint-panel">
        <p class="panel-eyebrow">Endpoints</p>
        <h2>호출 대상</h2>

        <dl class="endpoint-list">
          <div>
            <dt>GET / POST Authorize</dt>
            <dd><code>{{ authorizeEndpoint }}</code></dd>
          </div>
          <div>
            <dt>POST Token</dt>
            <dd><code>{{ tokenEndpoint }}</code></dd>
          </div>
          <div>
            <dt>POST Revoke</dt>
            <dd><code>{{ revokeEndpoint }}</code></dd>
          </div>
        </dl>
      </article>
    </section>

    <section class="panel flow-panel">
      <div class="panel-header">
        <div>
          <p class="panel-eyebrow">Flow</p>
          <h2>원클릭 PKCE 로그인</h2>
        </div>
      </div>

      <p class="panel-description">
        로그인 시 `code_verifier`, `code_challenge`, `state` 생성부터 `GET /authorize`, 로그인 제출,
        브라우저 callback bridge(`http://localhost:5174/oauth/callback`)와 custom scheme(
        `authori://oauth/callback`) 복귀를 거쳐 토큰 교환까지 진행합니다.
      </p>

      <div class="status-stack">
        <p v-if="successMessage" class="status success">{{ successMessage }}</p>
        <p v-if="errorMessage" class="status error">{{ errorMessage }}</p>
        <p v-if="latestAuthorizationCode" class="status info">최근 code: {{ latestAuthorizationCode }}</p>
      </div>
    </section>

    <section class="grid two-columns aligned-start">
      <article class="panel login-panel">
        <p class="panel-eyebrow">Authorize</p>
        <h2>로그인 폼</h2>

        <div v-if="authorizeResponse" class="request-card">
          <div>
            <span class="request-label">연결된 앱</span>
            <strong>{{ authorizeResponse.client.name }}</strong>
          </div>
          <div>
            <span class="request-label">Client ID</span>
            <code>{{ authorizeResponse.client.clientId }}</code>
          </div>
          <div>
            <span class="request-label">Request ID</span>
            <code>{{ authorizeResponse.requestId }}</code>
          </div>
        </div>

        <div v-if="requestedScopes.length" class="scope-chips">
          <span v-for="scope in requestedScopes" :key="scope" class="scope-chip">{{ scope }}</span>
        </div>

        <form class="form-grid" @submit.prevent="submitLogin">
          <label>
            <span>이메일</span>
            <input v-model="credentials.email" type="email" placeholder="user@example.com" required />
          </label>

          <label>
            <span>비밀번호</span>
            <input v-model="credentials.password" type="password" placeholder="비밀번호" required />
          </label>

          <div class="full-width panel-actions">
            <button type="submit" :disabled="isBusy">로그인</button>
          </div>
        </form>

        <p class="panel-description">
          로그인 제출 후 기본 브라우저가 열리고, localhost bridge가
          `authori://oauth/callback` deep link로 앱에 다시 전달합니다.
        </p>
      </article>

      <article class="panel token-panel">
        <p class="panel-eyebrow">Token Session</p>
        <h2>로그인 성공 정보</h2>

        <template v-if="tokenSession">
          <div class="token-meta">
            <div>
              <span class="request-label">Token Type</span>
              <strong>{{ tokenSession.response.token_type }}</strong>
            </div>
            <div>
              <span class="request-label">만료 시각</span>
              <strong>{{ expiresAt ? expiresAt.toLocaleString() : '미제공' }}</strong>
            </div>
          </div>

          <div class="panel-actions">
            <button
              type="button"
              class="secondary"
              :disabled="isBusy || !tokenSession.response.refresh_token"
              @click="refreshToken"
            >
              토큰 갱신
            </button>
            <button type="button" class="danger" :disabled="isBusy" @click="revokeAndLogout">
              토큰 폐기 + 로그아웃
            </button>
          </div>
        </template>

        <p v-else class="empty-state">
          아직 access token이 없습니다. 로그인 완료 후 토큰과 클레임이 여기에 표시됩니다.
        </p>
      </article>
    </section>

    <section class="grid two-columns aligned-start">
      <article class="panel code-panel">
        <p class="panel-eyebrow">Raw Tokens</p>
        <h2>토큰 원문</h2>
        <div class="scroll-wrap">
          <pre>{{ hasToken ? JSON.stringify(tokenSession?.response, null, 2) : '아직 토큰이 없습니다.' }}</pre>
        </div>
      </article>

      <article class="panel claims-panel">
        <p class="panel-eyebrow">JWT Claims</p>
        <h2>디코드된 클레임</h2>

        <div class="claims-block">
          <h3>Access Token</h3>
          <div class="scroll-wrap">
            <pre>{{ accessTokenClaims ? JSON.stringify(accessTokenClaims, null, 2) : 'JWT payload를 해석할 수 없습니다.' }}</pre>
          </div>
        </div>

        <div class="claims-block">
          <h3>Refresh Token</h3>
          <div class="scroll-wrap">
            <pre>{{ refreshTokenClaims ? JSON.stringify(refreshTokenClaims, null, 2) : 'refresh token이 JWT가 아니거나 아직 없습니다.' }}</pre>
          </div>
        </div>
      </article>
    </section>
  </main>
</template>

<style>
:root {
  color: #f6efe4;
  background:
    radial-gradient(circle at top left, rgba(248, 180, 84, 0.22), transparent 30%),
    radial-gradient(circle at top right, rgba(74, 222, 128, 0.2), transparent 24%),
    linear-gradient(180deg, #1a1224 0%, #100b17 55%, #0a0812 100%);
  font-family: 'Segoe UI', 'Noto Sans KR', system-ui, sans-serif;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* {
  box-sizing: border-box;
}

html,
body,
#app {
  margin: 0;
  min-height: 100%;
}

html,
body {
  overflow-x: hidden;
}

button,
input {
  font: inherit;
}

button {
  border: 0;
  border-radius: 999px;
  padding: 0.9rem 1.35rem;
  background: linear-gradient(135deg, #f59e0b 0%, #f97316 100%);
  color: #170f0a;
  cursor: pointer;
  font-weight: 700;
  transition:
    transform 0.18s ease,
    opacity 0.18s ease,
    box-shadow 0.18s ease;
  box-shadow: 0 16px 32px rgba(249, 115, 22, 0.22);
}

button:hover:not(:disabled) {
  transform: translateY(-1px);
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
  box-shadow: none;
}

button.secondary {
  background: linear-gradient(135deg, #67e8f9 0%, #22c55e 100%);
  color: #08211e;
  box-shadow: 0 16px 32px rgba(34, 197, 94, 0.18);
}

button.ghost {
  background: rgba(255, 255, 255, 0.08);
  color: #f4dfc5;
  box-shadow: none;
  border: 1px solid rgba(255, 255, 255, 0.12);
}

button.danger {
  background: linear-gradient(135deg, #fb7185 0%, #ef4444 100%);
  color: #fff7f7;
  box-shadow: 0 16px 32px rgba(239, 68, 68, 0.2);
}

code,
pre {
  font-family: 'SFMono-Regular', 'Consolas', 'Liberation Mono', monospace;
}

.app-shell {
  width: 100%;
  max-width: 1240px;
  margin: 0 auto;
  padding: 32px 24px 48px;
  min-width: 0;
}

.hero-card,
.panel {
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(20, 16, 31, 0.76);
  backdrop-filter: blur(18px);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.28);
}

.hero-card {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  padding: 28px 30px;
  border-radius: 28px;
  margin-bottom: 22px;
}

.hero-card > *,
.panel-header > *,
.request-card > *,
.token-meta > *,
.endpoint-list div {
  min-width: 0;
}

.eyebrow,
.panel-eyebrow,
.request-label {
  margin: 0 0 0.5rem;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 0.72rem;
  color: #f8c77c;
}

.hero-card h1,
.panel h2,
.claims-block h3 {
  margin: 0;
}

.hero-copy,
.panel-description,
.empty-state {
  color: rgba(246, 239, 228, 0.8);
  line-height: 1.6;
}

.hero-meta {
  min-width: 180px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-end;
  gap: 0.35rem;
  color: rgba(246, 239, 228, 0.74);
}

.hero-meta strong {
  font-size: 1.8rem;
  color: #fff6e8;
}

.grid {
  display: grid;
  gap: 22px;
  margin-bottom: 22px;
}

.two-columns {
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
}

.aligned-start {
  align-items: start;
}

.panel {
  border-radius: 24px;
  padding: 24px;
  min-width: 0;
  max-width: 100%;
  overflow-x: hidden;
}

.panel-header,
.panel-actions,
.token-meta,
.request-card {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.panel-header {
  align-items: start;
}

.panel-actions {
  flex-wrap: wrap;
  align-items: center;
}

.panel-actions.compact {
  justify-content: flex-end;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.full-width {
  grid-column: 1 / -1;
}

label {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  color: #f9e8cf;
  font-size: 0.92rem;
}

input {
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 18px;
  padding: 0.95rem 1rem;
  color: #fff8f0;
  background: rgba(255, 255, 255, 0.04);
  outline: none;
  transition: border-color 0.18s ease, background-color 0.18s ease;
}

input:focus {
  border-color: rgba(248, 180, 84, 0.8);
  background: rgba(255, 255, 255, 0.07);
}

.endpoint-list {
  display: grid;
  gap: 16px;
  margin: 18px 0 0;
}

.endpoint-list div,
.request-card,
.token-meta {
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.endpoint-list dt {
  margin-bottom: 0.45rem;
  color: rgba(246, 239, 228, 0.7);
}

.endpoint-list code,
.request-card code {
  color: #fbd38d;
  word-break: break-all;
  overflow-wrap: anywhere;
}

.flow-panel {
  margin-bottom: 22px;
}

.status-stack {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.status {
  margin: 0;
  padding: 0.95rem 1rem;
  border-radius: 18px;
  border: 1px solid transparent;
  min-width: 0;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.status.success {
  background: rgba(34, 197, 94, 0.12);
  border-color: rgba(74, 222, 128, 0.28);
  color: #c7ffd6;
}

.status.error {
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(251, 113, 133, 0.28);
  color: #ffd3da;
}

.status.info {
  background: rgba(56, 189, 248, 0.12);
  border-color: rgba(103, 232, 249, 0.28);
  color: #d5fbff;
}

.scope-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 18px;
}

.scope-chip {
  border-radius: 999px;
  padding: 0.45rem 0.8rem;
  background: rgba(248, 180, 84, 0.12);
  color: #ffd59b;
  border: 1px solid rgba(248, 180, 84, 0.24);
  font-size: 0.86rem;
}

.request-card,
.token-meta {
  margin-bottom: 18px;
  flex-wrap: wrap;
}

.code-panel,
.claims-panel,
.claims-block {
  min-width: 0;
}

.scroll-wrap {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
}

pre {
  display: block;
  margin: 0;
  padding: 18px;
  border-radius: 18px;
  min-height: 240px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  overflow-x: visible;
  overflow-y: visible;
  color: #fef3c7;
  background: rgba(7, 10, 19, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.08);
  line-height: 1.55;
  overflow-wrap: anywhere;
  word-break: break-word;
  white-space: pre-wrap;
}

.claims-block + .claims-block {
  margin-top: 16px;
}

@media (max-width: 1180px) {
  .app-shell {
    padding-inline: 16px;
  }

  .two-columns,
  .form-grid {
    grid-template-columns: 1fr;
  }

  .hero-card,
  .panel-header,
  .panel-actions,
  .request-card,
  .token-meta {
    flex-direction: column;
    align-items: stretch;
  }

  .hero-meta {
    align-items: flex-start;
  }
}

@media (max-width: 480px) {
  .app-shell {
    padding-top: 20px;
    padding-inline: 12px;
    padding-bottom: 32px;
  }

  .panel {
    border-radius: 16px;
    padding: 16px;
  }

  .hero-card {
    border-radius: 20px;
    padding: 20px 16px;
  }

  button {
    width: 100%;
    text-align: center;
  }

  .panel-actions.compact button {
    width: auto;
  }

  .endpoint-list code,
  .request-card code {
    font-size: 0.8rem;
  }
}
</style>
