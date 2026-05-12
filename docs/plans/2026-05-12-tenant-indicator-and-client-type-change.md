# 구현 계획: 테넌트 표기 + 클라이언트 타입 변경

## 1. 사이드바 테넌트 표기

**목표**: 테넌트 관련 메뉴 상단에 현재 설정 중인 테넌트 이름 표시

### 변경 파일
- `frontend/src/layouts/AdminLayout.vue`
  - `tenantId` watch → `tenantsApi.findOne()` 호출 → `tenantName` ref 유지
  - `tenantName` prop을 AppSidebar에 전달
- `frontend/src/components/shared/AppSidebar.vue`
  - `tenantName?: string` prop 추가
  - 테넌트 메뉴 섹션 상단에 테넌트 이름 칩(chip) 표시

---

## 2. 클라이언트 타입 변경

**목표**: OAuth 클라이언트 편집 화면에서 PUBLIC ↔ CONFIDENTIAL 타입 변경 가능

### 변경 파일 (Backend)
- `backend/src/oauth/clients/dto/update-client.dto.ts`
  - `type?: ClientType` 필드 추가
- `backend/src/oauth/clients/clients.service.ts`
  - `UpdateClientResult` 인터페이스 추가 `{ client, plainSecret }`
  - `update()` 반환 타입 변경
  - 타입 전환 로직:
    - PUBLIC → CONFIDENTIAL: 신규 secret 생성
    - CONFIDENTIAL → PUBLIC: `clientSecretHash = null`

### 변경 파일 (Frontend)
- `frontend/src/api/clients.ts`
  - `UpdateClientPayload`에 `type?` 추가
  - `update()` 응답 타입을 `{ client: OAuthClient, plainSecret: string | null }` 로 변경
- `frontend/src/views/tenant/clients/ClientDetailView.vue`
  - `editType` ref 추가
  - 편집 폼에 타입 라디오 버튼 추가
  - 저장 후 `plainSecret` 반환 시 새 secret 표시

---

## 구현 순서
1. [x] Backend DTO/Service 수정
2. [x] Frontend API 타입 수정
3. [x] AdminLayout 테넌트 조회 로직 추가
4. [x] AppSidebar 테넌트 표기 UI
5. [x] ClientDetailView 타입 변경 UI
