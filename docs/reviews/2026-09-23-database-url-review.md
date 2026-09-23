# 개발완료보고서 — DB 접속 정보를 DATABASE_URL 단일 변수로

- 작성일: 2026-09-23
- 브랜치: `feat/database-url`
- 관련 요구사항: [2026-09-23-database-url-requirements.md](../requirements/2026-09-23-database-url-requirements.md)
- 관련 설계: [2026-09-23-database-url-spec.md](../specs/2026-09-23-database-url-spec.md)
- 관련 계획: [2026-09-23-database-url-plan.md](../plans/2026-09-23-database-url-plan.md)

## 1. 구현 요약

5개로 흩어져 있던 DB 접속 환경변수를 연결 문자열 하나로 모았다.

```bash
# 이전
DB_HOST=... DB_PORT=... DB_USERNAME=... DB_PASSWORD=... DB_NAME=...

# 이후
DATABASE_URL=postgresql://user:password@host:5000/dbname
```

단순한 형식 변경으로 보이지만 두 가지를 함께 바로잡았다.

1. **조용한 실패를 없앴다.** 기존에는 모든 항목에 기본값이 있어(`DB_HOST ?? 'localhost'`) 변수 하나만 빠져도 오류 없이 localhost 에 접속을 시도했다. 운영 환경에서 엉뚱한 DB 를 바라보거나 원인을 알기 어려운 접속 실패가 났다. 이제 `DATABASE_URL` 형식이 잘못되면 **기동 시점에 명확한 오류로 실패한다.**
2. **해석을 한 곳으로 모았다.** 런타임(`DatabaseModule`)과 마이그레이션 CLI(`data-source.ts`)가 같은 env 를 각각 따로 읽고 있었다. 이제 `resolveDatabaseConnection()` 하나를 공유한다.

## 2. 완료된 작업

| # | 작업 | 커밋 |
|---|---|---|
| 1 | `database-url.ts` 해석 함수 + 테스트 26건 | `750cd14` |
| 2 | `ALL_ENTITIES` 단일화 — **`AdminUserTenant` 누락 결함 해소** | `750cd14` |
| 3 | `app.config.ts`·`database.module.ts`·`data-source.ts` 연결 | `750cd14` |
| 4 | `.env.example`·`docker-compose.yml`·`README.md`·`CLAUDE.md` 갱신 | `750cd14` |
| 5 | 4단계 검증 | — |

### 2.1 해석 규칙

| 항목 | 규칙 |
|---|---|
| 스킴 | `postgresql://` · `postgres://` |
| 포트 | 생략 시 5432 |
| 사용자명·비밀번호 | 퍼센트 디코딩. **`p%40ss` 를 디코딩하지 않으면 인증이 실패한다** |
| `sslmode` | `require`·`no-verify` → 암호화·검증 안 함 / `verify-ca`·`verify-full` → 검증 / 그 외·없음 → 비암호화 |
| 우선순위 | `DATABASE_URL` → 개별 `DB_*`(폐기 경고) → 로컬 기본값 |

`sslmode` 는 libpq 의미를 따랐다. `require` 는 "암호화하되 인증서는 검증하지 않음"이고 검증까지 원하면 `verify-full` 을 쓴다. 관리형 DB 가 자체 서명 인증서를 쓰는 경우가 많아 이 구분이 실제로 중요하다.

### 2.2 자격증명 보호

오류 메시지와 폐기 경고 **어디에도 원본 URL·비밀번호를 넣지 않는다.** 넣으면 로그·스택트레이스·오류 추적 시스템에 그대로 남는다. 무엇이 잘못됐는지와 올바른 예시만 알린다. 이를 테스트 2건으로 고정했다.

저장소에도 실제 자격증명을 넣지 않았다. `.env.example`·`docker-compose.yml` 은 로컬 개발용 예시 값만 쓴다. 커밋 전 전체 검색으로 확인했다.

### 2.3 기존 `DB_*` 를 남긴 이유

하드 전환하면 기존 `DB_*` 만 설정된 배포가 `DATABASE_URL` 도 아니고 `DB_*` 도 아닌 **로컬 기본값(localhost)** 으로 떨어진다. 이것이 요구사항에서 없애려던 바로 그 실패 방식이다. 폴백을 남기고 폐기 예정 경고를 로그에 남긴다. 모든 배포가 옮겨간 뒤 별도 작업으로 제거한다.

## 3. 함께 고친 결함 — `AdminUserTenant` 런타임 누락

