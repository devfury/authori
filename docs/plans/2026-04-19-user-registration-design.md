# User Registration Feature Design

**Date:** 2026-04-19  
**Status:** Approved

## Overview

테넌트별로 회원가입을 허용할지 제어하는 설정을 추가하고, 허용된 테넌트의 OAuth 로그인 페이지에서 프로필 스키마 기반 회원가입 기능을 제공한다. 가입된 계정은 `INACTIVE` 상태로 생성되며, 관리자가 수동으로 활성화한다.

---

## 1. 데이터 모델

### `TenantSettings` 엔티티 변경

`backend/src/database/entities/tenant-settings.entity.ts`에 컬럼 1개 추가:

```typescript
@Column({ name: 'allow_registration', default: false })
allowRegistration: boolean;
```

### DB 마이그레이션

새 마이그레이션 파일 생성:

```sql
ALTER TABLE tenant_settings
  ADD COLUMN allow_registration boolean NOT NULL DEFAULT false;
```

### User 엔티티

변경 없음. 기존 `UserStatus.INACTIVE` 값을 회원가입 사용자에게 그대로 적용.

---

## 2. 백엔드 API

### 2-1. `GET /t/:tenantSlug/oauth/login-config` 응답 확장

`AuthorizeService.getLoginConfig()`가 반환하는 객체에 `allowRegistration` 필드 추가:

```typescript
{
  clientName: string;
  branding: LoginBranding | null;
  scopes?: Array<...>;
  allowRegistration: boolean;  // 신규
}
```

구현: `TenantSettings`를 조회하여 `allowRegistration` 값을 포함.

### 2-2. `POST /t/:tenantSlug/oauth/register` (신규, 공개 엔드포인트)

**위치:** `AuthorizeController` (또는 동일 모듈 내 별도 컨트롤러)

**Rate limit:** `@Throttle({ default: { limit: 5, ttl: 60_000 } })`

**Request Body:**
```typescript
{
  email: string;        // 필수
  password: string;     // 필수
  name?: string;        // 선택
  profile?: Record<string, unknown>; // 선택, 스키마 기반 프로필 필드
  requestId?: string;   // 선택, OAuth 흐름 복귀용
  clientId?: string;    // 선택, OAuth 흐름 복귀용
}
```

**Response:**
```typescript
{ message: 'registered' }
```

**처리 로직:**
1. `TenantSettings` 조회 → `allowRegistration === false`이면 `403 Forbidden` 반환
2. `UsersService.create()` 호출 — `CreateUserDto`에 `initialStatus?: UserStatus` 옵션 추가하여 `INACTIVE`를 전달. 기존 관리자 호출 경로는 기본값(`ACTIVE`)을 사용하므로 하위 호환성 유지.
3. 성공 시 `{ message: 'registered' }` 반환

**에러 케이스:**
- `allowRegistration === false` → `403 Forbidden: registration_disabled`
- 이메일 중복 → `409 Conflict: email_already_exists`
- 프로필 스키마 검증 실패 → `400 Bad Request`

---

## 3. 프론트엔드

### 3-1. 신규 라우트

`frontend/src/router/index.ts`에 추가:

```typescript
{
  path: '/register',
  name: 'oauth-register',
  component: () => import('@/views/oauth/OAuthRegisterView.vue'),
  meta: { layout: 'auth', public: true },
}
```

### 3-2. `OAuthLoginView.vue` 변경

`login-config` 응답의 `allowRegistration`이 `true`일 때 로그인 폼 하단에 링크 표시:

```html
<p v-if="allowRegistration" class="text-center text-sm text-gray-500 mt-4">
  계정이 없으신가요?
  <RouterLink :to="registerRoute" class="font-medium" style="color: var(--auth-primary-color, #4f46e5)">
    회원가입
  </RouterLink>
</p>
```

`registerRoute`는 현재 쿼리 파라미터(`requestId`, `tenantSlug`, `clientId`, `scopes`)를 그대로 전달하는 `/register` 경로.

### 3-3. `OAuthRegisterView.vue` (신규)

**위치:** `frontend/src/views/oauth/OAuthRegisterView.vue`

**마운트 시 동작:**
1. `GET /t/:tenantSlug/oauth/login-config`로 브랜딩 + `allowRegistration` 확인
2. `allowRegistration === false`이면 에러 메시지 표시 (직접 URL 접근 방어)
3. `GET /t/:tenantSlug/profile-schema/active` (또는 login-config 응답 확장)으로 활성 프로필 스키마 로드

