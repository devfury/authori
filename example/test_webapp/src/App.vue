<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  buildAuthorizeUrl,
  clearOAuthState,
  type AuthorizeInitiationResponse,
  createPkcePair,
  createState,
  exchangeCodeForToken,
  fetchUserInfo,
  initiateAuthorizeRequest,
  persistOAuthState,
  readOAuthState,
  submitAuthorizeLogin,
  type TokenResponse,
} from './lib/oauth'

const tenantSlug = 'test'
const redirectUri = `${window.location.origin}${window.location.pathname}`

const form = reactive({
  authServerBaseUrl: 'http://localhost:3000',
  clientId: 'test-webapp',
  scope: 'openid profile email',
})

const isBusy = ref(false)
const message = ref('')
const errorMessage = ref('')
const authorizationCode = ref('')
const tokenResponse = ref<TokenResponse | null>(null)
const userInfo = ref<Record<string, unknown> | null>(null)
const pendingAuthorize = ref<AuthorizeInitiationResponse | null>(null)
const loginForm = reactive({
  email: '',
  password: '',
})

const authorizationEndpoint = computed(() => `${form.authServerBaseUrl}/t/${tenantSlug}/oauth/authorize`)
const tokenEndpoint = computed(() => `${form.authServerBaseUrl}/t/${tenantSlug}/oauth/token`)
const userInfoEndpoint = computed(() => `${form.authServerBaseUrl}/t/${tenantSlug}/oauth/userinfo`)

function currentOAuthConfig() {
  return {
    authServerBaseUrl: form.authServerBaseUrl,
    clientId: form.clientId,
    redirectUri,
    scope: form.scope,
    tenantSlug,
  }
}

function resetStatus() {
  message.value = ''
  errorMessage.value = ''
}

function storeTokenResponse(payload: TokenResponse) {
  tokenResponse.value = payload
  localStorage.setItem('authori-test-webapp-token-response', JSON.stringify(payload))
}

function readStoredTokenResponse() {
  const raw = localStorage.getItem('authori-test-webapp-token-response')
  if (!raw) return

  try {
    tokenResponse.value = JSON.parse(raw) as TokenResponse
  } catch {
    localStorage.removeItem('authori-test-webapp-token-response')
  }
}

function clearStoredSession() {
  clearOAuthState()
  tokenResponse.value = null
  userInfo.value = null
  authorizationCode.value = ''
  pendingAuthorize.value = null
  localStorage.removeItem('authori-test-webapp-token-response')
  resetStatus()
}

async function oauthLogin() {
  resetStatus()

  try {
    isBusy.value = true
    const { codeVerifier, codeChallenge } = await createPkcePair()
    const state = createState()

    persistOAuthState({
      state,
      codeVerifier,
      createdAt: Date.now(),
      config: currentOAuthConfig(),
    })

    const authorizeUrl = buildAuthorizeUrl(
      currentOAuthConfig(),
      state,
      codeChallenge,
    )

      window.location.href = authorizeUrl
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '로그인 준비에 실패했습니다.'
  } finally {
    isBusy.value = false
  }
}

async function formLogin() {
  resetStatus()

  if (!loginForm.email || !loginForm.password) {
    errorMessage.value = '이메일과 비밀번호를 모두 입력해 주세요.'
    return
  }

  isBusy.value = true

  try {
    const { codeVerifier, codeChallenge } = await createPkcePair()
    const state = createState()

    persistOAuthState({
      state,
      codeVerifier,
      createdAt: Date.now(),
      config: currentOAuthConfig(),
    })

    pendingAuthorize.value = await initiateAuthorizeRequest(
      currentOAuthConfig(),
      state,
      codeChallenge,
    )

    const { url } = await submitAuthorizeLogin(currentOAuthConfig(), {
      requestId: pendingAuthorize.value.requestId,
      email: loginForm.email,
      password: loginForm.password,
      grantedScopes: pendingAuthorize.value.requestedScopes,
    })

    window.location.href = url
  } catch (error) {
    const message = error instanceof Error ? error.message : '로그인 제출에 실패했습니다.'

    if (message === 'invalid_credentials') {
      errorMessage.value = '이메일 또는 비밀번호가 올바르지 않습니다.'
    } else if (message === 'account_locked') {
      errorMessage.value = '계정이 잠겼습니다. 잠시 후 다시 시도하세요.'
    } else if (message === 'invalid_request: expired or not found') {
      errorMessage.value = '인증 요청이 만료됐습니다. 다시 시도해 주세요.'
    } else {
      errorMessage.value = message
    }

    isBusy.value = false
  }
}

async function handleOAuthCallback() {
  const currentUrl = new URL(window.location.href)
  const code = currentUrl.searchParams.get('code')
  const state = currentUrl.searchParams.get('state')
  const returnedError = currentUrl.searchParams.get('error')
  const returnedErrorDescription = currentUrl.searchParams.get('error_description')

  if (returnedError) {
    errorMessage.value = returnedErrorDescription ?? returnedError
    currentUrl.search = ''
    window.history.replaceState({}, document.title, currentUrl.toString())
    return
  }

  if (!code) return

  const storedState = readOAuthState()
  authorizationCode.value = code

  if (!storedState || storedState.state !== state) {
    errorMessage.value = 'state 검증에 실패했습니다. 다시 로그인해 주세요.'
    return
  }

  isBusy.value = true

  try {
    const token = await exchangeCodeForToken(
      storedState.config,
      code,
      storedState.codeVerifier,
    )

    storeTokenResponse(token)
    clearOAuthState()
    message.value = '토큰 교환에 성공했습니다.'

    currentUrl.search = ''
    window.history.replaceState({}, document.title, currentUrl.toString())
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'OAuth callback 처리에 실패했습니다.'
  } finally {
    isBusy.value = false
  }
}

