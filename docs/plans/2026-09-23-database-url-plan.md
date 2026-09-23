# 개발계획서 — DB 접속 정보를 DATABASE_URL 단일 변수로

- 작성일: 2026-09-23
- 관련 요구사항: [2026-09-23-database-url-requirements.md](../requirements/2026-09-23-database-url-requirements.md)
- 관련 설계: [2026-09-23-database-url-spec.md](../specs/2026-09-23-database-url-spec.md)
- 브랜치: `feat/database-url`

## Goal

5개로 흩어진 DB 접속 환경변수를 `DATABASE_URL` 하나로 모으고, 런타임과 마이그레이션 CLI 가 같은 해석 결과·같은 엔티티 목록을 쓰게 한다. 설정 누락이 조용히 localhost 로 떨어지지 않게 한다.

## 변경 파일 목록

### 신규

| 파일 | 역할 |
|---|---|
| `apps/api/src/database/database-url.ts` | `DATABASE_URL` 해석, `DB_*` 폴백, 기본값 |
| `apps/api/src/database/database-url.spec.ts` | 해석 테스트 |

### 수정

| 파일 | 변경 |
|---|---|
| `apps/api/src/database/entities/index.ts` | `ALL_ENTITIES` 배열 추가 (FR-11) |
| `apps/api/src/common/config/app.config.ts` | `dbConfig` 가 해석 함수를 사용, `name` → `database`, `ssl` 추가 |
| `apps/api/src/database/database.module.ts` | `ALL_ENTITIES` 사용, `ssl` 전달 — **`AdminUserTenant` 누락 해소** |
| `apps/api/src/database/data-source.ts` | 해석 함수·`ALL_ENTITIES` 사용 |
| `.env.example` | `DB_*` 5줄 → `DATABASE_URL` |
| `docker-compose.yml` | api 서비스 환경변수 교체 |
| `README.md` | 환경변수 설명 갱신 |

변경 없음: DB 스키마, 마이그레이션, 도메인 로직, `docs/guide/new-service-reference.md`(제외 범위).

## 작업 단계

- [ ] 1. `database-url.ts` 작성 + 테스트 (FR-1~9, NFR-1)
- [ ] 2. `ALL_ENTITIES` 단일화 — `AdminUserTenant` 누락 해소 (FR-11)
- [ ] 3. `app.config.ts`·`database.module.ts`·`data-source.ts` 를 해석 함수에 연결 (FR-7)
- [ ] 4. `.env.example`·`docker-compose.yml`·`README.md` 갱신 (NFR-2, NFR-5)
- [ ] 5. 4단계 검증 명령 전체 실행 및 통과

1 을 먼저 하는 이유: 3 이 이 함수에 의존한다. 2 는 독립적이지만 같은 파일(`database.module.ts`, `data-source.ts`)을 건드리므로 3 보다 앞에 둔다.

## 검증 명령과 기대 결과

```bash
bun run lint        # develop baseline(67 errors) 대비 신규 유입 0건
bun run typecheck   # 타입 오류 없음
bun run test        # 신규 스펙 포함 전체 통과
bun run build       # api·web 빌드 성공
```

추가 확인:

- **DB 접속을 실제로 하지는 못한다**(실행 중인 DB 가 없다). 해석 결과가 맞는지는 단위 테스트로 검증하고, 실제 접속은 배포 시 수동 확인 대상으로 보고서에 명시한다.
- `AdminUserTenant` 가 `ALL_ENTITIES` 에 포함됐는지 **직접 확인**한다. 이 누락이 이번에 고치는 결함이며, 타입체크로는 잡히지 않는다.
- `DB_HOST` 등 옛 변수를 읽는 코드가 `database-url.ts` 외에 남아 있지 않은지 전체 검색한다.
- 저장소에 **실제 자격증명이 커밋되지 않았는지** `git diff` 로 확인한다.

## 리스크

| 리스크 | 영향 | 대응 |
|---|---|---|
| **기존 `DB_*` 배포가 조용히 localhost 로 떨어짐** | 운영에서 엉뚱한 DB 접속 | `DB_*` 폴백을 남긴다(FR-8). 하드 전환하지 않는다. |
| 비밀번호가 오류 메시지·로그에 노출 | 자격증명 유출 | 오류 메시지에 원본 URL 을 넣지 않는다. 테스트로 고정한다. |
| 실제 자격증명을 저장소에 커밋 | 유출 | `.env.example`·compose 에 예시 값만. 커밋 전 `git diff` 확인. |
| 퍼센트 인코딩 미처리 | 특수문자 비밀번호로 인증 실패 | `decodeURIComponent` 적용 + 테스트. |
| `ssl` 기본값 변경으로 기존 접속 실패 | 기동 불가 | 명시 없으면 `false` — 현재 동작과 동일. |
| 엔티티 목록 단일화 중 누락 | 런타임 메타데이터 오류 | 두 파일의 기존 목록을 대조해 합집합을 만든다. `AdminUserTenant` 포함을 명시적으로 확인한다. |
