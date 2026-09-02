# 개발완료보고서 — 프로필 null 값 저장·노출 차단

- 작성일: 2026-09-02
- 작성자: Jinho Lee
- 브랜치: `fix/userinfo-null-claim`
- 관련 문서: [요구사항정의서](../requirements/2026-09-02-profile-null-value-requirements.md) · [개발설계서](../specs/2026-09-02-profile-null-value-spec.md) · [개발계획서](../plans/2026-09-02-profile-null-value-plan.md)

## 1. 구현 요약

`user_profiles.profile_jsonb` 에 **"값 없음은 키 부재로만 표현한다"** 는 불변식을 세우고, 읽기·쓰기 경계 양쪽에서 강제했다.

| 경계 | 파일 | 변경 |
|---|---|---|
| 공용 규칙 | `common/profile/profile-value.util.ts` (신규) | `omitNullValues()` — `null`/`undefined` 키 제거. `false`·`0`·`''` 는 보존 |
| 읽기 (UserInfo) | `oauth/userinfo/userinfo-claims.ts` | 값이 `null`/`undefined` 인 프로필 항목을 클레임에서 생략 |
| 쓰기 (외부 인증) | `external-auth/external-auth.service.ts` | `applyFieldMapping()` 의 매핑 지정·미지정 두 경로 모두 `null` 제외 |
| 쓰기 (사용자 API) | `users/users.service.ts` | `create()` 는 `null` 미저장, `update()`/`updateSelf()` 는 병합 결과에 적용해 `null` = 키 삭제 |
| 기존 데이터 | `database/migrations/1781200000000-StripNullProfileValues.ts` (신규) | 저장된 `null` 값 항목 제거 (멱등) |
| 문서 | `CLAUDE.md` | 불변식과 강제 지점 기술 |

호출 위치로 두 semantics 를 표현한 것이 설계의 핵심이다(DEC-4).

- `{ ...기존, ...omitNullValues(패치) }` → 상류의 `null` 무시, 기존 값 보존 (외부 인증 동기화)
- `omitNullValues({ ...기존, ...패치 })` → 요청의 `null` 로 키 삭제 (사용자 API)

## 2. 완료된 작업

- [x] T1 — `omitNullValues()` 유틸 및 단위 테스트 (`3402557`)
- [x] T2 — UserInfo 가 값 없는 클레임 생략 + 테스트 (`f90b770`)
- [x] T3 — 외부 인증 필드 매핑에서 `null` 제외 + 테스트 (`f11a58a`)
- [x] T4 — 사용자 API 저장 경로 `null` 제거 + 테스트 (`aa4955d`)
- [x] T5·T6 — 데이터 정리 마이그레이션 · CLAUDE.md 불변식 (`be6f67f`)
- [x] T7 — 4단계 검증
- [x] T8 — 본 보고서 · develop 병합 · 알림

## 3. 검증 결과

| 명령 | 결과 |
|---|---|
| `bun run lint` | **신규 유입 0건.** 브랜치 `122 problems (67 errors, 55 warnings)` — develop baseline 과 **문제 수·파일 목록이 완전히 동일**함을 diff 로 확인했다(기존 저장소 baseline). |
| `bun run typecheck` | 통과 (api·web 2/2) |
| `bun run test` | 통과 — api 24 suites / **215 tests**, web 5 files / 10 tests. 신규 테스트 19건 포함 |
| `bun run build` | 통과 (api·web 2/2) |

### 3.1 마이그레이션 SQL 실측 검증

로컬에 실행 가능한 Postgres 자격증명이 없어, **개발 DB에서 트랜잭션 롤백**으로 검증했다(데이터 영향 없음).

임시 테이블에 경계 케이스를 넣고 실제 마이그레이션 문장을 실행한 결과:

