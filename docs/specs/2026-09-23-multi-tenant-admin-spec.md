# 개발설계서 — 한 관리자가 여러 테넌트를 관리

- 작성일: 2026-09-23
- 관련 요구사항: [2026-09-23-multi-tenant-admin-requirements.md](../requirements/2026-09-23-multi-tenant-admin-requirements.md)

## 1. 범위

백엔드(엔티티·마이그레이션·인가·API)와 프런트엔드(로그인 흐름·전환 UI·관리 화면)를 모두 변경한다.

## 2. 데이터 모델

### 2.1 신규 엔티티 `AdminUserTenant`

기존 N:M 매핑(`user_roles`, `role_permissions`)과 같은 규약을 따른다 — 복합 PK + `onDelete: 'CASCADE'`.

```ts
// apps/api/src/database/entities/admin-user-tenant.entity.ts
@Entity('admin_user_tenants')
export class AdminUserTenant {
  @PrimaryColumn({ name: 'admin_user_id', type: 'uuid' })
  adminUserId: string;

  @PrimaryColumn({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => AdminUser, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'admin_user_id' })
  adminUser: AdminUser;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
```

- 복합 PK 가 FR-3(중복 방지)을 DB 차원에서 보장한다.
- `CASCADE` 가 FR-2(고아 행 없음)를 보장한다.
- `tenant_id` 단독 인덱스를 추가한다. 복합 PK 의 선두 컬럼은 `admin_user_id` 라 "이 테넌트를 맡은 관리자" 역방향 조회에 쓰이지 않는다.
- `created_at` 은 배정 시점 추적용. 감사 로그가 없는 현 상태에서 최소한의 단서가 된다.

### 2.2 `AdminUser` 변경

`tenant_id` 컬럼을 **제거**한다(FR-4). 매핑 테이블이 단일 진실이 된다.

### 2.3 마이그레이션 `AddAdminUserTenants`

```sql
-- up
CREATE TABLE "admin_user_tenants" (
  "admin_user_id" uuid NOT NULL,
  "tenant_id"     uuid NOT NULL,
  "created_at"    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "PK_admin_user_tenants" PRIMARY KEY ("admin_user_id", "tenant_id")
);
CREATE INDEX "IDX_admin_user_tenants_tenant" ON "admin_user_tenants" ("tenant_id");
ALTER TABLE "admin_user_tenants"
  ADD CONSTRAINT "FK_admin_user_tenants_admin" FOREIGN KEY ("admin_user_id")
  REFERENCES "admin_users"("id") ON DELETE CASCADE;
ALTER TABLE "admin_user_tenants"
  ADD CONSTRAINT "FK_admin_user_tenants_tenant" FOREIGN KEY ("tenant_id")
  REFERENCES "tenants"("id") ON DELETE CASCADE;

-- 기존 배정 이관 (FR-5)
INSERT INTO "admin_user_tenants" ("admin_user_id", "tenant_id")
SELECT "id", "tenant_id" FROM "admin_users" WHERE "tenant_id" IS NOT NULL;

ALTER TABLE "admin_users" DROP COLUMN "tenant_id";
```

**이관을 컬럼 제거보다 먼저** 수행한다. 순서가 뒤바뀌면 기존 배정이 전부 사라진다.

```sql
-- down (손실 있음)
ALTER TABLE "admin_users" ADD "tenant_id" uuid;
UPDATE "admin_users" a SET "tenant_id" = (
  SELECT "tenant_id" FROM "admin_user_tenants"
  WHERE "admin_user_id" = a."id" ORDER BY "created_at", "tenant_id" LIMIT 1
);
DROP TABLE "admin_user_tenants";
```

> **down 은 정보를 잃는다** (NFR-3). 단일 컬럼으로 되돌리므로 2개 이상 배정된 관리자는 **가장 먼저 배정된 하나만** 남고 나머지는 사라진다. 결정적 순서를 위해 `created_at` 다음 `tenant_id` 로 정렬한다. 롤백 전에 이 표를 백업해야 한다.

