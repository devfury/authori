# 로그인 화면 커스터마이징 설계

## 개요

PUBLIC 타입 OAuth 클라이언트 인증 시 표시되는 `/login` 페이지를 클라이언트별로 커스터마이징할 수 있는 기능이다.
클라이언트마다 로고, 브랜드 색상, 타이틀 등을 독립적으로 설정하여 서비스 고유의 로그인 화면을 제공한다.

---

## 배경

현재 `/login` 페이지는 모든 클라이언트에 동일한 UI를 제공한다. 여러 서비스가 하나의 Authori 인스턴스를 공유하는 멀티테넌트 구조에서는 각 서비스가 자신의 브랜드 아이덴티티로 로그인 페이지를 표현해야 할 필요가 있다.

---

## 데이터 모델

### `oauth_clients` 테이블 — `branding` 컬럼 추가

`OAuthClient` 엔티티에 JSONB 컬럼 `branding`을 추가한다. 별도 테이블을 두지 않고 클라이언트에 임베드한다.

```typescript
// oauth-client.entity.ts
@Column({ type: 'jsonb', nullable: true })
branding: LoginBranding | null;
```

```typescript
// 타입 정의
export interface LoginBranding {
  /** 로고 이미지 URL */
  logoUrl?: string;
  /** 브랜드 주 색상 (hex, e.g., "#4f46e5") */
  primaryColor?: string;
  /** 로그인 페이지 배경 색상 (hex) */
  bgColor?: string;
  /** 로그인 카드 타이틀. 기본값: "{clientName}에 로그인" */
  title?: string;
}
```

### 마이그레이션

```sql
ALTER TABLE oauth_clients
  ADD COLUMN branding jsonb NULL;
```

---

## Backend

### 1. `GET /t/:tenantSlug/oauth/login-config`

로그인 페이지가 마운트 시 호출하는 공개 엔드포인트. `client_id`로 해당 클라이언트의 브랜딩 정보를 반환한다.

**Query parameters**

| 파라미터 | 필수 | 설명 |
|---|---|---|
| `client_id` | Y | `GET /authorize` 단계에서 식별된 OAuth client_id |

**Response**

```json
{
  "clientName": "MyApp",
  "branding": {
    "logoUrl": "https://cdn.example.com/logo.png",
    "primaryColor": "#e53e3e",
    "bgColor": "#fff5f5",
    "title": "MyApp 계정으로 로그인"
  }
}
```

`branding`이 null이면 `{}` 반환 (프론트엔드에서 기본값 사용).

**인증 불필요** — 로그인 전 접근 가능한 공개 엔드포인트.

`requestId` 유효성은 이 API가 아니라 실제 로그인 제출(`POST /t/:tenantSlug/oauth/authorize`)에서만 검사한다. 즉, 브랜딩 조회는 `client_id` 기반으로 분리하고, authorize 진행 상태는 기존처럼 `requestId` 기반으로 유지한다.

### 2. `AuthorizeService.initiateAuthorize()` 변경

반환 결과에 `branding` 포함. GET /authorize의 JSON 응답(모바일 앱용)에서도 브랜딩 정보를 바로 받을 수 있도록 한다. HTML 로그인 페이지로 리다이렉트할 때는 최소한의 쿼리만 전달하고, 브랜딩은 `/oauth/login-config?client_id=`로 조회한다.

```typescript
return {
  requestId,
  client: { name: client.name, clientId: client.clientId },
  requestedScopes,
  tenantSlug,
  branding: client.branding ?? null,   // ← 추가
};
```

### 3. `ClientsService` / DTO 변경

`UpdateClientDto`에 `branding` 필드 추가. `ClientsService.update()`에서 branding 저장 처리.

---

## Frontend

### `OAuthLoginView.vue` 변경

**흐름**

1. `onMounted` → `GET /t/:tenantSlug/oauth/login-config?client_id=` 호출
2. 반환된 `branding` 기반으로 CSS 변수 주입 및 로고 표시
3. 브랜딩 로딩 전 스켈레톤 표시 (선택)

**동적 스타일 적용 방식**

```vue
<script setup>
const branding = ref<LoginBranding>({})

// primaryColor → --brand-color CSS 변수로 주입
const brandStyle = computed(() => ({
  '--brand-color': branding.value.primaryColor ?? '#4f46e5',
  '--bg-color':    branding.value.bgColor ?? '#f9fafb',
  'background-color': 'var(--bg-color)',
}))
</script>

<template>
  <div :style="brandStyle">
    <img v-if="branding.logoUrl" :src="branding.logoUrl" alt="logo" />
    <h1>{{ branding.title ?? `${clientName}에 로그인` }}</h1>
    <!-- 버튼에 var(--brand-color) 적용 -->
  </div>
</template>
```

### `ClientDetailView.vue` 변경 (관리자 화면)

수정 모드에 브랜딩 섹션 추가:

- 로고 URL 입력 (텍스트 인풋 + 미리보기)
- 주 색상 (color picker)
- 배경 색상 (color picker)
- 타이틀 (텍스트 인풋, placeholder: 기본값 표시)

---

## 전체 변경 파일 목록

| 파일 | 변경 유형 |
|---|---|
| `backend/src/database/entities/oauth-client.entity.ts` | `branding` 컬럼 추가 |
| `backend/src/database/migrations/AddClientBranding.ts` | 신규 마이그레이션 |
| `backend/src/oauth/clients/dto/update-client.dto.ts` | `branding` 필드 추가 |
| `backend/src/oauth/clients/clients.service.ts` | `update()` branding 처리 |
| `backend/src/oauth/authorize/authorize.service.ts` | `initiateAuthorize()` 반환값 변경 |
| `backend/src/oauth/authorize/authorize.controller.ts` | `login-config` 엔드포인트 추가 |
| `frontend/src/views/oauth/OAuthLoginView.vue` | 브랜딩 로딩 및 동적 스타일 적용 |
| `frontend/src/views/tenant/clients/ClientDetailView.vue` | 브랜딩 편집 UI 추가 |
