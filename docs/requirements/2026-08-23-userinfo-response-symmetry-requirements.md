# 요구사항정의서 — UserInfo 응답 계약 정합화 (GET/PATCH 비대칭 해소)

- 작성일: 2026-08-23
- 작성자: Jinho Lee
- 상태: 초안 (승인 대기)

## 1. 문제 정의

`GET /t/:tenantSlug/oauth/userinfo`와 `PATCH /t/:tenantSlug/oauth/userinfo`의 **응답 스키마가 서로 다르다.**

| 엔드포인트 | 현재 응답 | 프로필 필드 위치 | 로그인 ID |
|---|---|---|---|
| `GET` | `{ sub, tenant_id, email?, email_verified?, ...profileJsonb }` | **최상위 평탄화** | 반환하지 않음 |
| `PATCH` | `{ sub, loginId, profile }` | **`profile` 키 아래 중첩** | `loginId` |

### 1.1 원인

최초 설계는 대칭이었다. `PATCH`가 추가된 시점(`7ea7b8b`, 2026-04-19, [self-service-profile-update 계획서](../plans/2026-04-19-self-service-profile-update.md))에는 `GET`도 `claims['profile'] = profileJsonb` 형태의 중첩이었다.

비대칭은 12일 뒤 커밋 `ffa5d97`("사용자 정보에 tenant_id 추가 및 프로필 데이터 병합 개선", 2026-05-01)에서 발생했다. 이 커밋은 `GET`만 `Object.assign(claims, profile.profileJsonb)`로 평탄화하면서 **PATCH 핸들러·E2E 테스트·연동 가이드·웹 프런트엔드를 함께 갱신하지 않았다.** 요구사항정의서·설계서·계획서가 없는 단일 파일 5줄 커밋으로, 개발 프로세스 5단계를 거치지 않았다.

평탄화라는 **방향 자체는 옳았다.** OIDC Core 5.1은 UserInfo 표준 클레임(`name`, `email`, `preferred_username` 등)을 최상위에 두도록 규정하며, 하필 `profile`은 "프로필 페이지 URL"을 뜻하는 **예약된 표준 클레임 이름**이라 그 아래 객체를 중첩하는 원래 구조가 스펙 위반이었다. 문제는 방향이 아니라 파급 범위를 따라가지 않은 것이다.

### 1.2 현재 살아 있는 결함

| ID | 결함 | 위치 |
|---|---|---|
| D-1 | 셀프 프로필 수정 화면이 **기존 프로필 값을 불러오지 못하고 빈 폼으로 렌더**된다. `info.profile`이 GET 응답에 없어 항상 `{}`로 초기화된다. PATCH가 shallow merge이고 빈 값은 전송에서 제외되므로 데이터가 삭제되지는 않으나, 사용자는 자기 값을 확인·수정할 수 없다. | `apps/web/src/views/oauth/OAuthProfileView.vue:136` |
| D-2 | 같은 화면의 **로그인 ID 입력칸이 항상 비어 있다.** GET이 로그인 ID를 어떤 이름으로도 반환하지 않는다. | `apps/web/src/views/oauth/OAuthProfileView.vue:126` |
| D-3 | `UserinfoResponse` 타입이 GET 실제 응답에 없는 `profile?`/`loginId?`를 선언해, D-1·D-2가 타입 검사에서 걸러지지 않고 조용히 통과했다. | `apps/web/src/api/oauth.ts:30-35` |
| D-4 | 연동 가이드 8.1의 GET 응답 예시가 `"profile": { ... }` 중첩으로 남아 있어, 문서를 따른 외부 연동 개발자가 프로필 필드를 읽지 못한다. | `docs/guide/authori-integration-guide.md` §8.1 |
| D-5 | E2E 테스트가 PATCH만 덮고 **GET 응답 형태를 고정하는 테스트가 없다.** `ffa5d97`의 회귀가 잡히지 않은 근본 원인. | `apps/api/test/oauth-userinfo-patch.e2e-spec.ts` |

## 2. 목표

