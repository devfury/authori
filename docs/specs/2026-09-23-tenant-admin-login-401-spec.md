# 개발설계서 — 테넌트 관리자 로그인 실패(401 강제 로그아웃) 수정

- 작성일: 2026-09-23
- 관련 요구사항: [2026-09-23-tenant-admin-login-401-requirements.md](../requirements/2026-09-23-tenant-admin-login-401-requirements.md)

## 1. 범위

백엔드(`apps/api`)의 인가 계층만 변경한다. DB 스키마·마이그레이션 변경 없음. 프런트엔드는 API 경로·요청 형태가 그대로이므로 **수정 없음**.

변경 대상:

- `apps/api/src/admin/guards/platform-admin.guard.ts`
- `apps/api/src/admin/guards/tenant-admin.guard.ts`
- `apps/api/src/tenants/tenants.controller.ts`
- `apps/api/src/tenants/tenants.module.ts` (가드 의존성 주입)

## 2. 현재 동작

```ts
// tenants.controller.ts
@UseGuards(PlatformAdminGuard)   // ← 클래스 전체
@Controller('admin/tenants')
export class TenantsController {
  @Get(':id')  findOne(...)
  @Patch(':id') update(...)
  @Post(':id/notify-test') notifyTest(...)
  ...
}
```

`PlatformAdminGuard` 는 role 이 `PLATFORM_ADMIN` 이 아니면 `UnauthorizedException`(401)을 던진다. 프런트 `http.ts` 는 401 을 **인증 만료**로 해석해 무조건 로그아웃한다.

## 3. 설계

### 3.1 가드: 인증 실패(401)와 인가 실패(403) 분리 — FR-7

`AdminJwtGuard` 는 그대로 401 을 유지한다(토큰 부재·위조·만료 = 인증 실패).
역할/테넌트 경계 검사만 403 으로 바꾼다.

```ts
// platform-admin.guard.ts
if (request.admin?.role !== AdminRole.PLATFORM_ADMIN) {
  throw new ForbiddenException('Platform admin access required');
}

// tenant-admin.guard.ts
throw new ForbiddenException('Tenant admin access required for this tenant');
```

이것만으로 FR-8("403은 로그아웃을 유발하지 않는다")이 충족된다. `http.ts` 인터셉터는 401 에만 반응하므로 프런트 변경이 필요 없다.

> 계약 변경: 권한 부족 응답이 401 → 403 으로 바뀐다. 차단 여부 자체는 동일하므로 보안 경계는 그대로다(NFR-3).

### 3.2 가드 적용 위치: 클래스 → 메서드

NestJS 에서 메서드 레벨 `@UseGuards` 는 클래스 레벨 가드를 **대체하지 않고 함께 실행**된다. 따라서 일부 엔드포인트만 완화하려면 클래스 레벨 가드를 제거하고 메서드마다 명시해야 한다.

| 엔드포인트 | 가드 | 근거 |
|---|---|---|
| `POST   /admin/tenants` | `PlatformAdminGuard` | FR-5 |
| `GET    /admin/tenants` | `PlatformAdminGuard` | FR-5 (목록은 타 테넌트 존재를 노출) |
| `GET    /admin/tenants/:tenantId` | `TenantAdminGuard` | FR-1 |
| `PATCH  /admin/tenants/:tenantId` | `TenantAdminGuard` + 필드 제한 | FR-2, FR-3 |
| `POST   /admin/tenants/:tenantId/notify-test` | `TenantAdminGuard` | FR-4 |
| `DELETE /admin/tenants/:tenantId` | `PlatformAdminGuard` | FR-5 |

### 3.3 경로 파라미터명 통일: `:id` → `:tenantId`

`TenantAdminGuard` 는 테넌트 경계를 `request.params['tenantId']` 로 검사한다. 현재 이 컨트롤러는 `:id` 를 쓰므로 그대로 두면 가드가 파라미터를 찾지 못해 **모든 테넌트 관리자를 거부**한다.

가드 쪽에 `params['tenantId'] ?? params['id']` 같은 폴백을 넣는 방식은 택하지 않는다. `:id` 라는 이름은 컨트롤러마다 가리키는 대상이 달라(예: `external-auth` 의 `:id` 는 프로바이더 ID) 가드가 엉뚱한 값을 테넌트 경계로 오인할 여지를 남긴다.

대신 **이 컨트롤러의 경로 파라미터를 `:tenantId` 로 통일**한다. 다른 모든 테넌트 범위 컨트롤러와 동일한 규약이 되고, 가드의 검사 기준이 명시적이 된다. URL 형태(`/admin/tenants/{uuid}`)는 바뀌지 않으므로 프런트엔드·API 계약에 영향이 없다.

### 3.4 TENANT_ADMIN 의 수정 가능 필드 제한 — FR-3

`UpdateTenantDto` 는 `name`, `issuer`, `status`, `settings` 를 받는다. 이 중 `status`(테넌트 활성/비활성 생명주기)와 `issuer`(토큰 발급자 = 신뢰 경계)는 플랫폼 관리자 고유 권한이다.

컨트롤러 `update()` 에서 요청자 role 을 확인해 거부한다.

