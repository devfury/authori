# 저장소 코딩 컨벤션

이 문서는 Authori 저장소에서 **사람과 AI 코딩 에이전트가 동일한 방식으로 작업하기 위한 최소 규칙**을 정의한다.

목표는 다음 3가지다.

- 새 코드가 기존 코드와 자연스럽게 이어질 것
- 같은 기능을 여러 에이전트가 구현해도 결과가 크게 흔들리지 않을 것
- 리뷰에서 스타일 논쟁보다 설계/정합성 검증에 시간을 쓸 수 있을 것

---

## 1. 우선순위

컨벤션 충돌 시 우선순위는 다음과 같다.

1. 이 문서
2. 기존 저장소의 대표(reference) 파일
3. 린터 / 포매터 설정
4. 프레임워크 일반 관례

기존 코드와 다른 새 패턴을 만들고 싶다면, 먼저 이 문서 또는 별도 설계 문서에 이유를 남긴다.

---

## 2. 대표(reference) 파일

새 코드를 추가할 때 아래 파일을 먼저 참고한다.

### 2-1. 백엔드

- `backend/src/users/users.service.ts`
- `backend/src/tenants/tenants.controller.ts`
- `backend/src/common/audit/audit.service.ts`
- `backend/src/oauth/clients/clients.service.ts`
- `backend/src/admin/auth/admin-auth.controller.ts`

### 2-2. 프론트엔드

- `frontend/src/api/http.ts`
- `frontend/src/router/index.ts`
- `frontend/src/stores/auth.store.ts`
- `frontend/src/views/tenant/users/UserListView.vue`
- `frontend/src/views/oauth/OAuthLoginView.vue`

---

## 3. 공통 규칙

### 3-1. 기존 패턴 우선

- 같은 역할의 파일이 이미 있으면 그 구조를 그대로 따른다.
- 새 추상화, 새 헬퍼, 새 베이스 클래스는 **반복이 2~3곳 이상에서 실제로 확인될 때만** 추가한다.
- 버그 수정 시 리팩터링을 섞지 않는다. 필요한 부분만 최소 수정한다.

### 3-2. 타입 안정성 우선

- `as any`, `@ts-ignore`, `@ts-expect-error` 사용 금지
- 타입이 불명확하면 타입을 추가하거나 흐름을 분리해서 해결한다.
- API/DTO/스토어 상태는 가능한 한 명시적 타입을 유지한다.

### 3-3. 이름 규칙

- 클래스/컴포넌트/DTO: PascalCase
- 함수/메서드/변수: camelCase
- Vue SFC 뷰 파일: `XxxView.vue`
- Pinia store 파일: `xxx.store.ts`
- API 모듈 파일: 도메인 단위 (`users.ts`, `tenants.ts`, `clients.ts`)

### 3-4. 포매팅

- 백엔드는 `backend/.prettierrc`와 `backend/eslint.config.mjs`를 따른다.
- 백엔드 기본 포맷 규칙: single quote, trailing comma.
- 포맷 차이보다 기존 파일의 줄바꿈/배치 패턴을 먼저 맞춘다.

---

## 4. 백엔드 규칙 (NestJS)

### 4-1. 계층 분리

- Controller는 요청 파싱, Guard 적용, 파라미터 수집에 집중한다.
- 비즈니스 로직은 Service에 둔다.
- DB 접근은 Service 내부 Repository / DataSource를 통해 수행한다.

### 4-2. DTO 우선

- 요청 바디/쿼리 구조는 DTO로 정의한다.
- DTO 이름은 `CreateXxxDto`, `UpdateXxxDto`, `XxxQueryDto` 형태를 우선 사용한다.
- Controller 메서드는 가능한 한 primitive 묶음을 직접 받기보다 DTO를 사용한다.

### 4-3. 서비스 메서드 네이밍

가능한 한 아래 패턴을 따른다.

- `create`
- `findAll`
- `findOne`
- `update`
- `remove` / `revoke` / `activate` / `deactivate`
- 도메인 특화 동작은 의미가 분명한 동사 사용 (`login`, `bootstrap`, `exchange`, `publish` 등)

