# 개발계획서 — 한 관리자가 여러 테넌트를 관리

- 작성일: 2026-09-23
- 관련 요구사항: [2026-09-23-multi-tenant-admin-requirements.md](../requirements/2026-09-23-multi-tenant-admin-requirements.md)
- 관련 설계: [2026-09-23-multi-tenant-admin-spec.md](../specs/2026-09-23-multi-tenant-admin-spec.md)
- 브랜치: `feat/multi-tenant-admin`

## Goal

`admin_users.tenant_id` 단일 컬럼이 강제하던 1:1 제약을 N:M 매핑으로 바꾸고, 한 관리자가 여러 테넌트를 오가며 관리할 수 있게 한다. 인가는 서버가 매 요청 DB 로 판정해 배정 해제가 즉시 반영되게 한다.

## 변경 파일 목록

### 백엔드 — 신규

| 파일 | 역할 |
|---|---|
| `apps/api/src/database/entities/admin-user-tenant.entity.ts` | N:M 매핑 엔티티 |
| `apps/api/src/database/migrations/<ts>-AddAdminUserTenants.ts` | 테이블 생성·이관·컬럼 제거 |
| `apps/api/src/admin/auth/admin-tenant-access.service.ts` | 소속 조회 서비스 |
| `apps/api/src/admin/auth/admin-tenant-access.service.spec.ts` | 테스트 |
| `apps/api/src/admin/auth/admin-auth.service.spec.ts` | 배정 검증 테스트 |

### 백엔드 — 수정

| 파일 | 변경 |
|---|---|
| `apps/api/src/database/entities/admin-user.entity.ts` | `tenantId` 컬럼 제거 |
| `apps/api/src/database/entities/index.ts` | 신규 엔티티 export |
| `apps/api/src/database/data-source.ts` | 엔티티 등록 (필요 시) |
| `apps/api/src/admin/auth/admin-auth.service.ts` | JWT 페이로드, 로그인 응답, 생성·수정의 `tenantIds` 처리 |
| `apps/api/src/admin/auth/admin-auth.controller.ts` | `GET /admin/auth/me` 추가 |
| `apps/api/src/admin/auth/admin-auth.module.ts` | 신규 엔티티·서비스 등록 및 export |
| `apps/api/src/admin/auth/dto/create-admin.dto.ts` | `tenantId` → `tenantIds` |
| `apps/api/src/admin/auth/dto/update-admin.dto.ts` | `tenantId` → `tenantIds` |
| `apps/api/src/admin/guards/tenant-admin.guard.ts` | 등치 비교 → 소속 조회 |
| `apps/api/src/admin/guards/admin-guards.spec.ts` | 소속 기반으로 재작성 |

### 프런트엔드 — 신규

| 파일 | 역할 |
|---|---|
| `apps/web/src/views/auth/TenantSelectView.vue` | 로그인 직후 테넌트 선택 |
| `apps/web/src/components/shared/TenantSwitcher.vue` | 사이드바 전환 드롭다운 |
| `apps/web/src/components/shared/TenantSwitcher.spec.ts` | 테스트 |
| `apps/web/src/components/shared/TenantMultiSelect.vue` | 생성·수정 화면 공용 다중 선택기 |
| `apps/web/src/stores/auth.store.spec.ts` | 로그인 이동 분기 테스트 |

### 프런트엔드 — 수정

| 파일 | 변경 |
|---|---|
| `apps/web/src/stores/auth.store.ts` | `tenants` 상태·캐시, 로그인 후 이동 분기 |
| `apps/web/src/api/auth.ts` | 로그인 응답 타입, `me()` 추가 |
| `apps/web/src/api/admins.ts` | `tenantId` → `tenantIds`, 목록 항목의 `tenants` |
| `apps/web/src/router/index.ts` | 포함 검사, `/admin/select-tenant` 라우트 |
| `apps/web/src/router/tenant-guard.spec.ts` | 소속 목록 기반으로 갱신 |
| `apps/web/src/components/shared/AppSidebar.vue` | 배지 → `TenantSwitcher` |
| `apps/web/src/layouts/AdminLayout.vue` | 전환기에 필요한 값 전달 |
| `apps/web/src/views/platform/admins/AdminCreateView.vue` | 다중 선택 (`TenantMultiSelect` 사용) |
| `apps/web/src/views/platform/admins/EditAdminDialog.vue` | 다중 선택 |
| `apps/web/src/views/platform/admins/AdminListView.vue` | 테넌트 여러 개 표시 + 별도 테넌트 조회 제거(목록 API 가 slug 를 내려줌) |