- UserInfo의 GET/PATCH **응답 계약을 하나로 통일**한다.
- 통일 기준은 **OIDC Core 준수 방향(최상위 평탄 클레임)** 으로 확정한다.
- 로그인 ID를 **표준 클레임 `preferred_username`** 으로 노출한다.
- D-1 ~ D-5를 모두 해소하고, 동일한 회귀가 재발하지 않도록 응답 형태를 테스트로 고정한다.

## 3. 확정된 설계 결정

| ID | 결정 | 근거 |
|---|---|---|
| DEC-1 | **PATCH 응답을 GET과 동일한 평탄 클레임 구조로 통일**한다. 기존 `loginId`·`profile` 키는 병행 반환 없이 제거한다. | 계약을 하나로 수렴시키고 OIDC 준수를 유지. 내부 소비자(웹)는 PATCH 응답 바디를 사용하지 않으므로 내부 영향 없음. |
| DEC-2 | 로그인 ID의 클레임명은 **`preferred_username`** 으로 한다. `loginId`는 응답 클레임으로 사용하지 않는다. | OIDC Core 5.1 표준 클레임이며 `profile` scope에 속한다. oidc-client-ts, next-auth 등 표준 클라이언트가 자동 인식한다. |
| DEC-3 | **PATCH 요청 바디의 키는 변경하지 않는다** (`{ loginId?, profile? }` 유지). | 요청은 부분 수정 대상을 명확히 표현해야 하고, `profile` 중첩이 그 의미에 맞다. 요청/응답 명칭 비대칭(`loginId` 쓰기 → `preferred_username` 읽기)은 OIDC 서버에서 통상적인 패턴이다. |

## 4. 기능 요구사항

| ID | 요구사항 |
|----|----------|
| FR-1 | GET·PATCH가 **동일한 클레임 빌더**를 통해 응답을 구성한다. 두 응답의 스키마는 동일해야 한다. |
| FR-2 | 응답 클레임은 다음과 같다.<br>· `sub`, `tenant_id` — 항상 포함<br>· `email`, `email_verified` — `email` scope<br>· `preferred_username` — `profile` scope<br>· 프로필 JSONB의 모든 키 — `profile` scope, 최상위 평탄화 |
| FR-3 | 프로필 JSONB에 `sub`, `tenant_id`, `email`, `email_verified`, `preferred_username`과 충돌하는 키가 있어도 **예약 클레임이 프로필 값에 덮이지 않는다.** 충돌 키는 응답에서 제외한다. |
| FR-4 | `profile:write` scope를 가진 토큰은 `profile` 읽기 권한을 함의한다. 즉 유효 scope 집합에 `profile:write`가 있으면 `profile`이 있는 것으로 취급한다. GET·PATCH 모두 동일 규칙을 적용한다. |
| FR-5 | PATCH는 수정 후 최신 상태를 반영한 클레임을 반환한다(현재와 동일). |
| FR-6 | 웹 프런트엔드 셀프 프로필 화면이 GET 응답에서 **프로필 기존 값과 로그인 ID를 정상적으로 불러와** 폼에 채운다 (D-1, D-2 해소). |
| FR-7 | `UserinfoResponse` 타입을 실제 응답 구조에 맞게 정정한다. 예약 클레임은 명시 필드로, 프로필 키는 인덱스 시그니처로 표현한다 (D-3 해소). |
| FR-8 | 연동 가이드 §8.1·§8.2의 응답 예시와 claim/scope 표를 실제 동작에 맞게 갱신하고, `preferred_username` 도입 및 PATCH 응답 변경을 **하위호환 파괴 변경으로 명시**한다 (D-4 해소). |
| FR-9 | GET 응답 형태를 고정하는 E2E 테스트를 추가한다. 최소 커버리지: scope 없음(`sub`/`tenant_id`만), `email` scope, `profile` scope(평탄화 + `preferred_username`), 예약 키 충돌(FR-3), `profile:write` 함의(FR-4) (D-5 해소). |
| FR-10 | PATCH E2E 테스트를 새 응답 스키마에 맞게 갱신한다. |