```ts
private assertUpdatableBy(admin: AdminJwtPayload | undefined, dto: UpdateTenantDto) {
  if (admin?.role === AdminRole.PLATFORM_ADMIN) return;

  const forbidden = (['status', 'issuer'] as const).filter((k) => dto[k] !== undefined);
  if (forbidden.length > 0) {
    throw new ForbiddenException(
      `Tenant admin cannot modify: ${forbidden.join(', ')}`,
    );
  }
}
```

- `undefined` 가 아닌 키만 위반으로 본다. `PATCH` 는 부분 수정이므로 미전송 필드는 `undefined` 다.
- 서비스가 아니라 컨트롤러에 두는 이유: 이것은 **호출자 권한**에 따른 판정이며, `TenantsService.update()` 는 호출자 개념이 없는 도메인 로직이다. 기존 `AuditContext` 패턴과 마찬가지로 요청자 정보는 컨트롤러가 해석한다.

### 3.5 모듈 의존성

`TenantsModule` 은 현재 `PlatformAdminGuard` 만 주입받는다. `TenantAdminGuard` 를 추가로 제공해야 한다. 두 가드 모두 `AdminJwtGuard` 에 의존한다.

`AdminModule` 의 export 구성을 확인해 그대로 재사용하고, 부족하면 `TenantAdminGuard` 를 export 에 추가한다.

## 4. API 계약 변경 요약

| 항목 | 변경 전 | 변경 후 |
|---|---|---|
| 권한 부족 응답 코드 | `401 Unauthorized` | `403 Forbidden` |
| 인증 실패 응답 코드 | `401 Unauthorized` | 동일 |
| `GET /admin/tenants/:id` 호출 주체 | PLATFORM_ADMIN | + 해당 테넌트 TENANT_ADMIN |
| `PATCH /admin/tenants/:id` 호출 주체 | PLATFORM_ADMIN | + 해당 테넌트 TENANT_ADMIN (`name`·`settings` 만) |
| `POST /admin/tenants/:id/notify-test` 호출 주체 | PLATFORM_ADMIN | + 해당 테넌트 TENANT_ADMIN |
| 요청 경로·본문·응답 본문 | — | 변경 없음 |

## 5. 보안 검토

- **테넌트 경계**: `TenantAdminGuard` 가 JWT 의 `tenantId` 와 경로 `:tenantId` 의 일치를 요구한다. 다른 테넌트 ID 로는 조회·수정 모두 403 (FR-6).
- **권한 상승 차단**: `status`·`issuer` 를 막아 테넌트 관리자가 자기 테넌트를 강제 활성화하거나 토큰 발급자를 바꿔 신뢰 경계를 흔드는 것을 방지한다.
- **정보 노출**: 테넌트 목록은 계속 플랫폼 전용이므로 타 테넌트의 존재가 드러나지 않는다.
- **401 → 403 전환의 영향**: 차단되던 요청이 통과하게 되는 변화는 없다. 상태 코드만 바뀐다. 오히려 "권한 부족으로 세션이 파기되는" 비의도적 동작이 제거된다.

## 6. 테스트 설계

### 6.1 가드 단위 테스트 — `apps/api/src/admin/guards/admin-guards.spec.ts` (신규)

| 케이스 | 기대 |
|---|---|
| `PlatformAdminGuard`, role=PLATFORM_ADMIN | 통과 |
| `PlatformAdminGuard`, role=TENANT_ADMIN | `ForbiddenException` |
| `TenantAdminGuard`, role=PLATFORM_ADMIN | 통과 (테넌트 무관) |
| `TenantAdminGuard`, TENANT_ADMIN + 일치하는 `:tenantId` | 통과 |
| `TenantAdminGuard`, TENANT_ADMIN + 다른 `:tenantId` | `ForbiddenException` |
| `TenantAdminGuard`, TENANT_ADMIN + `tenantId` 클레임 없음 | `ForbiddenException` |
| 인증 실패(`AdminJwtGuard` 가 던짐) | `UnauthorizedException` 전파 |

### 6.2 컨트롤러 단위 테스트 — `apps/api/src/tenants/tenants.controller.spec.ts` (신규)

가드는 `overrideGuard` 로 통과시키고, **필드 제한 로직**을 검증한다.

| 케이스 | 기대 |
|---|---|
| PLATFORM_ADMIN 이 `{ status }` 수정 | 서비스 호출됨 |
| PLATFORM_ADMIN 이 `{ issuer }` 수정 | 서비스 호출됨 |
| TENANT_ADMIN 이 `{ name, settings }` 수정 | 서비스 호출됨 |
| TENANT_ADMIN 이 `{ status }` 수정 | `ForbiddenException`, 서비스 미호출 |
| TENANT_ADMIN 이 `{ issuer }` 수정 | `ForbiddenException`, 서비스 미호출 |
| TENANT_ADMIN 이 `{ name, status }` 동시 수정 | `ForbiddenException`, 서비스 미호출 |
| `findOne` 응답에 `mailDevRedirectEditable` 플래그 유지 | 기존 동작 회귀 없음 |

## 7. 수동 검증 시나리오

1. TENANT_ADMIN 로그인 → `/admin/tenants/:tenantId/dashboard` 유지, 사이드바에 테넌트명 표시, 콘솔에 401 없음.
2. "테넌트 설정" 진입 → 값이 로드되고 이름·설정 저장 성공.
3. PLATFORM_ADMIN 로그인 → 테넌트 목록·생성·상세·삭제 기존과 동일.
