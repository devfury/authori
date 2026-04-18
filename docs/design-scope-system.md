# OAuth2 Scope 시스템 개선 계획

## 현황 및 문제점

현재 authori의 scope 구현은 클라이언트별 `allowed_scopes` 컬럼(text[])에 임의 문자열을 저장하는 방식입니다.
의미 있는 표준 스코프는 `openid`, `profile`, `email` 세 개이며, scope는 UserInfo claims 필터링에만 쓰이고
실제 API 엔드포인트 접근 제어에는 활용되지 않습니다.

### 보안 이슈

- `POST /t/:tenantSlug/oauth/authorize`의 `grantedScopes`가 `pending.scopes`의 부분집합인지 검증하지 않음
  - 위치: `authorize.service.ts:307`
  - API를 직접 호출하는 클라이언트가 요청하지 않은 scope를 `grantedScopes`에 넣어 과다 부여 가능

### 기능 미구현

- 리소스 서버 API에서 scope 검증 불가 (Guard/데코레이터 없음)
- 동의 화면에서 scope 설명 표시 불가 (scope 메타데이터 없음)
- Discovery 문서의 `scopes_supported`가 하드코딩되어 실제 등록된 scope와 불일치 가능

---

## 구현 계획

### 1단계: 보안 버그 수정 (즉시)

**파일**: `backend/src/oauth/authorize/authorize.service.ts`

`grantedScopes`가 있을 때 반드시 `pending.scopes`의 부분집합인지 검증 추가.

```ts
// authorize.service.ts ~307 근처
const grantedScopes = dto.grantedScopes ?? pending.scopes;

// 추가할 검증
if (dto.grantedScopes) {
  const overGranted = dto.grantedScopes.filter(s => !pending.scopes.includes(s));
  if (overGranted.length > 0) {
    throw new BadRequestException(`invalid_scope: ${overGranted.join(', ')}`);
  }
}
```

---

### 2단계: ScopeGuard + @RequireScopes 데코레이터

리소스 서버(또는 authori 내부 API)에서 scope 기반 접근 제어를 가능하게 합니다.

**새 파일**: `backend/src/common/guards/scope.guard.ts`

```ts
@Injectable()
export class ScopeGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>('scopes', [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = ctx.switchToHttp().getRequest();
    const tokenScopes: string[] = (request.accessToken?.scope ?? '').split(' ');
    return required.every(s => tokenScopes.includes(s));
  }
}
```

**새 파일**: `backend/src/common/decorators/require-scopes.decorator.ts`

```ts
export const RequireScopes = (...scopes: string[]) =>
  SetMetadata('scopes', scopes);
```

**사용 예시**:
```ts
@Get('profile')
@UseGuards(AccessTokenGuard, ScopeGuard)
@RequireScopes('profile')
getProfile() { ... }
```

---

### 3단계: TenantScope 엔티티 (scope 메타데이터 관리)

scope를 1급 엔티티로 관리하여 동의 화면 표시, scope 유효성 검증에 활용합니다.

**새 엔티티**: `backend/src/database/entities/tenant-scope.entity.ts`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | uuid | PK |
| `tenantId` | uuid | FK → tenants |
| `name` | varchar | 스코프 식별자 (예: `read:orders`) |
| `displayName` | varchar | 동의 화면 표시명 (예: `주문 내역 조회`) |
| `description` | text | 상세 설명 |
| `isDefault` | boolean | 항상 포함되는 스코프 여부 |
| `createdAt` | timestamp | — |

**마이그레이션**: `CreateTenantScopeTable`

**연관 변경사항**:
- `authorize.service.ts`: `allowedScopes` 검증 시 `TenantScope` 테이블 기준으로 확인
- `authorize.service.ts`: 인가 응답에 scope `displayName`, `description` 포함 → 동의 화면에서 활용
- 시스템 기본 스코프(`openid`, `profile`, `email`)는 테넌트 생성 시 자동 seed

---

### 4단계: Discovery 문서 동기화

**파일**: `backend/src/oauth/discovery/discovery.controller.ts`

현재 하드코딩된 `scopes_supported: ['openid', 'profile', 'email']`을 `TenantScope` 테이블에서 읽도록 변경.

```ts
// 변경 전
scopes_supported: ['openid', 'profile', 'email']

// 변경 후
scopes_supported: await this.scopeService.getSupportedScopes(tenantId)
```

---

## 우선순위 요약

| 순서 | 작업 | 중요도 | 예상 공수 |
|---|---|---|---|
| 1 | `grantedScopes` 부분집합 검증 | 보안 | 소 |
| 2 | `ScopeGuard` + `@RequireScopes` | 기능 | 소~중 |
| 3 | `TenantScope` 엔티티 + 마이그레이션 | 기능 | 중 |
| 4 | Discovery 동기화 | 스펙 준수 | 소 |

## 관련 파일

- `backend/src/oauth/authorize/authorize.service.ts`
- `backend/src/oauth/token/token.service.ts`
- `backend/src/oauth/discovery/discovery.controller.ts`
- `backend/src/oauth/clients/dto/create-client.dto.ts`
- `backend/src/database/entities/oauth-client.entity.ts`