### 4-4. 트랜잭션 경계

여러 엔티티를 함께 저장하거나, 중간 단계 실패 시 전체 롤백이 필요한 작업은 반드시 트랜잭션으로 묶는다.

```typescript
return this.dataSource.transaction(async (manager) => {
  // 여러 repository / entity write
})
```

다음 경우는 트랜잭션 후보로 본다.

- 2개 이상의 테이블 변경
- 상태 전이 + 이력 기록이 함께 발생
- OAuth 코드/토큰/consent 등 정합성이 중요한 흐름

### 4-5. Audit 규칙

- 중요한 생성/수정/삭제/인증 이벤트는 `AuditService`를 통해 기록한다.
- `AuditContext`는 Controller에서 구성해 Service로 전달한다.
- 감사 로그는 **트랜잭션 성공 후** 기록한다. 트랜잭션 안에서 직접 기록하지 않는다.

### 4-6. 멀티테넌시 규칙

- tenant 경계는 1급 제약조건으로 취급한다.
- tenant 리소스 조회/수정 시 `tenantId` 누락 금지
- 쿼리 조건, 권한 검사, 감사 로그에 tenant 정보를 일관되게 포함한다.

### 4-7. 예외 처리

- 서비스 레이어에서 `BadRequestException`, `UnauthorizedException`, `NotFoundException`, `ConflictException` 등 Nest 기본 예외를 사용한다.
- 예외 메시지는 짧고 명확하게 작성한다.
- 예외를 숨기기 위한 빈 `catch` 블록 사용 금지

### 4-8. Guard / 권한 규칙

- 인증/인가 규칙은 Guard로 표현한다.
- Platform Admin / Tenant Admin 구분을 기존 Guard 패턴에 맞춘다.
- Controller에서 role 분기 로직을 직접 늘리지 않는다.

---

## 5. 프론트엔드 규칙 (Vue 3)

### 5-1. SFC 기본 구조

- Vue SFC는 기본적으로 `<script setup lang="ts">`를 사용한다.
- 상태는 Composition API(`ref`, `computed`, `onMounted`) 중심으로 작성한다.
- 뷰 컴포넌트는 페이지 단위 책임에 집중하고, 재사용 UI는 `components/shared`로 분리한다.

### 5-2. 파일 구조

- 페이지: `src/views/**/XxxView.vue`
- 공용 컴포넌트: `src/components/shared/*`
- 레이아웃: `src/layouts/*`
- API 모듈: `src/api/*.ts`
- 스토어: `src/stores/*.store.ts`

### 5-3. 라우팅 규칙

- 라우트 정의는 `frontend/src/router/index.ts` 패턴을 따른다.
- 인증/레이아웃/권한 여부는 route meta로 표현한다.

예:

- `meta.public`
- `meta.layout`
- `meta.requiresAuth`
- `meta.requiresPlatformAdmin`

- 라우터 가드에서 처리 가능한 규칙은 컴포넌트 내부에서 다시 중복 구현하지 않는다.

### 5-4. API 클라이언트 규칙

- 일반적인 관리자 API 호출은 `frontend/src/api/http.ts`의 공통 axios 인스턴스를 사용한다.
- 새 API 모듈은 도메인별로 분리하고, typed request/response를 함께 정의한다.
- API 함수 이름은 `findAll`, `findOne`, `create`, `update`, `delete`, `activate`, `deactivate` 등 기존 패턴을 우선 사용한다.

```typescript
export const usersApi = {
  findAll(tenantId: string, query?: UsersQuery) {
    return http.get<UsersPage>(`/admin/tenants/${tenantId}/users`, { params: query })
  },
}
```

### 5-5. Store 규칙

- 전역 상태는 Pinia store로 관리한다.
- store는 작고 역할이 분명해야 한다.
- 인증 상태는 `auth.store.ts`, UI 상태는 `ui.store.ts`처럼 책임별로 나눈다.
- 컴포넌트 내부의 일회성 상태는 store로 올리지 않는다.