**직전 [다중 테넌트 관리자 작업](2026-09-23-multi-tenant-admin-review.md)에서 유입된 실제 버그다.**

- **증상**: `database/database.module.ts` 의 엔티티 목록에 `AdminUserTenant` 가 없어, 애플리케이션 기동 후 관리자 로그인·배정 조회 시 `No metadata for "AdminUserTenant" was found` 로 실패한다.
- **원인**: 엔티티 목록이 `data-source.ts` 와 `database.module.ts` 두 곳에 각각 하드코딩돼 있었고, 새 엔티티를 전자에만 추가했다.
- **미검출 이유**: 단위 테스트가 리포지토리를 목으로 대체해 실제 메타데이터를 요구하지 않았고, `typecheck`·`build` 는 배열 원소 누락을 잡지 못한다. **테스트·타입체크가 모두 통과했지만 런타임에서 깨지는 종류의 결함이었다.**
- **처리**: `entities/index.ts` 에 `ALL_ENTITIES` 를 두고 양쪽이 참조하게 했다. 목록 중복이라는 근본 원인이 사라져 같은 누락이 재발하지 않는다.

두 목록을 대조한 결과 **차이는 `AdminUserTenant` 하나뿐**이었다. 다른 엔티티 누락은 없었다.

이 결함은 아직 배포되지 않았으므로 운영 영향은 없다.

## 4. 빌드/테스트 실행 결과

| 명령 | 결과 |
|---|---|
| `bun run lint` | **실패 — 기존 api baseline** (아래 4.1) |
| `bun run typecheck` | 통과 (api, web) |
| `bun run test` | 통과 — **api 29 suites / 283 tests, web 11 files / 55 tests** |
| `bun run build` | 통과 (api, web) |

### 4.1 lint

최종 `✖ 122 problems (67 errors, 55 warnings)` 로 `develop` baseline 과 **정확히 일치**한다.

작업 중 한때 **경고가 55 → 56 으로 1건 늘었다.** 새 테스트의 `expect.not.stringContaining(...)` 이 `any` 로 취급돼 `no-unsafe-argument` 에 걸린 것으로, 메시지를 직접 잡아 `expect(message).not.toContain(secret)` 으로 단언하도록 고쳐 해소했다. 오류 수만 보지 않고 경고까지 대조한 덕에 잡혔다.

### 4.2 테스트 커버리지 (신규 26건)

정상 해석(전체 지정·`postgres://`·포트 생략·비밀번호 없음), 퍼센트 인코딩 3종, `sslmode` 8종, 형식 오류 4종, **오류 메시지·경고에 비밀번호 미포함 2건**, 폴백·우선순위 5종.

## 5. 남은 리스크 및 후속 작업

| 항목 | 내용 |
|---|---|
| **실제 DB 접속 미검증** | 실행 중인 DB 가 없어 해석 결과로 실제 접속을 시도하지 못했다. 해석 자체는 단위 테스트로 검증했다. 배포 시 설계서 9장의 5개 시나리오 확인 권장 — 특히 **③ 잘못된 URL 로 기동이 실패하는지**와 **⑤ 관리자 로그인이 `AdminUserTenant` 오류 없이 되는지**. |
| **배포 시 환경변수 교체 필요** | 기존 배포가 `DB_*` 를 쓰고 있으면 계속 동작하지만 경고가 남는다. `DATABASE_URL` 로 옮기는 것이 이번 변경의 목적이다. 옮길 때 **비밀번호의 `@`·`:`·`/` 퍼센트 인코딩**을 빠뜨리지 않아야 한다. |
| **`DB_*` 최종 제거** | 폐기 예정 폴백으로 남아 있다. 모든 배포가 옮겨간 것을 확인한 뒤 별도 작업으로 제거한다. |
| **`docs/guide/new-service-reference.md`** | 다른 서비스를 만들 때 참고하는 독립 문서로 아직 `DB_*` 예시를 쓴다. 요구사항의 제외 범위였다. 필요하면 별도 갱신. |
| **커넥션 풀 설정 부재** | TypeORM 기본값을 쓴다. URL 형식과 무관한 별개 주제이나, 원격 DB 를 쓰기 시작하면 검토할 가치가 있다. |
| **테넌트 배정 변경의 감사 로그** | 직전 작업에서 남긴 후속 과제로 여전히 미해결. 관리자 계정 변경 전체가 감사되지 않는다. |
| **lint baseline 부채** | api 의 67 errors / 55 warnings. 신규 유입 감지를 어렵게 하므로 별도 정리 권장(네 번째 보고서 연속 지적). |
