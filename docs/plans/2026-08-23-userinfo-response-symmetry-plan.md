# 개발계획서 — UserInfo 응답 계약 정합화

- 작성일: 2026-08-23
- 작성자: Jinho Lee
- 브랜치: `fix/userinfo-response-symmetry` (기준 `origin/develop` = 124f8ee)
- 관련 문서: [요구사항정의서](../requirements/2026-08-23-userinfo-response-symmetry-requirements.md) · [개발설계서](../specs/2026-08-23-userinfo-response-symmetry-spec.md)

## Goal

`GET`/`PATCH /t/:tenantSlug/oauth/userinfo`의 응답을 **하나의 평탄 클레임 스키마로 통일**하고, 그 비대칭이 만든 결함 5건(D-1 ~ D-5)을 해소한다. 로그인 ID는 OIDC 표준 클레임 `preferred_username`으로 노출하고, 프로필 JSONB가 예약 클레임을 덮어쓰던 경로를 차단한다. 응답 스키마는 DB 없이 실행되는 단위 테스트로 고정해 동일 회귀를 막는다.

## 변경 파일 목록

**신규**

- `apps/api/src/oauth/userinfo/userinfo-claims.ts` — 순수 클레임 빌더
- `apps/api/src/oauth/userinfo/userinfo-claims.spec.ts` — 응답 계약 단위 테스트

**수정**

- `apps/api/src/oauth/userinfo/userinfo.controller.ts` — GET/PATCH가 빌더 공유
- `apps/web/src/api/oauth.ts` — `UserinfoResponse` 정정
- `apps/web/src/views/oauth/OAuthProfileView.vue` — 126, 136행
- `docs/guide/authori-integration-guide.md` — §8.1, §8.2
- `docs/runbooks/spa-public-client-integration.md` — 클레임 표
- `docs/runbooks/mobile-public-client-integration.md` — 클레임 표
- `docs/runbooks/mobile-bff-confidential-client-integration.md` — 클레임 표

**리네임**

- `apps/api/test/oauth-userinfo-patch.e2e-spec.ts` → `apps/api/test/oauth-userinfo.e2e-spec.ts` (GET까지 덮으므로 이름 정정)

## 작업 단계

### Task 1 — 클레임 빌더와 단위 테스트 (TDD)

- [x] `userinfo-claims.spec.ts` 작성: scope 없음 / `email` / `profile` 평탄화 + `preferred_username` / `loginId=null` 생략 / 프로필 행 없음 / **예약 키 충돌 시 프로필 값 무시** / `profile:write` → `profile` 함의
- [x] `userinfo-claims.ts` 구현: `RESERVED_USERINFO_CLAIMS`, `resolveEffectiveScopes()`, `buildUserInfoClaims()`
- [x] 검증: `cd apps/api && bun run test -- userinfo-claims`
  - 기대: 신규 테스트 전부 통과

### Task 2 — 컨트롤러가 빌더 공유

- [x] `userinfo.controller.ts` GET을 `buildUserInfoClaims()` 호출로 교체
- [x] PATCH 반환을 `{ sub, loginId, profile }` → 동일 빌더 호출로 교체
- [x] `profile:write` 403 판정은 **원본 scope**로 유지 (함의는 단방향)
- [x] 검증: `cd apps/api && bun run typecheck && bun run test`
  - 기대: 타입 오류 없음, 기존 단위 테스트 회귀 없음

### Task 3 — E2E 갱신

- [x] `oauth-userinfo-patch.e2e-spec.ts` → `oauth-userinfo.e2e-spec.ts` 리네임, `describe` 제목 정정
- [x] 기존 PATCH 단정 갱신: `res.body.profile` → 평탄 키, `res.body.loginId` → `res.body.preferred_username`
- [x] GET 케이스 추가: Bearer 없음 401 · `profile` scope 평탄화 + `preferred_username` · GET/PATCH 응답 키 집합 동일성
- [ ] 검증: `cd apps/api && bun run test:e2e -- oauth-userinfo` — **미실행**
  - `.env`의 대상 DB가 공용 원격 개발 DB(`mavdevdb.ezcaretech.com`)이고, 이 스위트는 `signing_keys`의 전역 ACTIVE 키를 RETIRED로 바꾼 뒤 테스트 키를 ACTIVE로 심는다. 공용 DB에서 실행하면 다른 개발자의 기발급 토큰 검증이 깨진다.
  - 로컬 postgres(5432)는 떠 있으나 자격증명이 없고 docker도 사용 불가여서 임시 DB를 만들 수 없었다.
  - 대안 검증: 타입 체크(`tsc -p tsconfig.json`)와 eslint로 컴파일 가능성을 확인했고, 응답 계약은 Task 1의 단위 테스트 14개가 고정한다. 개발완료보고서에 미실행 사실을 명시한다.