**폼 구성:**
- 이메일 (필수)
- 비밀번호 (필수)
- 이름 (선택)
- 프로필 스키마 기반 동적 필드 (기존 `UserCreateView.vue`의 `parseJsonSchema()` / `initProfileValues()` 로직 재사용)

**제출 성공 시:**
- 폼을 숨기고 안내 메시지 표시:  
  > "가입이 완료됐습니다. 관리자 승인 후 로그인하실 수 있습니다."
- "로그인으로 돌아가기" 버튼 → `/login` (쿼리 파라미터 유지)

**에러 처리:**
- `409` → "이미 사용 중인 이메일입니다."
- `403` → "이 서비스는 회원가입을 지원하지 않습니다."
- 기타 → "회원가입 중 오류가 발생했습니다."

**브랜딩:** 로그인 페이지와 동일한 CSS 변수(`--auth-bg-color`, `--auth-primary-color`) 적용.

---

## 4. 관리자 화면 변경

### `TenantDetailView.vue` (또는 테넌트 설정 편집 화면)

테넌트 설정 섹션에 "회원가입 허용" 토글 추가. 기존 `UpdateTenantDto` / `TenantSettings` 업데이트 API를 통해 저장.

---

## 5. 프로필 스키마 연동 방법

`login-config` 응답에 활성 스키마 JSON을 포함시키는 방식을 채택한다. 별도 공개 엔드포인트를 추가하면 클라이언트 요청이 늘어나므로, `getLoginConfig()`가 `ProfileSchemaService.findActive(tenantId)`를 호출하여 스키마 정보를 함께 반환한다.

```typescript
// login-config 응답 추가 필드
activeSchema?: {
  schemaJsonb: Record<string, unknown>;
} | null;
```

활성 스키마가 없으면 `activeSchema: null`을 반환하고, 프론트엔드는 기본 필드(이메일, 비밀번호, 이름)만 표시한다.

---

## 6. 보안 고려사항

| 항목 | 대응 |
|---|---|
| 스팸 가입 | Rate limit (분당 5회/IP) |
| 미승인 계정 로그인 시도 | `AuthorizeService.loginAndAuthorize()`에서 `INACTIVE` 상태 체크 후 `403` 반환 (기존 로직 확인 필요) |
| 직접 URL 접근 | 프론트엔드 + 백엔드 양쪽에서 `allowRegistration` 검증 |
| 비밀번호 정책 | 기존 `TenantSettings.passwordMinLength` 규칙 적용 |

---

## 7. 변경 파일 목록

**Backend:**
- `backend/src/database/entities/tenant-settings.entity.ts` — `allowRegistration` 컬럼 추가
- `backend/src/database/migrations/XXXXXXXXXXXXXX-AddAllowRegistration.ts` — 마이그레이션
- `backend/src/oauth/authorize/authorize.service.ts` — `getLoginConfig()` 응답 확장, `register()` 메서드 추가
- `backend/src/oauth/authorize/authorize.controller.ts` — `POST register` 엔드포인트 추가
- `backend/src/oauth/authorize/dto/register.dto.ts` — 신규 DTO
- `backend/src/tenants/dto/update-tenant.dto.ts` — `allowRegistration` 필드 추가 (TenantSettings 업데이트용)

**Frontend:**
- `frontend/src/router/index.ts` — `/register` 라우트 추가
- `frontend/src/views/oauth/OAuthLoginView.vue` — 회원가입 링크 추가
- `frontend/src/views/oauth/OAuthRegisterView.vue` — 신규 컴포넌트
- `frontend/src/views/platform/tenants/TenantDetailView.vue` — `allowRegistration` 토글 추가
- `frontend/src/api/` — register API 함수 추가

---

## 8. 구현 순서 (권장)

1. DB 마이그레이션 + `TenantSettings` 엔티티 수정
2. 백엔드 `register` 엔드포인트 구현
3. `login-config` 응답에 `allowRegistration` 추가
4. 프로필 스키마 공개 접근 방식 결정 및 구현
5. 프론트엔드 `OAuthRegisterView.vue` 구현
6. `OAuthLoginView.vue` 회원가입 링크 추가
7. 관리자 화면 `allowRegistration` 토글 추가
