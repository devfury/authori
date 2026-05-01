# 프론트엔드 TDD 인프라 구축 실행 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `frontend/` 프로젝트에 Vitest와 Playwright를 설치하고 설정을 완료하여 TDD가 가능한 환경을 구축합니다.

**Architecture:** Vitest를 사용하여 단위 및 컴포넌트 테스트를 수행하고, Playwright를 사용하여 E2E 테스트를 수행합니다. 테스트 파일은 소스 코드 옆(`.spec.ts`)에 위치시키고, E2E 테스트는 별도의 디렉토리(`e2e/`)에서 관리합니다.

**Tech Stack:** Vitest, @vue/test-utils, jsdom, Playwright, Bun

---

### Task 1: 의존성 설치 및 기본 스크립트 추가

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: 의존성 설치**

실행:
```bash
cd frontend && bun add -d vitest @vue/test-utils jsdom @playwright/test
```

- [ ] **Step 2: package.json 스크립트 추가**

```json
{
  "scripts": {
    "test:unit": "vitest",
    "test:unit:run": "vitest run",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  }
}
```

- [ ] **Step 3: Commit**
```bash
git add frontend/package.json frontend/bun.lock
git commit -m "chore(frontend): add testing dependencies and scripts"
```

### Task 2: Vitest 설정

**Files:**
- Create: `frontend/vitest.config.ts`

- [ ] **Step 1: vitest.config.ts 생성**

```typescript
import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      exclude: [...configDefaults.exclude, 'e2e/*'],
      root: fileURLToPath(new URL('./', import.meta.url))
    }
  })
)
```

- [ ] **Step 2: Commit**
```bash
git add frontend/vitest.config.ts
git commit -m "chore(frontend): add vitest configuration"
```

### Task 3: Playwright 설정

**Files:**
- Create: `frontend/playwright.config.ts`

- [ ] **Step 1: playwright.config.ts 생성**

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'bun run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    cwd: './'
  },
});
```

- [ ] **Step 2: Commit**
```bash
git add frontend/playwright.config.ts
git commit -m "chore(frontend): add playwright configuration"
```

### Task 4: TypeScript 설정 업데이트

**Files:**
- Modify: `frontend/tsconfig.app.json`

- [ ] **Step 1: compilerOptions.types 업데이트**

```json
{
  "compilerOptions": {
    "types": ["vite/client", "vitest/globals"]
  }
}
```

- [ ] **Step 2: Commit**
```bash
git add frontend/tsconfig.app.json
git commit -m "chore(frontend): update tsconfig for vitest types"
```

### Task 5: 단위 테스트 샘플 작성 (TDD)

**Files:**
- Create: `frontend/src/utils/math.ts`
- Create: `frontend/src/utils/math.spec.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
import { describe, it, expect } from 'vitest'
import { add } from './math'

describe('math utils', () => {
  it('adds two numbers', () => {
    expect(add(1, 2)).toBe(3)
  })
})
```

- [ ] **Step 2: 테스트 실행 및 실패 확인**
실행: `cd frontend && bun run test:unit:run src/utils/math.spec.ts`
Expected: FAIL (add is not defined)

- [ ] **Step 3: 최소 구현 작성**

```typescript
export function add(a: number, b: number) {
  return a + b
}
```

- [ ] **Step 4: 테스트 실행 및 통과 확인**
실행: `cd frontend && bun run test:unit:run src/utils/math.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add frontend/src/utils/math.ts frontend/src/utils/math.spec.ts
git commit -m "test(frontend): add sample unit test and implementation"
```

### Task 6: 컴포넌트 테스트 샘플 작성

**Files:**
- Create: `frontend/src/App.spec.ts`

- [ ] **Step 1: App.vue 렌더링 테스트 작성**

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import App from './App.vue'
import { createPinia } from 'pinia'
import router from './router'

describe('App.vue', () => {
  it('renders successfully', () => {
    const wrapper = mount(App, {
      global: {
        plugins: [createPinia(), router]
      }
    })
    expect(wrapper.exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 테스트 실행 및 확인**
실행: `cd frontend && bun run test:unit:run src/App.spec.ts`
Expected: PASS (또는 기존 App.vue 구조에 따라 필요한 모킹 추가 후 PASS)

- [ ] **Step 3: Commit**
```bash
git add frontend/src/App.spec.ts
git commit -m "test(frontend): add sample component test"
```

### Task 7: E2E 테스트 샘플 작성

**Files:**
- Create: `frontend/e2e/home.spec.ts`

- [ ] **Step 1: 기본 홈 페이지 로드 테스트 작성**

```typescript
import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/');
  // 프로젝트 제목에 맞춰 수정 필요 (예: Authori)
  await expect(page).toHaveTitle(/Authori/i);
});
```

- [ ] **Step 2: 테스트 실행 및 확인**
실행: `cd frontend && bun run test:e2e`
Expected: PASS (서버가 뜨고 타이틀이 맞다면)

- [ ] **Step 3: Commit**
```bash
git add frontend/e2e/home.spec.ts
git commit -m "test(frontend): add sample e2e test"
```