> **배포 제약** (NFR-2): 컬럼 제거가 포함되므로 구버전 API 와 신버전 스키마가 공존할 수 없다. 구버전 코드는 `admin_users.tenant_id` 를 SELECT 하다 실패한다. **마이그레이션과 API 배포를 같은 창에서** 수행한다. 무중단이 필요하면 (1) 테이블 추가·이관만 배포 → (2) 신버전 API 배포 → (3) 컬럼 제거를 별도 마이그레이션으로, 3단계로 쪼개야 한다. 본 작업은 단일 마이그레이션으로 진행하되 이 선택지를 문서에 남긴다.

## 3. 인가

### 3.1 접근 조회 서비스 `AdminTenantAccessService`

가드가 리포지토리를 직접 다루지 않도록 얇은 서비스를 둔다. `admin/auth/` 에 배치하고 `AdminAuthModule` 에서 export 한다(가드들이 이미 이 모듈에 있다).

```ts
async isMember(adminUserId: string, tenantId: string): Promise<boolean>
async listTenantIds(adminUserId: string): Promise<string[]>
async listTenants(adminUserId: string): Promise<Array<Pick<Tenant, 'id' | 'slug' | 'name'>>>
```

`isMember` 는 `exists` 질의 1회다. 복합 PK 를 그대로 타므로 인덱스 스캔이다(NFR-4).

### 3.2 `TenantAdminGuard`

```ts
if (admin.role === AdminRole.PLATFORM_ADMIN) return true;

if (admin.role === AdminRole.TENANT_ADMIN) {
  const paramTenantId = request.params['tenantId'];
  if (paramTenantId && (await this.access.isMember(admin.sub, paramTenantId))) {
    return true;
  }
}
throw new ForbiddenException('Tenant admin access required for this tenant');
```

등치 비교가 DB 조회로 바뀐다. **배정 해제가 즉시 반영된다**(FR-9) — 토큰에 담지 않기로 한 결정(D-3)의 직접적 결과다.

### 3.3 JWT 페이로드

```ts
export interface AdminJwtPayload {
  sub: string;
  email: string;
  role: AdminRole;
  type: 'admin';
  // tenantId 제거 (FR-10)
}
```

기존에 발급된 토큰은 `tenantId` 를 더 갖고 있으나 아무도 읽지 않으므로 무해하다. 서명 검증도 그대로 통과한다.

## 4. API

### 4.1 로그인 응답 (FR-17)

```jsonc
// POST /admin/auth/login
{
  "access_token": "...",
  "tenants": [ { "id": "...", "slug": "acme", "name": "Acme Corp" } ]  // PLATFORM_ADMIN 은 []
}
```

PLATFORM_ADMIN 에게 전체 테넌트를 내려주지 않는다. 역할로 이미 전체 접근이 되고, 목록은 기존 테넌트 목록 API 가 담당한다.

### 4.2 현재 사용자 조회 (신규)

```
GET /admin/auth/me   (AdminJwtGuard)
→ { id, email, name, role, tenants: [...] }
```

새로고침·토큰 재사용 시 프런트가 목록을 다시 확보하는 경로다. 로그인 응답만으로는 localStorage 가 비거나 배정이 바뀐 경우를 감당할 수 없다.

### 4.3 관리자 생성·수정

| 항목 | 변경 전 | 변경 후 |
|---|---|---|
| `POST /admin/auth/admins` | `tenantId?: string` | `tenantIds?: string[]` |
| `PATCH /admin/auth/admins/:id` | `tenantId?: string` | `tenantIds?: string[]` |
| `GET /admin/auth/admins` | 항목에 `tenantId` | 항목에 `tenants: [{id, slug, name}]` |

검증 규칙:

