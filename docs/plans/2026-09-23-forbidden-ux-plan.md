# 개발계획서 — 권한 없는 접근을 화면에 드러내기

- 작성일: 2026-09-23
- 관련 요구사항: [2026-09-23-forbidden-ux-requirements.md](../requirements/2026-09-23-forbidden-ux-requirements.md)
- 관련 설계: [2026-09-23-forbidden-ux-spec.md](../specs/2026-09-23-forbidden-ux-spec.md)
- 브랜치: `fix/forbidden-ux`

## Goal

테넌트 관리자가 권한 없는 테넌트 URL 로 진입할 때 **화면이 그려지기 전에** 403 으로 차단하고, 라우터가 걸러내지 못한 조회 실패도 빈 화면이 아니라 이유가 보이는 화면으로 끝나게 한다.

## 변경 파일 목록

### 신규

| 파일 | 역할 |
|---|---|
| `apps/web/src/utils/api-error.ts` | HTTP 오류 → 사용자 문구 매핑 (순수 함수) |
| `apps/web/src/utils/api-error.spec.ts` | 매핑 테스트 |
| `apps/web/src/components/shared/ErrorState.vue` | 공용 오류 표시 + 다시 시도 |
| `apps/web/src/components/shared/ErrorState.spec.ts` | 컴포넌트 테스트 |
| `apps/web/src/router/tenant-guard.spec.ts` | 라우터 가드 테스트 |

### 수정

| 파일 | 변경 |
|---|---|
| `apps/web/src/router/index.ts` | `beforeEach` 에 테넌트 경계 검사 추가 |
| `apps/web/src/views/ForbiddenView.vue` | 역할별 복귀 경로·문구 |
| `apps/web/src/views/tenant/DashboardView.vue` | 오류 상태 |
| `apps/web/src/views/tenant/clients/ClientListView.vue` | 오류 상태 |
| `apps/web/src/views/tenant/users/UserListView.vue` | 오류 상태 |
| `apps/web/src/views/tenant/rbac/RoleListView.vue` | 오류 상태 |
| `apps/web/src/views/tenant/rbac/PermissionListView.vue` | 오류 상태 |
| `apps/web/src/views/tenant/scopes/ScopeListView.vue` | 오류 상태 |
| `apps/web/src/views/tenant/schemas/SchemaListView.vue` | 오류 상태 |
| `apps/web/src/views/tenant/audit/AuditLogView.vue` | 오류 상태 |
| `apps/web/src/views/tenant/external-auth/ExternalAuthListView.vue` | 오류 상태 |

변경 없음: 백엔드 전체, DB 스키마, `http.ts` 인터셉터.

## 작업 단계

- [x] 1. `utils/api-error.ts` 작성 + 테스트 (FR-6, FR-7)
- [x] 2. `components/shared/ErrorState.vue` 작성 + 테스트 (FR-5, FR-7)
- [x] 3. 라우터 가드에 테넌트 경계 검사 추가 + 테스트 (FR-1, FR-2, FR-3)
- [x] 4. `ForbiddenView` 역할별 복귀 경로·문구 (FR-4)
- [ ] 5. 목록 화면 9곳에 오류 상태 적용 (FR-5)
- [ ] 6. 4단계 검증 명령 전체 실행 및 통과

1·2 를 먼저 하는 이유: 3·4·5 가 모두 이 두 조각에 의존한다.

## 검증 명령과 기대 결과

```bash
bun run lint        # develop baseline 대비 신규 유입 0건
bun run typecheck   # 타입 오류 없음
bun run test        # 신규 3개 스펙 포함 전체 통과 (api 233 + web 기존 + 신규)
bun run build       # api·web 빌드 성공
```

추가 확인:

- **lint 는 `develop` 에 기존 실패(67 errors / 55 warnings)가 있다.** 직전 작업과 동일하게 오류 파일 목록을 `diff` 해 신규 유입이 0건임을 확인한다.
- 라우터 가드 테스트는 **수정 전 코드에서 실패**함을 먼저 확인한다(타 테넌트 진입이 통과해 버리는 것).
- 기존 web 스펙(`AppSidebar`, `ClientCreateView`, `OAuthRegisterView`, `DialogModalBehavior`, `App`)이 계속 통과하는지 확인한다.

## 리스크

| 리스크 | 영향 | 대응 |
|---|---|---|
| 라우터 가드가 플랫폼 관리자의 정상 이동을 막음 | 플랫폼 관리자가 테넌트 화면에 못 들어감 | `isPlatformAdmin` 을 먼저 확인해 검사를 건너뛴다. 테스트로 고정. |
| `to.params.tenantId` 타입이 `string \| string[]` | 배열일 때 비교가 항상 실패해 오탐 차단 | `typeof === 'string'` 으로 좁힌 뒤에만 검사. |
| 9개 화면 일괄 수정 중 템플릿 분기 실수 | 목록이 아예 안 보이거나 오류가 항상 표시됨 | 기존 `v-if="loading && ..."` 뒤에 `v-else-if` 를 끼우는 동일 패턴만 적용. 화면마다 변수명이 다르므로 파일별로 확인하고 `typecheck` + `build` 로 검증. |
| 403 에서 재시도 버튼이 무의미하게 노출 | 사용자가 반복 클릭 | `retryable` 로 권한 오류에서는 버튼을 감춘다. |
| 프런트 가드를 보안 경계로 오인 | 이후 서버 검사를 느슨하게 만들 유혹 | 설계서와 코드 주석에 "UX 장치이며 서버 `TenantAdminGuard` 가 실제 경계"임을 명시. |
