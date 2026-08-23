# 개발설계서 — UserInfo 응답 계약 정합화

- 작성일: 2026-08-23
- 작성자: Jinho Lee
- 상태: 초안 (승인 대기)
- 관련 요구사항: [2026-08-23-userinfo-response-symmetry-requirements.md](../requirements/2026-08-23-userinfo-response-symmetry-requirements.md)

## 1. 범위

`GET`/`PATCH /t/:tenantSlug/oauth/userinfo` 두 엔드포인트의 **응답 직렬화 계층만** 변경한다. 인증·인가·감사·DB 스키마는 손대지 않는다.

**비범위**: PATCH 요청 바디 스키마, `id_token` 클레임, OIDC 표준 클레임 자동 매핑, UserInfo 응답 서명, 응답 버전 협상.

## 2. 응답 계약 (확정)

GET·PATCH가 반환하는 단일 스키마.

| 클레임 | 타입 | 필요 scope | 출처 | 생략 조건 |
|---|---|---|---|---|
| `sub` | string(uuid) | 없음 | `users.id` | 없음 |
| `tenant_id` | string(uuid) | 없음 | `TenantContext.tenantId` | 없음 |
| `email` | string | `email` | `users.email` | scope 없음 |
| `email_verified` | boolean | `email` | `users.status === ACTIVE` | scope 없음 |
| `preferred_username` | string | `profile` | `users.login_id` | scope 없음, 또는 값이 `null` |
| (프로필 스키마의 모든 키) | any | `profile` | `user_profiles.profile_jsonb` | scope 없음, 프로필 행 없음, 예약 클레임과 키 충돌 |

### 2.1 예시

```jsonc
// GET /t/acme/oauth/userinfo   (scope = openid email profile)
{
  "sub": "8f3c…",
  "tenant_id": "1a2b…",
  "email": "user@example.com",
  "email_verified": true,
  "preferred_username": "johnny",
  "department": "내과",
  "organization": "본원"
}
```

```jsonc
// PATCH /t/acme/oauth/userinfo   요청 바디는 변경 없음
// { "profile": { "department": "외과" }, "loginId": "johnny2" }
// → 응답은 GET과 동일 스키마, 수정 반영된 최신 값
{
  "sub": "8f3c…",
  "tenant_id": "1a2b…",
  "preferred_username": "johnny2",
  "department": "외과",
  "organization": "본원"
}
```

### 2.2 유효 scope 규칙 (FR-4)

```
effective = scopes ∪ ({'profile'} if 'profile:write' ∈ scopes else ∅)
```

`profile:write`는 프로필 필드에 대한 쓰기 권한이므로 되읽기를 함의한다. GET·PATCH에 동일 적용한다. PATCH는 `profile:write`를 필수로 요구하므로 결과적으로 **PATCH 응답에는 항상 프로필 클레임과 `preferred_username`이 포함**된다.

### 2.3 예약 클레임 보호 (FR-3)

```
RESERVED = { sub, tenant_id, email, email_verified, preferred_username }
```

`profile_jsonb`는 관리자·사용자가 자유롭게 값을 넣는 JSONB다. 현재 `Object.assign(claims, profileJsonb)`는 **프로필 값이 실제 인증 정보를 덮어쓴다.** 즉 프로필에 `"email": "admin@victim.com"`을 심으면 UserInfo가 위조된 이메일을 반환하고, 이를 신뢰해 JIT 프로비저닝하는 연동(런북 `mobile-bff-confidential-client-integration.md` §JIT 참조)에서 계정 탈취로 이어질 수 있다.

→ **예약 클레임을 항상 우선하고, 충돌하는 프로필 키는 응답에서 제외한다.** 병합 순서를 바꾸는 방식(프로필 먼저, 예약 나중)이 아니라 명시적 필터로 구현해 의도를 코드에 남긴다.

## 3. 백엔드 설계

### 3.1 신규: `apps/api/src/oauth/userinfo/userinfo-claims.ts`

컨트롤러에서 클레임 조립을 분리한 **순수 모듈**. NestJS 의존성이 없어 DB 없이 단위 테스트할 수 있다 — 현재 GET 회귀가 잡히지 않은 원인이 "DB가 필요한 e2e에만 의존"이었으므로, 계약 고정 테스트는 `bun run test`(jest `rootDir: src`)에서 항상 돌아야 한다.