async function loadUserInfo() {
  resetStatus()

  if (!tokenResponse.value?.access_token) {
    errorMessage.value = '먼저 로그인하여 access token을 발급받아야 합니다.'
    return
  }

  isBusy.value = true

  try {
    userInfo.value = await fetchUserInfo(
      {
        authServerBaseUrl: form.authServerBaseUrl,
        clientId: form.clientId,
        redirectUri,
        scope: form.scope,
        tenantSlug,
      },
      tokenResponse.value.access_token,
    )
    message.value = 'userinfo 조회에 성공했습니다.'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'userinfo 조회에 실패했습니다.'
  } finally {
    isBusy.value = false
  }
}

onMounted(async () => {
  readStoredTokenResponse()
  await handleOAuthCallback()
})
</script>

<template>
  <main class="page-shell">
    <section class="hero-card">
      <div class="hero-copy">
        <p class="eyebrow">Authori Example</p>
        <h1>test tenant용 OAuth2 테스트 웹앱</h1>
        <p class="hero-description">
          Vite + Vue + TypeScript 기반의 예제 SPA입니다. Authorization Code + PKCE 흐름으로 로그인하고,
          access token 발급 및 userinfo 조회를 한 번에 테스트할 수 있습니다.
        </p>
      </div>
      <div class="hero-meta">
        <span class="meta-label">Tenant Slug</span>
        <strong>{{ tenantSlug }}</strong>
      </div>
    </section>

    <section class="grid-layout">
      <article class="panel">
        <h2>연동 설정</h2>
        <label>
          <span>Auth Server Base URL</span>
          <input v-model="form.authServerBaseUrl" type="url" placeholder="http://localhost:3000" />
        </label>
        <label>
          <span>Client ID</span>
          <input v-model="form.clientId" type="text" placeholder="인증 서버에서 생성된 Client ID 값을 입력하세요" />
          <small class="field-help">인증 서버에 등록된 클라이언트의 표시 이름이 아니라, 생성된 실제 Client ID 값을 입력해야 합니다.</small>
        </label>
        <label>
          <span>Scope</span>
          <input v-model="form.scope" type="text" placeholder="openid profile email" />
        </label>
        <label>
          <span>Redirect URI</span>
          <input :value="redirectUri" type="text" readonly />
        </label>
      </article>

      <article class="panel">
        <h2>엔드포인트</h2>
        <ul class="endpoint-list">
          <li>
            <span>Authorize</span>
            <code>{{ authorizationEndpoint }}</code>
          </li>
          <li>
            <span>Token</span>
            <code>{{ tokenEndpoint }}</code>
          </li>
          <li>
            <span>Userinfo</span>
            <code>{{ userInfoEndpoint }}</code>
          </li>
        </ul>
      </article>
    </section>

    <section class="panel action-panel">
      <h2>테스트 액션</h2>
      <div class="actions">
        <button :disabled="isBusy" @click="oauthLogin">인증서버 로그인</button>
        <button :disabled="isBusy || !tokenResponse?.access_token" class="secondary" @click="loadUserInfo">
          userinfo 조회
        </button>
        <button :disabled="isBusy" class="ghost" @click="clearStoredSession">세션 초기화</button>
      </div>
      <p v-if="message" class="status success">{{ message }}</p>
      <p v-if="errorMessage" class="status error">{{ errorMessage }}</p>
      <p v-if="authorizationCode" class="status info">최근 callback code: {{ authorizationCode }}</p>
    </section>

    <section class="panel login-panel">
      <h2>인증 서버 로그인 제출</h2>
      <p class="panel-description">
        이 백엔드는 `GET /authorize`에서 `requestId`를 반환하고 `POST /authorize`에서 `{ url }`을 반환합니다.
        아래 폼에서 로그인 버튼을 누르면 앱이 두 요청을 순서대로 호출한 뒤, 반환된 URL로 이동합니다.
      </p>

      <div v-if="pendingAuthorize" class="status info">
        <strong>준비된 요청</strong>
        <div>requestId: {{ pendingAuthorize.requestId }}</div>
        <div>clientId: {{ pendingAuthorize.client.clientId }}</div>
        <div>scopes: {{ pendingAuthorize.requestedScopes.join(' ') }}</div>
      </div>

      <form class="login-form" @submit.prevent="formLogin">
        <input v-if="pendingAuthorize" type="hidden" name="requestId" :value="pendingAuthorize.requestId" />
        <label>
          <span>Email</span>
          <input v-model="loginForm.email" name="email" type="email" placeholder="user@example.com" required />
        </label>
        <label>
          <span>Password</span>
          <input v-model="loginForm.password" name="password" type="password" placeholder="비밀번호" required />
        </label>
        <button :disabled="isBusy" type="submit">인증 서버로 로그인 제출</button>
      </form>
    </section>

    <section class="grid-layout">
      <article class="panel result-panel">
        <h2>토큰 응답</h2>
        <pre>{{ tokenResponse ? JSON.stringify(tokenResponse, null, 2) : '아직 토큰이 없습니다.' }}</pre>
      </article>

      <article class="panel result-panel">
        <h2>userinfo 응답</h2>
        <pre>{{ userInfo ? JSON.stringify(userInfo, null, 2) : '아직 userinfo를 조회하지 않았습니다.' }}</pre>
      </article>
    </section>
  </main>
</template>