### 5-6. 스타일링 규칙

- 스타일링은 Tailwind utility class를 기본으로 사용한다.
- 같은 화면 안에서는 spacing, typography, button style을 기존 화면과 맞춘다.
- 반복되는 UI 조각은 공용 컴포넌트로 승격한다.

### 5-7. 로딩 / 에러 처리

- 비동기 화면은 최소한 `loading` 상태를 명시적으로 가진다.
- API 호출 실패 시 사용자에게 의미 있는 메시지를 노출하되, 관리자 인증 흐름을 깨지 않도록 주의한다.
- URL query, 필터, 페이징 상태는 기존 목록 화면 규칙을 우선 따른다.

---

## 6. 알려진 예외

### 6-1. OAuth 로그인 화면의 별도 axios 인스턴스

`frontend/src/views/oauth/OAuthLoginView.vue`는 일반 관리자 API 흐름과 다르게 **별도 axios 인스턴스**를 사용할 수 있다.

이 예외는 다음 목적을 가진다.

- OAuth 엔드포인트 호출이 관리자 401 인터셉터와 결합되지 않도록 분리
- 로그인/브랜딩 요청이 관리자 세션 로그아웃을 유발하지 않도록 보호

따라서 다음은 금지한다.

- OAuth 로그인 흐름을 무조건 `src/api/http.ts`로 통합하는 것
- 위 예외의 이유를 검토하지 않고 401 인터셉터를 공유하는 것

예외를 유지하되, 새 코드도 동일한 의도를 지켜야 한다.

---

## 7. AI 코딩 에이전트 작업 규칙

- 작업 시작 전 반드시 같은 도메인의 대표 파일을 1~2개 확인한다.
- 기존에 없는 새 패턴을 만들기보다 기존 패턴을 복제/확장한다.
- Backend 변경 시 다음을 먼저 확인한다.
  - DTO 존재 여부
  - tenantId 전달 경로
  - transaction 필요 여부
  - audit 필요 여부
- Frontend 변경 시 다음을 먼저 확인한다.
  - 기존 API 모듈 사용 가능 여부
  - route meta에 반영할 사항이 있는지
  - store로 올릴 상태인지, 로컬 상태인지
  - 기존 공용 컴포넌트 재사용 가능 여부
- 한 작업 안에서 backend/frontend를 같이 수정할 때는 양쪽 컨벤션을 각각 따른다. 한쪽의 스타일을 다른 쪽에 가져오지 않는다.

---

## 8. PR / 리뷰 체크리스트

리뷰 전 아래 항목을 확인한다.

### 8-1. 공통

- [ ] 기존 패턴을 벗어나는 새 구조를 도입하지 않았다.
- [ ] 타입을 우회하지 않았다.
- [ ] 파일명과 함수명이 기존 네이밍 규칙과 맞다.

### 8-2. 백엔드

- [ ] 요청 구조가 DTO로 정의되어 있다.
- [ ] Controller / Service 책임이 섞이지 않았다.
- [ ] multi-entity write는 transaction으로 묶였다.
- [ ] mutation 후 audit 기록이 필요하면 반영했다.
- [ ] tenant 경계가 누락되지 않았다.

### 8-3. 프론트엔드

- [ ] 새 API 호출이 기존 API 모듈 / http 패턴을 따른다.
- [ ] route meta가 필요한 화면이면 반영했다.
- [ ] store 사용이 과하지 않다.
- [ ] Tailwind / 공용 컴포넌트 사용이 기존 화면과 조화롭다.
- [ ] 로딩 / 에러 / 빈 상태 처리가 빠지지 않았다.

---

## 9. 문서 갱신 규칙

다음 경우 이 문서를 같이 수정한다.

- 기존 컨벤션을 의도적으로 바꾼 경우
- 예외가 새로 생긴 경우
- 대표 파일이 더 적절한 새 구현으로 교체된 경우

컨벤션은 문서보다 코드가 먼저 바뀌는 경우가 많다. 다만 코드가 바뀌었으면 문서도 같은 PR 또는 바로 다음 PR에서 맞춘다.