```ts
export const RESERVED_USERINFO_CLAIMS = [
  'sub',
  'tenant_id',
  'email',
  'email_verified',
  'preferred_username',
] as const;

export interface UserInfoClaimSource {
  user: User;
  profile: UserProfile | null;
  tenantId: string;
  scopes: Iterable<string>;
}

/** profile:write 는 profile 읽기를 함의한다. */
export function resolveEffectiveScopes(scopes: Iterable<string>): Set<string>;

/** GET/PATCH 가 공유하는 단일 클레임 빌더. */
export function buildUserInfoClaims(source: UserInfoClaimSource): Record<string, unknown>;
```

동작:

1. `sub`, `tenant_id`를 넣는다.
2. `effective.has('email')`이면 `email`, `email_verified`(= `status === UserStatus.ACTIVE`).
3. `effective.has('profile')`이면
   - `user.loginId`가 non-null일 때 `preferred_username`,
   - `profile?.profileJsonb`의 키 중 `RESERVED_USERINFO_CLAIMS`에 없는 것만 복사.

### 3.2 변경: `userinfo.controller.ts`

| 위치 | 현재 | 변경 후 |
|---|---|---|
| `userinfo()` (GET) | 인라인 claims 조립 + `Object.assign` | `buildUserInfoClaims({ user, profile, tenantId, scopes })` 반환 |
| `updateUserinfo()` (PATCH) | `{ sub, loginId, profile }` 반환 | 동일 빌더로 반환 |
| `verifyAccessToken()` | 그대로 | 그대로 (`scopes: Set<string>` 반환 유지) |

PATCH의 `profile:write` 검사(`403 insufficient_scope`)는 **유효 scope가 아니라 원본 scope 집합**으로 판정한다. `profile:write` → `profile` 함의는 단방향이며 그 역이 성립하면 안 된다.

PATCH는 `updateSelf()`가 반환한 `User`와, 저장 후 재조회한 `UserProfile`을 빌더에 넘긴다(현재 재조회 로직 유지 — `manager.save(User, …)` 반환값에 profile 관계가 실려 있다고 가정하지 않는다).

### 3.3 변경 없는 것

- `UsersService.updateSelf()` — 시그니처·반환형·감사 기록 동작 유지.
- `SelfUpdateUserDto` — `{ loginId?, profile? }` 유지 (DEC-3).
- `OAuthTokenVerifierService` — 유지.
- 엔티티·마이그레이션 — 없음.

## 4. 프런트엔드 설계

### 4.1 `apps/web/src/api/oauth.ts`

```ts
export interface UserinfoResponse {
  sub: string
  tenant_id: string
  email?: string
  email_verified?: boolean
  preferred_username?: string
  /** 테넌트 프로필 스키마에 정의된 키들이 최상위로 평탄화되어 들어온다. */
  [claim: string]: unknown
}
```

`profile?`·`loginId?` 필드를 제거한다. 이 잘못된 선언이 D-1·D-2를 타입 검사에서 숨긴 원인이므로, 제거 자체가 회귀 방지 장치다. `UpdateUserinfoPayload`는 변경하지 않는다.

### 4.2 `apps/web/src/views/oauth/OAuthProfileView.vue`

| 라인 | 현재 | 변경 후 |
|---|---|---|
| 126 | `loginId.value = info.loginId ?? ''` | `loginId.value = info.preferred_username ?? ''` |
| 136 | `initProfileValues(schemaFields.value, info.profile ?? {})` | `initProfileValues(schemaFields.value, info)` |

`initProfileValues()`는 `schemaFields`에 있는 키만 골라 읽으므로(`OAuthProfileView.vue:83-97`) 평탄화된 claims 객체를 그대로 넘겨도 예약 클레임이 폼에 유입되지 않는다. `submit()`은 `builtProfile`(스키마 키만 수집)을 보내므로 요청 경로도 영향이 없다.

## 5. 테스트 설계