- TENANT_ADMIN 인데 `tenantIds` 가 비었으면 400 (FR-13).
- PLATFORM_ADMIN 에 `tenantIds` 가 오면 무시하고 빈 배열로 저장 (FR-14).
- 존재하지 않거나 `status !== ACTIVE` 인 테넌트가 포함되면 400 (FR-15).
- `tenantIds` 는 중복을 제거해 저장한다.
- `PATCH` 에서 `tenantIds` 가 `undefined` 면 배정을 건드리지 않는다. 배열이 오면 **전체 교체**(set semantics)다. 부분 추가·제거 API 를 따로 두지 않는다 — 화면이 다중 선택이라 전체 집합을 보내는 편이 자연스럽고, 동시 수정 시 의도가 명확하다.

배정 교체는 `dataSource.transaction` 안에서 삭제 후 삽입한다. 관리자 저장과 배정이 한 트랜잭션에 묶여야 중간 상태가 남지 않는다.

### 4.4 역할 전환 시 배정 정리

`PATCH` 로 TENANT_ADMIN → PLATFORM_ADMIN 으로 바꾸면 기존 배정을 모두 삭제한다. 반대로 PLATFORM_ADMIN → TENANT_ADMIN 은 `tenantIds` 를 함께 받아야 하며, 없으면 400 이다.

## 5. 프런트엔드

### 5.1 auth store

```ts
interface AdminTenant { id: string; slug: string; name: string }

const tenants = ref<AdminTenant[]>(load from localStorage)
const tenantIds = computed(() => tenants.value.map(t => t.id))
```

JWT 에서 `tenantId` 를 읽던 부분을 제거하고, 로그인 응답의 `tenants` 를 `localStorage('admin_tenants')` 에 저장한다. 라우터 가드를 동기로 유지하기 위한 캐시다 — 가드를 async 로 만들면 모든 화면 이동에 왕복이 붙는다. **서버가 단일 진실**(NFR-1)이므로 캐시가 조금 낡아도 안전하다.

`logout()` 은 `admin_tenants` 도 지운다.

### 5.2 로그인 후 이동 (FR-18·19·23)

```
PLATFORM_ADMIN            → /admin/tenants
TENANT_ADMIN, 소속 1개    → /admin/tenants/{id}/dashboard      (기존 동작 유지)
TENANT_ADMIN, 소속 2개+   → /admin/select-tenant
TENANT_ADMIN, 소속 0개    → /403  (배정이 회수된 계정)
```

### 5.3 테넌트 선택 화면 (신규)

`/admin/select-tenant` — `meta: { layout: 'auth', requiresAuth: true }`. 소속 테넌트를 카드 목록으로 보여주고 고르면 해당 대시보드로 이동한다. 소속이 1개 이하면 진입 시 곧바로 적절한 곳으로 돌려보낸다(URL 직접 입력 대비).

### 5.4 사이드바 전환 드롭다운 (FR-20·21)

현재 테넌트명을 보여주는 배지(`AppSidebar.vue`)를 드롭다운으로 바꾼다. **소속이 2개 이상일 때만** 드롭다운이 되고, 1개면 지금 그대로 이름만 표시한다(NFR-6).

전환 시 화면 성격 유지(FR-21):

```ts
// 현재 라우트가 tenantId 만 다른 같은 이름으로 존재하면 그대로 유지한다.
// :userId 같은 다른 파라미터가 있으면 그 자원은 새 테넌트에 없으므로 대시보드로 보낸다.
const keepsName = route.name && Object.keys(route.params).every(k => k === 'tenantId')
router.push(keepsName
  ? { name: route.name, params: { tenantId: next }, query: {} }
  : { name: 'tenant-dashboard', params: { tenantId: next } })
```

쿼리(페이지·검색어·필터)는 버린다. 이전 테넌트의 필터를 새 테넌트에 적용하면 결과가 오해를 부른다.

### 5.5 라우터 가드 (FR-22)

```ts
if (typeof targetTenantId === 'string' && !auth.isPlatformAdmin) {
  if (!auth.tenantIds.includes(targetTenantId)) return next({ name: 'forbidden' })
}
```

어제 넣은 등치 비교를 포함 검사로 바꾼다. 나머지 로직은 그대로다.