## 5. 비기능 요구사항

- **표준 준수**: 응답은 OIDC Core 5.1(UserInfo Response) 및 5.4(Scope별 클레임 매핑)를 따른다.
- **DB 변경 없음**: 엔티티·마이그레이션 변경은 발생하지 않는다. 응답 직렬화 계층만 수정한다.
- **성능**: 추가 DB 왕복을 만들지 않는다. `preferred_username`은 이미 조회하는 `User.loginId`에서 채운다.
- **회귀 방지**: 응답 스키마는 단정문으로 고정한다. 클레임 추가/변경은 테스트 실패로 드러나야 한다.
- **감사성**: 기존 `USER.UPDATED` / `actorType='user'` / `metadata.source='self_service'` 감사 기록 동작을 변경하지 않는다.

## 6. 하위호환 영향 (Breaking Changes)

| 대상 | 영향 | 완화 |
|---|---|---|
| PATCH 응답의 `profile` 중첩 키를 읽던 외부 연동 | 깨진다. 가이드 §8.2 예시를 따랐던 구현이 해당. | 가이드에 마이그레이션 안내 명시. 요청 바디는 그대로이므로 응답 파싱만 수정하면 된다. |
| PATCH 응답의 `loginId`를 읽던 외부 연동 | 깨진다. `preferred_username`으로 대체. | 동일. |
| GET 응답을 읽던 외부 연동 | **영향 없음.** 2026-05-01부터 이미 평탄화 상태이며 클레임이 추가될 뿐이다. | — |
| 웹 프런트엔드 | 이번 변경으로 오히려 정상화된다(D-1, D-2). | — |

이 변경은 API 응답 계약 변경이므로 릴리스 노트에 파괴 변경으로 기재한다.

## 7. 제외 범위 (Out of Scope)

- PATCH **요청** 바디 스키마 변경 (DEC-3).
- `id_token` 클레임 확장. 현재 `sub`/`nonce`/`email`/`email_verified`만 발급하며 이번 범위에서 건드리지 않는다.
- `name`, `given_name`, `family_name`, `picture` 등 다른 OIDC 표준 클레임의 자동 매핑. 프로필 스키마 키를 표준 클레임명으로 변환하는 기능은 별도 과제로 둔다.
- 프로필 스키마에 `organization`/`department` 등 기본 필드를 시드하는 작업.
- UserInfo 응답 서명(JWT 형태 UserInfo Response, OIDC Core 5.3.2).
- 구 응답 형태를 유지하는 버전 협상 헤더나 `?v=` 파라미터 도입.

## 8. 성공 기준

- GET과 PATCH가 동일 토큰·동일 사용자에 대해 **동일한 클레임 집합**을 반환한다.
- `profile` scope로 GET 하면 프로필 필드가 최상위에, `preferred_username`이 함께 내려온다.
- 프로필 JSONB에 `email` 키가 있어도 인증된 사용자의 실제 이메일이 덮이지 않는다.
- 셀프 프로필 수정 화면 진입 시 기존 프로필 값과 로그인 ID가 폼에 채워진다.
- 연동 가이드의 GET/PATCH 예시가 실제 응답과 일치한다.
- GET 응답 형태를 검증하는 E2E 테스트가 존재하고, 응답 스키마를 되돌리면 실패한다.
- `bun run lint && bun run typecheck && bun run test && bun run build` 통과.

## 9. 관련 문서

- 최초 PATCH 구현 계획: [docs/plans/2026-04-19-self-service-profile-update.md](../plans/2026-04-19-self-service-profile-update.md)
- 연동 가이드: [docs/guide/authori-integration-guide.md](../guide/authori-integration-guide.md) §8
- id_token 클레임 설계: [docs/specs/2026-06-02-id-token-nonce-email-verified.md](../specs/2026-06-02-id-token-nonce-email-verified.md)
- scope 시스템 설계: [docs/plans/2026-04-19-scope-system-design.md](../plans/2026-04-19-scope-system-design.md)