| 입력 | 결과 | 판정 |
|---|---|---|
| `{"department":"내과","telephone":null}` | `{"department":"내과"}` | null 키만 제거 |
| `{"telephone":null,"mobilephone":null}` | `{}` | 전부 null 이면 빈 객체 (COALESCE 동작 확인) |
| `{"department":"내과","agreed":false,"visits":0,"memo":""}` | 변경 없음 | `false`·`0`·`''` 보존 |
| `{}` | 변경 없음 | 대상 아님 |
| `"not-an-object"` | 변경 없음, 오류 없음 | `jsonb_typeof` 가드 동작 |
| 두 번째 실행 | `UPDATE 0` | 멱등성 확인 |

실제 `user_profiles` 테이블에 대해서도 동일 문장을 `BEGIN … ROLLBACK` 으로 실행해 파싱·실행을 확인했다(`UPDATE 0` — 개발 DB에는 대상 행이 없다).

### 3.2 장애 원인 확인 범위

개발 DB 읽기 전용 조회로 확인한 사실은 요구사항정의서 §1.2 에 기록했다. 요약:

- ezdesk 테넌트 외부 인증 매핑에 `user.telePhoneNumber → telephone` 이 실제로 존재하고 `sync_on_login = true` 다 — `null` 유입 경로(C-1)가 실재한다.
- 개발 DB 에는 `null` 값 항목이 **0건**이며, 값 없는 사용자는 `""` 로 저장돼 있다. 빈 문자열은 소비자에서 정상 처리된다.
- 따라서 장애 행은 **운영 Authori DB** 에 있고, 이 작업 환경에서는 직접 확인하지 못했다. 배포 후 §1.2 의 질의로 확인해야 한다.

## 4. 배포 시 필요한 작업

1. `bun run migration:run` — 기존 `null` 값 항목 정리. 실행 전 대상 건수를 먼저 확인하면 좋다.

   ```sql
   SELECT count(*) FROM user_profiles p
   WHERE jsonb_typeof(p.profile_jsonb) = 'object'
     AND EXISTS (SELECT 1 FROM jsonb_each(p.profile_jsonb) e WHERE e.value = 'null'::jsonb);
   ```

2. 실행 후 같은 질의가 0 이면 완료. 장애 사용자의 재로그인으로 최종 확인한다.

## 5. 남은 리스크·후속 작업

| 항목 | 내용 |
|---|---|
| ezDesk 측 입력 방어 | 별도 저장소에서 진행 중(본 범위 제외). Authori 수정만으로 이번 장애는 해소되지만, 소비자가 `null` 에 견디게 만드는 편이 다른 IdP 연동에도 안전하다. |
| 외부 인증 경로의 스키마 미검증 | `authorize.service.ts` 의 동기화·JIT 프로비저닝은 여전히 `profileSchemaService.validate()` 를 거치지 않는다. 이번에는 `null` 만 막았다. 상류 응답이 스키마를 위반할 때 로그인을 막을지는 별도 결정이 필요하다. |
| 상류가 값을 실제로 지운 경우 | DEC-3 에 따라 반영되지 않는다(기존 값 보존). 필요해지면 프로바이더 설정 플래그로 분기한다. |
| `''`(빈 문자열) 정책 | 현행 유지. 개발 DB 에는 `telephone: ""` 가 다수 있으나 소비자에서 정상 처리되므로 손대지 않았다. |
| `users.service.create()` 단위 테스트 부재 | 기존부터 없던 공백(의존성 목이 많다). `omitNullValues` 자체와 `updateSelf` 경로로 간접 커버된다. |

## 6. 병합 결과

- 작업 브랜치: `fix/userinfo-null-claim` (원격 push 완료)
- `develop` 병합: `--no-ff` 병합 후 push 완료

## 7. 병합·배포 기록

| 항목 | 값 |
|---|---|
| 작업 브랜치 | `fix/userinfo-null-claim` |
| 브랜치 커밋 | `3402557` → `f295b91` (문서 4건 · 구현 5건) |
| develop 병합 커밋 | `164c61f` |
| push | `38d7021..164c61f develop -> develop` |
| 배포 시 필요한 작업 | `bun run migration:run` (§4 참조) |
