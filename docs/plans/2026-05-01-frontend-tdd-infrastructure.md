# 설계 문서: 프론트엔드 TDD 인프라 구축 (Vitest + Playwright)

*   **날짜**: 2026-05-01
*   **상태**: Draft
*   **작성자**: Gemini CLI

## 1. 개요
이 문서는 `authori` 프로젝트의 프론트엔드(`frontend/`)에 TDD(Test-Driven Development) 환경을 구축하기 위한 설계를 정의합니다. 고성능 단위/컴포넌트 테스트를 위한 Vitest와 안정적인 E2E 테스트를 위한 Playwright를 통합하는 것을 목표로 합니다.

## 2. 도구 선정 및 아키텍처

### 2.1 단위 및 컴포넌트 테스트: Vitest
- **선정 이유**: Vite 기반 프로젝트와의 완벽한 통합, 빠른 실행 속도, Jest 호환 API 제공.
- **핵심 라이브러리**:
    - `vitest`: 메인 테스트 러너.
    - `@vue/test-utils`: Vue 컴포넌트 유틸리티.
    - `jsdom`: 브라우저 환경 모뮬레이션.

### 2.2 엔드 투 엔드 (E2E) 테스트: Playwright
- **선정 이유**: 현대적인 브라우저 자동화 도구 중 가장 빠르고 신뢰도가 높으며, 훌륭한 디버깅 도구(UI Mode, Trace Viewer)를 제공함.
- **핵심 라이브러리**:
    - `@playwright/test`: Playwright 공식 테스트 러너.

## 3. 파일 구조 및 규칙

### 3.1 테스트 파일 위치
- **단위/컴포넌트 테스트**: 구현 파일과 동일한 디렉토리에 `.spec.ts` 확장자로 생성.
    - 예: `src/components/MyButton.vue` -> `src/components/MyButton.spec.ts`
- **E2E 테스트**: 프로젝트 루트의 `e2e/` 폴더에서 관리.
    - 예: `e2e/login.spec.ts`

### 3.2 디렉토리 구조 예시
```text
frontend/
├── src/
│   ├── components/
│   │   ├── Button.vue
│   │   └── Button.spec.ts
├── e2e/
│   └── home.spec.ts
├── vitest.config.ts
└── playwright.config.ts
```

## 4. TDD 워크플로우 (Scripts)

`package.json`에 다음 스크립트를 추가하여 개발자가 쉽게 TDD를 수행할 수 있도록 합니다.

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

## 5. 구현 세부 사항

### 5.1 Vitest 설정 (`vitest.config.ts`)
- `vite.config.ts`를 확장하여 별도의 설정 중복을 최소화합니다.
- `environment: 'jsdom'` 설정을 통해 컴포넌트 테스트 환경을 구축합니다.

### 5.2 Playwright 설정 (`playwright.config.ts`)
- 테스트 대상 URL을 Vite 개발 서버(`http://localhost:5173`)로 설정합니다.
- 테스트 전 자동으로 서버를 띄우는 `webServer` 옵션을 구성합니다.

### 5.3 TypeScript 설정
- `compilerOptions.types`에 `vitest/globals` 및 `@playwright/test`를 추가하여 전역 타입 경고를 해결합니다.

## 6. 성공 기준
1. 유틸리티 함수 및 Vue 컴포넌트에 대한 단위 테스트가 성공적으로 실행됨.
2. Playwright를 통한 기본 페이지 로드 테스트가 성공적으로 실행됨.
3. 모든 테스트 도구가 TypeScript 타입을 정상적으로 인식함.
