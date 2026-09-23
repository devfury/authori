# 개발완료보고서 — 한 관리자가 여러 테넌트를 관리

- 작성일: 2026-09-23
- 브랜치: `feat/multi-tenant-admin`
- 관련 요구사항: [2026-09-23-multi-tenant-admin-requirements.md](../requirements/2026-09-23-multi-tenant-admin-requirements.md)
- 관련 설계: [2026-09-23-multi-tenant-admin-spec.md](../specs/2026-09-23-multi-tenant-admin-spec.md)
- 관련 계획: [2026-09-23-multi-tenant-admin-plan.md](../plans/2026-09-23-multi-tenant-admin-plan.md)

## 1. 구현 요약

`admin_users.tenant_id` 단일 컬럼이 강제하던 "한 관리자 = 한 테넌트" 제약을 N:M 매핑으로 바꿨다. 이제 한 계정에 여러 테넌트를 배정하고, 로그인 후 선택·전환하며 관리할 수 있다.

설계에서 가장 중요한 선택은 **배정 목록을 JWT 에 담지 않은 것**이다. 담으면 배정을 해제해도 토큰이 만료될 때까지 접근이 유지된다. 이 프로젝트에는 토큰 폐기 체계가 없으므로, 가드가 매 요청 DB 를 조회하게 해서 **회수가 즉시 반영**되도록 했다. 대가는 가드마다 인덱스 조회 1회다.

## 2. 완료된 작업

| # | 작업 | 커밋 |
|---|---|---|
| 1 | `AdminUserTenant` 엔티티 + 마이그레이션 | `9cd36a2` |
| 2 | `AdminTenantAccessService` + 테스트 | `9cd36a2` |
| 3 | `TenantAdminGuard` 소속 조회 전환 + 가드 테스트 | `9cd36a2` |
| 4 | JWT 에서 `tenantId` 제거, 로그인 응답 `tenants`, `GET /admin/auth/me` | `9cd36a2` |
| 5 | 생성·수정의 `tenantIds` 처리·검증 + 서비스 테스트 | `9cd36a2` |
| 6 | auth store 배정 캐시·로그인 이동 분기 + 테스트 | `dcdb491` |
| 7 | 라우터 가드 포함 검사 + `/admin/select-tenant` | `dcdb491` |
| 8 | `TenantSwitcher` + 사이드바 연결 + 테스트 | `dcdb491` |
| 9 | 관리자 생성·수정·목록 다중 선택 | `dcdb491` |
| 10 | 4단계 검증 | — |
| — | CLAUDE.md 아키텍처 설명 갱신 | `7efdeba` |

### 2.1 데이터 모델

`admin_user_tenants(admin_user_id, tenant_id, created_at)` — 복합 PK 가 중복을, `CASCADE` 가 고아 행을 DB 차원에서 막는다. 기존 `user_roles` 규약을 따랐다. 역방향 조회를 위해 `tenant_id` 단독 인덱스를 뒀다(복합 PK 의 선두가 `admin_user_id` 라 타지 못한다).

`admin_users.tenant_id` 는 제거했다. 같은 사실의 출처를 둘로 두지 않는다.

### 2.2 인가

```
PLATFORM_ADMIN                      → 통과 (배정 조회조차 하지 않음)
TENANT_ADMIN + 배정된 :tenantId     → 통과
TENANT_ADMIN + 배정되지 않은 tenant → 403
```

JWT 페이로드는 `{ sub, email, role, type }` 이 됐다. 기존에 발급된 토큰은 잉여 `tenantId` 클레임을 가진 채 서명 검증을 그대로 통과하고, 아무도 읽지 않으므로 무해하다.

### 2.3 API

| 엔드포인트 | 변경 |
|---|---|
| `POST /admin/auth/login` | 응답에 `tenants: [{id, slug, name}]` 추가 (PLATFORM_ADMIN 은 `[]`) |
| `GET /admin/auth/me` | **신설.** 새로고침·배정 변경 후 목록을 되맞추는 경로 |
| `POST /admin/auth/admins` | `tenantId` → `tenantIds: string[]` |
| `PATCH /admin/auth/admins/:id` | `tenantId` → `tenantIds: string[]` (전체 교체, 생략 시 유지) |
| `GET /admin/auth/admins` | 항목의 `tenantId` → `tenants: [...]` |

검증: TENANT_ADMIN 은 최소 1개 필수, PLATFORM_ADMIN 에게는 배정하지 않음, 존재하지 않거나 비활성인 테넌트 거부, 중복 제거. 관리자 저장과 배정 교체는 한 트랜잭션에 묶었다.

### 2.4 프런트엔드

- 배정 목록은 로그인 응답에서 받아 `localStorage('admin_tenants')` 에 캐시한다. **라우터 가드를 동기로 유지하기 위한 캐시**이며, 인가의 단일 진실은 서버다.
- 로그인 후 이동: 플랫폼 관리자 → 테넌트 목록 / 배정 1개 → 곧바로 대시보드(**기존 경험 그대로**) / 2개 이상 → 선택 화면 / 0개 → 403.
- `TenantSwitcher` 는 배정이 2개 이상일 때만 드롭다운이 된다. 전환 시 `tenantId` 만 다른 화면이면 같은 화면을 유지하고, `:userId` 처럼 다른 파라미터가 있으면 그 자원이 새 테넌트에 없으므로 대시보드로 보낸다. 쿼리(페이지·검색어·필터)는 버린다 — 이전 테넌트의 조건을 새 테넌트에 적용하면 결과가 오해를 부른다.