| 레벨 | 파일 | 커버리지 |
|---|---|---|
| 단위 | `apps/api/src/oauth/userinfo/userinfo-claims.spec.ts` (신규) | scope 없음 → `sub`/`tenant_id`만 · `email` scope · `profile` scope 평탄화 + `preferred_username` · `loginId=null` 시 `preferred_username` 생략 · 프로필 행 없음 · **예약 키 충돌 시 프로필 값이 무시됨** · `profile:write` 함의 |
| E2E | `apps/api/test/oauth-userinfo.e2e-spec.ts` (기존 `oauth-userinfo-patch.e2e-spec.ts` 리네임) | 기존 PATCH 4개 케이스 유지 + 응답 단정을 새 스키마로 갱신 · GET 401 · GET `profile` scope 평탄화 · GET/PATCH 응답 키 집합 동일성 |

단위 테스트는 `bun run test`에 포함되어 DB 없이 실행된다. E2E는 `bun run test:e2e`로 DB가 있는 환경에서 실행한다.

## 6. 문서 변경

| 파일 | 변경 |
|---|---|
| `docs/guide/authori-integration-guide.md` §8.1 | 중첩 예시 → 평탄 예시, claim/scope 표에 `tenant_id`·`email_verified`·`preferred_username` 추가 |
| 같은 문서 §8.2 | PATCH 응답 예시를 새 스키마로 교체, **파괴 변경 경고 블록 추가**(`profile` 중첩·`loginId`를 읽던 연동은 수정 필요) |
| `docs/runbooks/spa-public-client-integration.md` | 클레임 표에 `preferred_username` 행 추가 (본문 예시는 이미 평탄 — 정확) |
| `docs/runbooks/mobile-public-client-integration.md` | 동일 |
| `docs/runbooks/mobile-bff-confidential-client-integration.md` | 동일 |

## 7. 보안·성능·운영

- **보안(개선)**: §2.3로 프로필 JSONB를 통한 예약 클레임 위조 경로가 차단된다. 특히 `email`/`email_verified`를 신뢰하는 JIT 프로비저닝 연동의 계정 탈취 벡터가 닫힌다.
- **성능**: 추가 쿼리 없음. `preferred_username`은 이미 조회하는 `User.loginId`에서 채운다.
- **가용성**: 응답 직렬화만 변경되므로 무중단 배포 가능. DB 마이그레이션 없음.
- **감사**: `USER.UPDATED` / `actorType='user'` / `metadata.source='self_service'` 유지.

## 8. 알려진 제약

테넌트 프로필 스키마가 `email`, `sub` 등 예약 클레임과 같은 키를 정의하면 그 필드는 UserInfo 응답에서 제외되고, 셀프 프로필 화면에서도 기존 값이 채워지지 않는다. 보안이 우선이므로 이 동작을 의도된 것으로 확정하고 가이드에 명시한다. 스키마 저장 시 예약 키 사용을 경고·차단하는 기능은 별도 과제로 둔다.

## 9. 대안과 채택 근거

| 대안 | 채택 여부 | 근거 |
|---|---|---|
| GET을 중첩으로 되돌려 PATCH에 맞춤 | ✗ | OIDC Core 5.1 위반 상태로 회귀하고, 예약 클레임명 `profile`을 계속 오용한다. 이미 2026-05-01부터 평탄 응답이 외부에 나가 있어 GET 소비자를 새로 깨뜨린다. |
| PATCH에 구 키(`profile`, `loginId`)를 deprecated로 병행 반환 | ✗ | 응답에 중복 데이터가 남고 제거 시점을 따로 관리해야 한다. 내부 소비자가 PATCH 응답 바디를 쓰지 않아(`OAuthProfileView.vue:199`) 병행의 실익이 작다. |
| 로그인 ID를 `loginId`로 노출 | ✗ | 비표준 클레임이라 표준 OIDC 클라이언트가 자동 매핑하지 않는다. |
| 클레임 조립을 컨트롤러에 인라인 유지 | ✗ | DB 없는 단위 테스트가 불가능해 `bun run test`에서 계약을 고정할 수 없다. 이것이 원 회귀의 근본 원인이다. |
| 예약 클레임을 프로필보다 나중에 병합해 덮어쓰기 방지 | ✗ | 결과는 같지만 의도가 코드에 드러나지 않아 다음 리팩터링에서 다시 뒤집힐 수 있다. 명시적 필터를 택한다. |
