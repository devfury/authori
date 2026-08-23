# 개발완료보고서 — UserInfo 응답 계약 정합화

- 작성일: 2026-08-23
- 작성자: Jinho Lee
- 브랜치: `fix/userinfo-response-symmetry` (기준 `origin/develop` = 124f8ee)
- 관련 문서: [요구사항정의서](../requirements/2026-08-23-userinfo-response-symmetry-requirements.md) · [개발설계서](../specs/2026-08-23-userinfo-response-symmetry-spec.md) · [개발계획서](../plans/2026-08-23-userinfo-response-symmetry-plan.md)

## 1. 구현 요약

`GET`/`PATCH /t/:tenantSlug/oauth/userinfo`의 응답 스키마가 서로 달랐던 문제를 해소했다. 두 핸들러가 공용 순수 빌더 `buildUserInfoClaims()`를 호출하므로 응답이 구조적으로 갈라질 수 없다.

**통일된 응답 계약**

| 클레임 | 필요 scope | 출처 |
|---|---|---|
| `sub`, `tenant_id` | 없음 | `users.id`, 테넌트 컨텍스트 |
| `email`, `email_verified` | `email` | `users.email`, `status === ACTIVE` |
| `preferred_username` | `profile` | `users.login_id` (null이면 생략) |
| 프로필 스키마의 모든 키 | `profile` | `user_profiles.profile_jsonb`, 최상위 평탄화 |

`profile:write`는 `profile` 읽기를 함의하며 함의는 단방향이다. `403 insufficient_scope` 판정은 유효 scope가 아닌 원본 scope로 한다.

**원인**: 최초 설계는 대칭이었다. `7ea7b8b`(2026-04-19)에서 PATCH가 추가될 때 GET도 중첩 구조였고, 12일 뒤 `ffa5d97`(2026-05-01)이 GET만 평탄화하면서 PATCH·테스트·문서·프런트엔드를 갱신하지 않아 비대칭이 남았다. 그 커밋은 요구사항·설계·계획 문서 없는 단일 파일 5줄 변경으로 개발 프로세스 5단계를 거치지 않았다.

## 2. 완료된 작업

| Task | 내용 | 커밋 |
|---|---|---|
| — | 요구사항정의서 | `284c71c` |
| — | 개발설계서·개발계획서 | `a21987f` |
| 1 | 순수 클레임 빌더 + 단위 테스트 14개 (TDD) | `4bcf335` |
| 2 | GET/PATCH가 빌더 공유, 응답 스키마 통일 | `a9077a0` |
| 3 | E2E에 GET 커버리지 추가, 파일명 정정 | `e7cffcd` |
| 4 | 웹 타입 정정 + 셀프 프로필 화면 수정 | `4ba3981` |
| 5 | 연동 가이드 §8 + 런북 3종 갱신 | `3645e20` |
| 6 | 전체 검증 + 본 보고서 | (본 커밋) |

### 결함 해소 결과

| ID | 결함 | 결과 |
|---|---|---|
| D-1 | 셀프 프로필 화면이 기존 프로필 값을 못 불러옴 | 해소 — `initProfileValues(schemaFields, info)` |
| D-2 | 로그인 ID 입력칸 항상 빈 값 | 해소 — GET이 `preferred_username` 반환, 화면이 이를 읽음 |
| D-3 | `UserinfoResponse` 타입이 실제 응답과 불일치 | 해소 — 예약 클레임 명시 + 인덱스 시그니처 |
| D-4 | 연동 가이드 §8.1 예시 오류 | 해소 — 평탄 예시로 교체, claim 표 보강 |
| D-5 | GET 응답 형태 고정 테스트 부재 | 해소 — 단위 14개 + E2E 6개 케이스 |

### 범위 중 추가로 처리한 보안 결함

`Object.assign(claims, profileJsonb)`는 프로필 값이 예약 클레임을 덮어썼다. `profile_jsonb`는 사용자가 `profile:write`로 직접 쓸 수 있으므로, 프로필에 `email`을 심으면 UserInfo가 위조된 이메일을 `email_verified: true`와 함께 반환했다. BFF 런북이 안내하는 JIT 프로비저닝은 정확히 `userinfo.email_verified == true`를 신뢰해 기존 계정에 연결하므로 계정 탈취로 이어질 수 있는 경로였다.

→ 예약 클레임과 충돌하는 프로필 키를 명시적으로 제외하도록 수정하고(FR-3), 단위·E2E 테스트로 고정했다. BFF 런북에 이 단계가 안전한 근거를 명시했다.

## 3. 검증 결과

실행 위치: `/Users/jinholee/Work/ezcloud/authori/.worktree/userinfo-response-symmetry`

| 명령 | 결과 |
|---|---|
| `bun run lint` | ❌ **실패 — 기존 baseline 오류. 신규 유입 없음** (아래 참조) |
| `bun run typecheck` | ✅ 통과 (api `tsc`, web `vue-tsc` 모두) |
| `bun run test` | ✅ 통과 — 18 suites / **148 tests**, 신규 `userinfo-claims.spec.ts` 14개 포함 |
| `bun run build` | ✅ 통과 (api `nest build`, web `vue-tsc -b && vite build`) |
| `bun run test:e2e` | ⚠️ **미실행** (아래 참조) |

### 3.1 lint 실패는 기존 baseline

`apps/api`의 `test/**` e2e 파일들이 `@typescript-eslint/no-unsafe-*` 규칙을 위반하고 있다. 동일 명령을 깨끗한 `origin/develop`에서 실행해 비교했다.