### Task 4 — 프런트엔드 정정 (D-1, D-2, D-3)

- [x] `apps/web/src/api/oauth.ts`의 `UserinfoResponse`에서 `profile?`/`loginId?` 제거, 예약 클레임 명시 + 인덱스 시그니처 추가
- [x] `OAuthProfileView.vue:126` → `info.preferred_username ?? ''`
- [x] `OAuthProfileView.vue:136` → `initProfileValues(schemaFields.value, info)`
- [x] 검증: `cd apps/web && bun run build`
  - 기대: 타입 오류 없이 빌드 성공 (제거한 필드를 참조하는 코드가 남아 있으면 여기서 실패해야 정상)

### Task 5 — 문서 갱신 (D-4)

- [x] 연동 가이드 §8.1: 응답 예시 평탄화, claim/scope 표에 `tenant_id`·`email_verified`·`preferred_username` 추가
- [x] 연동 가이드 §8.2: PATCH 응답 예시 교체 + 파괴 변경 경고 블록
- [x] 연동 가이드에 예약 클레임 충돌 시 프로필 키가 제외된다는 제약 명시
- [x] 런북 3종 클레임 표에 `preferred_username` 행 추가
- [x] 검증: 문서 내 GET/PATCH 예시가 Task 1 단위 테스트의 기대값과 일치하는지 대조

### Task 6 — 전체 검증 및 마무리

- [x] 루트에서 `bun run lint` — 실패(기존 baseline). 오류 69→67, 신규 유입 0건
- [x] 루트에서 `bun run typecheck`
- [x] 루트에서 `bun run test` — 18 suites / 148 tests 통과
- [x] 루트에서 `bun run build`
- [x] 개발완료보고서 작성: `docs/reviews/2026-08-23-userinfo-response-symmetry-review.md`
- [ ] 브랜치 push → `origin/develop` 병합 → push
- [ ] ezaria 개인 채널 알림 발송

## 검증 명령과 기대 결과

| 명령 | 기대 |
|---|---|
| `bun run lint` | 신규 위반 0건 |
| `bun run typecheck` | 오류 0건 |
| `bun run test` | 전체 통과. `userinfo-claims.spec.ts` 신규 케이스 포함 |
| `bun run build` | api·web 모두 성공 |
| `bun run test:e2e` (apps/api, DB 필요) | `oauth-userinfo.e2e-spec.ts` 통과 |

기존 저장소 baseline 오류가 있으면 신규 유입이 아님을 확인하고 개발완료보고서에 명시한다.

## 리스크

| 리스크 | 영향 | 대응 |
|---|---|---|
| PATCH 응답의 `profile`/`loginId`를 읽던 **외부 연동이 깨진다** | 중 | 의도된 파괴 변경(DEC-1). 가이드 §8.2에 경고와 마이그레이션 안내를 넣고 알림 메시지에도 명시한다. 요청 바디는 불변이라 응답 파싱만 고치면 된다. |
| 프로필 스키마가 예약 클레임과 같은 키를 쓰는 테넌트가 이미 있으면 해당 필드가 응답에서 사라진다 | 중 | 보안 우선으로 의도된 동작(설계서 §8). 병합 전 운영 DB에서 `profile_jsonb`에 예약 키를 가진 테넌트가 있는지 확인하고, 있으면 병합을 보류하고 사용자 판단을 요청한다. |
| `profile:write` → `profile` 함의가 의도보다 넓게 읽힌다 | 하 | 함의는 단방향이며 403 판정은 원본 scope로 한다. 단위 테스트로 양방향 아님을 고정한다. |
| E2E를 DB 없이 실행 못 해 통합 경로가 미검증으로 남는다 | 하 | 계약 고정은 DB 불필요한 단위 테스트가 담당한다. E2E 미실행 시 그 사실을 개발완료보고서에 그대로 기록한다. |
| `UserinfoResponse` 인덱스 시그니처가 다른 호출부의 타입 안전성을 낮춘다 | 하 | 호출부는 `OAuthProfileView.vue` 한 곳뿐(전수 grep 확인). 예약 클레임은 명시 필드로 남겨 오타를 잡는다. |

## 후속 과제 (이번 범위 외)

- 프로필 스키마 저장 시 예약 클레임 키 사용을 경고·차단
- `name`, `given_name`, `picture` 등 OIDC 표준 클레임으로의 프로필 키 매핑 기능
- UserInfo 응답 계약을 되돌리기 어려운 결정으로 ADR화 (`docs/adr/` 신설 시점에 함께)