### 2.5 계획에 없던 발견과 처리

| 발견 | 처리 |
|---|---|
| 관리자 목록 화면이 slug 표시를 위해 **테넌트 전체를 따로 조회**(`limit: 1000`)하고 있었다. 목록 API 가 이제 `tenants`(slug 포함)를 내려주므로 불필요해졌다. | 해당 호출과 `tenantSlugMap` 을 걷어냈다. 화면 진입마다 나가던 요청 1건이 사라진다. |
| 생성 화면과 수정 다이얼로그가 같은 선택기를 필요로 했다. | 공용 `TenantMultiSelect.vue` 로 분리했다(검색 포함). |
| `CLAUDE.md` 의 `TenantAdminGuard` 설명이 `tenantId` 등치 비교로 남아 실제와 어긋나게 됐다. | 갱신하면서, 앞선 두 작업에서 정한 401/403 분리와 조회 실패 표시 규약도 함께 적었다. |

## 3. 빌드/테스트 실행 결과

| 명령 | 결과 |
|---|---|
| `bun run lint` | **실패 — 기존 api baseline** (아래 3.1) |
| `bun run typecheck` | 통과 (api, web) |
| `bun run test` | 통과 — **api 28 suites / 257 tests, web 11 files / 55 tests** |
| `bun run build` | 통과 (api, web) |

### 3.1 lint

최종 `✖ 122 problems (67 errors, 55 warnings)` 로 `develop` baseline 과 **정확히 일치**한다. `apps/web` 의 lint 오류는 0건이다.

작업 중 한때 **68 errors 로 1건 늘었다.** 새로 쓴 가드 테스트에서 `expect(access.isMember)` 가 `@typescript-eslint/unbound-method` 에 걸린 것으로, 스텁이 목 함수를 서비스 객체와 따로 돌려주도록 고쳐 해소했다. baseline 을 수치만 보고 넘기지 않고 파일 단위로 대조한 덕에 잡혔다.

### 3.2 테스트 커버리지 (신규 42건)

- `admin-tenant-access.service` (9): `isMember` 참·거짓·빈 입력, `listTenantIds`, `listTenants`(배정 없으면 테넌트 미조회), `replaceAssignments` 중복 제거·빈 목록.
- `admin-auth.service` (15): 생성·수정의 배정 검증 전반, 역할 전환 시 배정 정리, 로그인 응답의 `tenants`.
- `admin-guards` (10): 배정 기반 통과·거부, 다중 배정, **배정 해제 직후 같은 토큰으로 즉시 403**, 플랫폼 관리자는 조회조차 하지 않음.
- `auth.store` (7): 로그인 이동 분기 4종, 캐시 저장·정리, 깨진 캐시 내성.
- `TenantSwitcher` (6): 1개면 드롭다운 아님, 전환 시 화면 유지·대시보드 폴백, 같은 테넌트 재선택 시 미이동.

## 4. 남은 리스크 및 후속 작업

| 항목 | 내용 |
|---|---|
| **마이그레이션 미실행** | 실행 환경이 없어 SQL 을 실제로 돌려보지 못했다. **배포 시 반드시 확인해야 한다.** 이관(`INSERT ... SELECT`)이 `DROP COLUMN` 보다 먼저임을 코드 주석과 설계서에 못박았고, 리뷰 시 최우선 확인 대상이다. |
| **배포 순서 제약** | 컬럼이 사라지므로 **구버전 API 와 신버전 스키마가 공존할 수 없다.** 구버전 인스턴스는 `admin_users.tenant_id` 를 SELECT 하다 실패한다. 마이그레이션과 API 배포를 같은 창에서 수행해야 한다. 무중단이 필요하면 (1) 테이블 생성·이관 (2) 신버전 배포 (3) 컬럼 제거 로 3단계 분할이 필요하며 절차를 설계서에 남겼다. |
| **down 마이그레이션의 정보 손실** | 단일 컬럼으로 되돌리므로 2개 이상 배정된 관리자는 **가장 먼저 배정된 하나만** 남는다. 롤백 전 `admin_user_tenants` 백업이 필요하다. |
| **테넌트 배정 변경이 감사되지 않음** | 요구사항의 제외 범위. 현재 `AdminAuthService` 는 `AuditService` 를 전혀 쓰지 않아 **관리자 계정 변경 전체가 감사되지 않는다** — 기존부터 있던 공백이다. 테넌트 배정은 권한 경계를 바꾸는 행위라 감사 가치가 높으므로 **후속 작업 1순위**로 제안한다. 매핑의 `created_at` 이 최소한의 단서를 남긴다. |
| **수동 검증 미실시** | 설계서 8장의 6개 시나리오를 배포 후 확인 권장. 특히 **⑤ 배정 해제 직후 기존 토큰으로 403** 은 이번 설계의 핵심이므로 실제로 확인할 가치가 있다. |
| **가드의 추가 조회** | 매 요청 1회. 복합 PK 인덱스를 타는 `exists` 질의라 부담이 작지만, 부하가 문제되면 요청 단위 캐시로 막을 수 있다(설계서 3.1). |
| **lint baseline 부채** | api 의 67 errors / 55 warnings 가 누적돼 있다. 신규 유입 감지를 어렵게 하므로 별도 정리 권장(세 번째 보고서에서 연속 지적). |