| 대상 | 오류 | 경고 |
|---|---|---|
| `origin/develop` (baseline) | 69 | 48 |
| `fix/userinfo-response-symmetry` | **67** | 55 |

**오류가 2건 줄었고 신규 오류는 0건이다.** E2E 단정에서 `res.body`(`any`)를 `claims()` 헬퍼로 좁힌 결과 해당 파일 오류가 3건 → 1건이 되었다. 경고 7건 증가는 추가한 테스트 케이스의 `app.getHttpServer()` 호출에서 나오며, 같은 파일의 기존 모든 테스트와 동일한 패턴이다. 경고는 lint 실패 조건이 아니다.

`bun run lint`는 develop에서도 실패하므로 이 저장소의 lint 파이프라인은 이미 red 상태다. 본 작업 범위 밖이므로 별도 과제로 남긴다.

### 3.2 E2E 미실행 사유

`bun run test:e2e`를 실행하지 않았다. 이 스위트는 시작 시 다음 쿼리를 수행한다.

```sql
UPDATE signing_keys SET status = 'RETIRED', retired_at = now()
WHERE tenant_id IS NULL AND status = 'ACTIVE'
```

즉 **전역 ACTIVE 서명 키를 폐기한 뒤 테스트 키를 새 ACTIVE 키로 심는다.** `.env`가 가리키는 대상은 공용 원격 개발 DB(`mavdevdb.ezcaretech.com` / `authori`)이며, `OAuthTokenVerifierService.verifyJwt()`는 활성 키만으로 검증하므로 실행하면 다른 개발자의 기발급 access token 검증이 전부 깨진다. 정리 로직도 없어 테스트 테넌트·사용자가 잔류한다.

대안을 검토했으나 모두 불가했다.

- 로컬 postgres(`localhost:5432`)는 떠 있으나 사용 가능한 자격증명이 없다(`postgres`/`authori`/OS 사용자 모두 인증 실패).
- docker 미가동으로 일회용 컨테이너 DB를 띄울 수 없다.
- `synchronize: false`이므로 새 DB에는 마이그레이션 선행 실행이 필요하다.

**대체 검증**: 응답 계약 자체는 DB가 필요 없는 단위 테스트 14개가 고정하며 `bun run test`에서 항상 실행된다(원 회귀가 잡히지 않은 이유가 "계약 검증이 DB 필요한 e2e에만 있었다"는 것이었으므로, 이 배치가 구조적 개선이다). E2E 파일은 `tsc -p tsconfig.json`과 eslint로 컴파일 가능성을 확인했다.

**후속 조치 필요**: 일회용 DB가 준비되면 `cd apps/api && bun run test:e2e -- oauth-userinfo`를 실행해야 한다.

### 3.3 예약 키 충돌 사전 점검

계획서 리스크 항목에 따라 병합 전 읽기 전용으로 확인했다(개발 DB).

```sql
-- user_profiles.profile_jsonb 에 예약 키가 있는 행
SELECT k, count(*) FROM user_profiles up, jsonb_object_keys(up.profile_jsonb) k
WHERE k IN ('sub','tenant_id','email','email_verified','preferred_username') GROUP BY k;
→ 0 rows

-- profile_schema_versions 에 예약 키를 정의한 스키마
SELECT v.tenant_id, v.version, v.status, k
FROM profile_schema_versions v, jsonb_object_keys(v.schema_jsonb->'properties') k
WHERE k IN ('sub','tenant_id','email','email_verified','preferred_username');
→ 0 rows
```

개발 DB에는 충돌 사례가 없어 필드가 사라지는 테넌트는 없다. **운영 DB는 미점검이다** — 운영 접속을 임의로 수행하지 않았다. 배포 전 같은 쿼리를 운영에서 실행하는 것을 권한다.

## 4. 하위호환 영향

| 대상 | 영향 |
|---|---|
| PATCH 응답의 `profile` 중첩을 읽던 외부 연동 | **깨진다.** `res.profile.department` → `res.department` |
| PATCH 응답의 `loginId`를 읽던 외부 연동 | **깨진다.** `res.loginId` → `res.preferred_username` |
| PATCH **요청** 바디 | 변경 없음 (`{ profile, loginId }` 유지) |
| GET 응답을 읽던 외부 연동 | 영향 없음 — 2026-05-01부터 이미 평탄이고 클레임만 추가됨 |
| 웹 프런트엔드 | 정상화 (D-1, D-2) |
| DB 스키마 | 변경 없음, 마이그레이션 없음 |

연동 가이드 §8.2에 파괴 변경 경고와 마이그레이션 표를 넣었다.

## 5. 남은 리스크 및 후속 작업

| 항목 | 비고 |
|---|---|
| E2E 미실행 | 일회용 DB 확보 후 실행 필요 (§3.2) |
| 운영 DB 예약 키 점검 | 배포 전 §3.3 쿼리 실행 권장 |
| `apps/api` lint baseline red | develop에서도 실패하는 기존 상태. 별도 과제 |
| 프로필 스키마 예약 키 차단 | 스키마 저장 시 `sub`/`email` 등 사용을 경고·거부하는 기능 미구현 |
| OIDC 표준 클레임 매핑 | `name`, `given_name`, `picture` 등을 프로필 키에서 자동 매핑하는 기능 없음 |
| ADR 부재 | UserInfo 응답 계약은 되돌리기 어려운 결정이나 `docs/adr/`이 아직 없어 설계서에만 기록됨 |
| 버전 범프 | `1.3.8` 유지. 릴리스 담당자가 파괴 변경을 반영해 결정 |