## 작업 단계

- [x] 1. `AdminUserTenant` 엔티티 + 마이그레이션 (이관 → 컬럼 제거 순서 준수) (FR-1~5)
- [x] 2. `AdminTenantAccessService` + 테스트 (FR-6)
- [x] 3. `TenantAdminGuard` 소속 조회로 전환 + 가드 테스트 갱신 (FR-6~9)
- [x] 4. JWT 페이로드에서 `tenantId` 제거, 로그인 응답에 `tenants` 추가, `GET /admin/auth/me` 신설 (FR-10, FR-17)
- [x] 5. 관리자 생성·수정의 `tenantIds` 처리와 검증 + 서비스 테스트 (FR-11~16)
- [x] 6. 프런트 auth store — `tenants` 캐시와 로그인 후 이동 분기 + 테스트 (FR-18·19·23)
- [x] 7. 라우터 가드 포함 검사 + `/admin/select-tenant` 라우트·화면 (FR-19, FR-22)
- [x] 8. `TenantSwitcher` 컴포넌트 + 사이드바 연결 + 테스트 (FR-20·21)
- [x] 9. 관리자 생성·수정·목록 화면 다중 선택 (FR-11·12·16)
- [x] 10. 4단계 검증 명령 전체 실행 및 통과

백엔드(1~5)를 먼저 끝내고 프런트(6~9)로 넘어간다. 프런트가 기대하는 응답 형태가 백엔드에서 확정돼야 한다.

## 검증 명령과 기대 결과

```bash
bun run lint        # develop baseline 대비 신규 유입 0건
bun run typecheck   # 타입 오류 없음
bun run test        # 신규·수정 스펙 포함 전체 통과
bun run build       # api·web 빌드 성공
```

추가 확인:

- **마이그레이션은 실행 환경이 없어 자동 검증이 불가능하다.** SQL 을 리뷰로 확인하고, 이관 순서(INSERT → DROP COLUMN)를 코드와 문서 양쪽에 남긴다. 실제 적용은 배포 시 수동 확인 대상으로 보고서에 명시한다.
- 가드 테스트는 **수정 전 코드에서 실패**함을 먼저 확인한다(소속 조회가 없어 비교가 성립하지 않음).
- `AdminUser.tenantId` 를 읽는 코드가 남아 있지 않은지 전체 검색으로 확인한다. 타입 오류로 대부분 드러나지만 문자열 참조는 잡히지 않는다.

## 리스크

| 리스크 | 영향 | 대응 |
|---|---|---|
| **마이그레이션 순서 오류** | 기존 배정 전량 소실 | INSERT ... SELECT 를 DROP COLUMN 보다 먼저. 마이그레이션 주석과 설계서에 명시. 리뷰 시 최우선 확인. |
| **down 마이그레이션의 정보 손실** | 롤백 시 다중 배정이 1개로 축소 | 되돌릴 수 없는 손실임을 문서·주석에 명시하고 롤백 전 백업을 요구. |
| **구버전 API + 신버전 스키마 공존 불가** | 배포 중 구버전 인스턴스가 500 | 마이그레이션과 API 배포를 같은 창에서. 무중단이 필요하면 3단계 분할 절차를 설계서에 남김. |
| 가드마다 DB 조회 1회 추가 | 지연·부하 | 복합 PK 인덱스를 타는 `exists` 질의. 필요해지면 요청 단위 캐시로 막을 수 있음을 설계서에 기록. |
| 프런트 캐시(`admin_tenants`)가 낡음 | 전환 목록이 실제와 다름 | 서버가 단일 진실이라 접근은 차단됨. `GET /admin/auth/me` 로 갱신 경로 제공. |
| JWT 에서 `tenantId` 제거 | 기존 발급 토큰을 읽던 프런트 코드가 `undefined` 를 봄 | 프런트도 같은 배포에서 캐시 기반으로 전환. 기존 토큰은 서명 검증을 그대로 통과하며 잉여 클레임은 무시된다. |
| 변경 범위가 넓음(20+ 파일) | 누락·회귀 | 계획서 단계를 순서대로, 백엔드 완료 후 프런트. 단계마다 커밋하고 `typecheck` 로 조기 확인. |
