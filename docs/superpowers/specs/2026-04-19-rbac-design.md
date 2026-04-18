# RBAC (Role-Based Access Control) 구현 계획

## 현황 및 목표

현재 authori JWT payload는 `sub`, `tenant_id`, `client_id`, `scope`만 포함하며 사용자 역할 정보가 없다.
Scope는 클라이언트 앱 단위 접근 제어이므로, 사용자별 권한 제어(RBAC)를 위해서는 역할/권한 claim이 별도로 필요하다.

### Scope vs RBAC 역할 분리

| 레이어 | 질문 | 담당 |
|---|---|---|
| Scope | 이 앱이 이 리소스에 접근 허용됐나? | authori (클라이언트 단위) |
| RBAC | 이 사용자가 이 작업을 수행할 수 있나? | RBAC (사용자 단위) |

두 조건을 AND로 결합하여 최종 인가 결정.

---

## 데이터 모델

### 1. Role 엔티티 (`tenant_roles`)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | uuid | PK |
| `tenantId` | uuid | FK → tenants (CASCADE) |
| `name` | varchar | 역할 식별자 (예: `manager`, `viewer`) |
| `displayName` | varchar | 표시명 |
| `description` | text, nullable | 설명 |
| `createdAt` | timestamp | — |

복합 유니크 인덱스: `(tenantId, name)`

### 2. Permission 엔티티 (`tenant_permissions`)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | uuid | PK |
| `tenantId` | uuid | FK → tenants (CASCADE) |
| `name` | varchar | 권한 식별자 (예: `orders:delete`) |
| `displayName` | varchar | 표시명 |
| `description` | text, nullable | 설명 |
| `createdAt` | timestamp | — |

복합 유니크 인덱스: `(tenantId, name)`

### 3. RolePermission 조인 테이블 (`role_permissions`)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `roleId` | uuid | FK → tenant_roles (CASCADE) |
| `permissionId` | uuid | FK → tenant_permissions (CASCADE) |

복합 PK: `(roleId, permissionId)`

### 4. UserRole 조인 테이블 (`user_roles`)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `userId` | uuid | FK → users (CASCADE) |
| `roleId` | uuid | FK → tenant_roles (CASCADE) |

복합 PK: `(userId, roleId)`

---

## JWT Claim 변경

토큰 발급 시 사용자 역할과 권한을 JWT에 포함한다.

```json
{
  "sub": "user-id",
  "tenant_id": "tenant-id",
  "client_id": "client-id",
  "scope": "openid read:orders",
  "roles": ["manager"],
  "permissions": ["orders:read", "orders:delete"]
}
```

- `client_credentials` grant (userId 없음)는 roles/permissions 포함하지 않음
- claims 크기 최적화 고려: permissions 수가 많으면 roles만 포함하고 리소스 서버가 역할→권한 매핑을 직접 관리하는 방식도 검토

---

## 구현 단계

### 1단계: DB 스키마 + 마이그레이션

- `tenant_roles`, `tenant_permissions`, `role_permissions`, `user_roles` 테이블 생성
- 마이그레이션 이름: `CreateRbacTables`
- 엔티티 파일: `backend/src/database/entities/`

### 2단계: Roles / Permissions Admin API

클라이언트별 TenantScope처럼 테넌트 단위로 역할/권한을 관리하는 API.

**엔드포인트**:
```
GET    /admin/tenants/:tenantId/roles
POST   /admin/tenants/:tenantId/roles
PATCH  /admin/tenants/:tenantId/roles/:id
DELETE /admin/tenants/:tenantId/roles/:id

GET    /admin/tenants/:tenantId/permissions
POST   /admin/tenants/:tenantId/permissions
PATCH  /admin/tenants/:tenantId/permissions/:id
DELETE /admin/tenants/:tenantId/permissions/:id

PUT    /admin/tenants/:tenantId/roles/:id/permissions   # 역할에 권한 일괄 설정
```

**모듈 구조**: `backend/src/rbac/` (RolesModule, PermissionsModule 또는 단일 RbacModule)

### 3단계: 사용자-역할 할당 API

```
GET  /admin/tenants/:tenantId/users/:userId/roles
PUT  /admin/tenants/:tenantId/users/:userId/roles   # 역할 일괄 설정
```

기존 `UsersModule`에 추가하거나 별도 엔드포인트로 분리.

### 4단계: JWT 발급 시 roles/permissions claim 주입

**파일**: `backend/src/oauth/token/token.service.ts`

`issueTokenPairInTx()` 내부에서 `userId`가 있을 때 사용자의 역할과 권한을 조회하여 JWT payload에 포함.

```ts
// userId가 있는 경우에만
const roles = await this.rbacService.getUserRoles(tenantId, userId);
const permissions = await this.rbacService.getUserPermissions(tenantId, userId);

const accessTokenJwt = sign(
  {
    sub: userId,
    tenant_id: tenantId,
    client_id: clientId,
    scope: scopes.join(' '),
    ...(userId ? { roles, permissions } : {}),
  },
  ...
);
```

### 5단계: RequireRoles 데코레이터 + RolesGuard

**새 파일**: `backend/src/common/decorators/require-roles.decorator.ts`
**새 파일**: `backend/src/common/guards/roles.guard.ts`

리소스 서버 또는 authori 내부 API에서 사용:

```ts
@Delete('orders/:id')
@UseGuards(AccessTokenGuard, ScopeGuard, RolesGuard)
@RequireScopes('write:orders')
@RequireRoles('manager')
delete() { ... }
```

---

## 우선순위 요약

| 순서 | 작업 | 공수 |
|---|---|---|
| 1 | DB 스키마 + 엔티티 + 마이그레이션 | 중 |
| 2 | Roles / Permissions Admin API | 중 |
| 3 | 사용자-역할 할당 API | 소 |
| 4 | JWT claim 주입 | 소 |
| 5 | RequireRoles 데코레이터 + Guard | 소 |

## 관련 파일

- `backend/src/oauth/token/token.service.ts` — JWT 발급
- `backend/src/database/entities/` — 엔티티
- `backend/src/users/` — 사용자 관리
- `backend/src/common/guards/` — ScopeGuard (참고)
- `backend/src/common/decorators/` — RequireScopes (참고)
- `docs/design-scope-system.md` — Scope 시스템 설계 (연관)