### 5.6 관리자 생성·수정 화면 (FR-11·12·16)

`AdminCreateView.vue`·`EditAdminDialog.vue` 의 단일 `<select>` 를 **체크박스 목록**으로 바꾼다. 테넌트 수가 많아질 수 있으므로 검색 입력을 함께 둔다. `AdminListView.vue` 는 테넌트명을 여러 개 표시하고, 3개를 넘으면 "외 N개"로 줄인다(`ExternalAuthListView` 의 도메인 표시와 같은 방식).

## 6. 보안 검토

| 항목 | 판단 |
|---|---|
| 배정 해제의 즉시성 | 가드가 매 요청 DB 를 보므로 즉시 반영된다(FR-9). 토큰 폐기 체계가 없는 현 구조에서 이것이 D-3 의 핵심 이득이다. |
| 프런트 캐시의 낡음 | 사용자가 `localStorage` 를 조작해도 서버 가드가 차단한다. 캐시는 UX 용이다. |
| 권한 확대 경로 | 배정은 PLATFORM_ADMIN 만 변경할 수 있다(`PlatformAdminGuard`). 관리자 본인은 자기 배정을 못 바꾼다. |
| 비활성 테넌트 | 배정 시 `ACTIVE` 만 허용(FR-15). 이미 배정된 테넌트가 나중에 비활성화되는 경우는 기존 테넌트 상태 검사 흐름을 따른다(본 작업에서 신설하지 않음). |
| 감사 공백 | 테넌트 배정 변경이 감사되지 않는다. **기존부터 관리자 계정 변경 전체가 감사되지 않던 공백**이며, 요구사항에서 후속 작업으로 분리했다. 보고서에 명시한다. |

## 7. 테스트 설계

### 7.1 백엔드

| 파일 | 케이스 |
|---|---|
| `admin-guards.spec.ts` (수정) | TENANT_ADMIN 소속 테넌트 통과 / 비소속 403 / PLATFORM_ADMIN 통과 / `tenantId` 파라미터 없음 403 / 배정 해제 후 즉시 403 |
| `admin-auth.service.spec.ts` (신규) | TENANT_ADMIN 에 `tenantIds` 빈 배열 400 / 존재하지 않는 테넌트 400 / 비활성 테넌트 400 / 중복 제거 / PLATFORM_ADMIN 은 배정 무시 / PATCH 전체 교체 / PATCH 미전달 시 유지 / 역할 전환 시 배정 정리 |
| `admin-tenant-access.service.spec.ts` (신규) | `isMember` 참·거짓, `listTenants` 반환 형태 |

### 7.2 프런트엔드

| 파일 | 케이스 |
|---|---|
| `tenant-guard.spec.ts` (수정) | 소속 목록 포함 통과 / 미포함 차단 / 플랫폼 관리자 통과 |
| `auth.store.spec.ts` (신규) | 로그인 후 이동 분기 4종(플랫폼/1개/2개+/0개), 로그아웃 시 캐시 정리 |
| `TenantSwitcher.spec.ts` (신규) | 소속 1개면 드롭다운 아님 / 2개+면 드롭다운 / 전환 시 라우트 유지·대시보드 폴백 |

## 8. 수동 검증 시나리오

1. 관리자에게 테넌트 2개 배정 → 로그인 → 선택 화면 → 하나 선택 → 대시보드 정상.
2. 사용자 목록에서 드롭다운으로 전환 → 새 테넌트의 **사용자 목록**이 열림.
3. 사용자 상세에서 전환 → 새 테넌트의 **대시보드**로 이동.
4. 배정되지 않은 테넌트 ID 를 주소창에 입력 → 403.
5. 플랫폼 관리자가 배정 하나를 해제 → **해당 관리자가 로그인 상태 그대로** 그 테넌트 화면 새로고침 → 403.
6. 기존 단일 테넌트 관리자 → 로그인 시 선택 화면 없이 곧바로 대시보드.
