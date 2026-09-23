# 요구사항정의서 — DB 접속 정보를 DATABASE_URL 단일 변수로

- 작성일: 2026-09-23
- 작성자: Jinho Lee
- 상태: 확정
- 유형: 설정 변경 (인프라 / 구성)

## 1. 문제 정의

DB 접속 정보가 **5개 환경변수로 흩어져 있다**: `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`.

```bash
DB_HOST=appsdevdb.ezcaretech.com
DB_PORT=5000
DB_USERNAME=ezdesk
DB_PASSWORD=****
DB_NAME=ezdesk
```

원하는 형태는 하나의 연결 문자열이다.

```bash
DATABASE_URL=postgresql://user:password@host:5000/dbname
```

### 1.1 흩어진 변수의 문제

| 문제 | 설명 |
|---|---|
| 배포 환경 설정이 번거롭다 | 5개를 각각 주입해야 하고, 하나만 빠져도 조용히 기본값으로 대체된다. |
| **누락이 조용히 실패한다** | 현재 모든 항목에 기본값이 있다(`DB_HOST ?? 'localhost'`). `DB_HOST` 를 빠뜨리면 오류 없이 **localhost 로 접속을 시도**한다. 운영 환경에서 엉뚱한 DB 를 바라보거나 원인을 알기 어려운 접속 실패가 난다. |
| 관리형 DB·PaaS 의 표준과 어긋난다 | Heroku·Render·Supabase·Neon 등은 `DATABASE_URL` 하나를 내려준다. 지금은 그 값을 쪼개서 다시 넣어야 한다. |
| 정의가 두 군데로 갈라져 있다 | 런타임(`common/config/app.config.ts` → `database/database.module.ts`)과 마이그레이션 CLI(`database/data-source.ts`)가 **같은 env 를 각각 따로 읽는다.** 한쪽만 고치면 어긋난다. |

### 1.2 함께 고칠 결함 (작업 중 발견)

`database/database.module.ts` 의 엔티티 목록에 **`AdminUserTenant` 가 빠져 있다.** 직전 [다중 테넌트 관리자 작업](2026-09-23-multi-tenant-admin-requirements.md)에서 `data-source.ts` 에만 추가하고 런타임 모듈에는 넣지 않았다.

- 증상: 애플리케이션 기동 후 관리자 로그인·배정 조회 시 `No metadata for "AdminUserTenant" was found` 로 실패한다.
- 미검출 이유: 단위 테스트가 리포지토리를 목으로 대체해 실제 메타데이터를 요구하지 않았고, `typecheck`·`build` 는 배열 원소 누락을 잡지 못한다.
- **근본 원인은 엔티티 목록이 두 파일에 중복 정의된 것**이다. 이번 작업이 같은 두 파일을 건드리므로 함께 해소한다.

## 2. 목표

1. DB 접속 정보를 `DATABASE_URL` **하나로** 지정한다.
2. 런타임과 마이그레이션 CLI 가 **같은 해석 결과**를 쓴다.
3. 설정 누락·오타가 조용히 넘어가지 않는다.
4. 기존 배포가 이 변경만으로 깨지지 않는다.

## 3. 기능 요구사항

| ID | 요구사항 |
|---|---|
| FR-1 | `DATABASE_URL` 하나로 host·port·user·password·database 를 모두 지정할 수 있다. |
| FR-2 | `postgresql://` 와 `postgres://` 두 스킴을 모두 받는다. |
| FR-3 | 사용자명·비밀번호의 퍼센트 인코딩(`%40` 등)을 해제해 적용한다. 비밀번호에 `@`·`:`·`/` 가 들어갈 수 있다. |
| FR-4 | 포트를 생략하면 5432 로 본다. |
| FR-5 | 쿼리 파라미터 `sslmode` 를 해석한다. `disable` 이 아니면 SSL 로 접속한다. `require`·`no-verify` 는 인증서 검증을 생략한다(관리형 DB 가 자체 서명 인증서를 쓰는 경우가 많다). |
| FR-6 | **형식이 잘못된 `DATABASE_URL` 은 기동 시점에 명확한 오류로 실패한다.** 조용히 기본값으로 넘어가지 않는다. |
| FR-7 | 런타임(`DatabaseModule`)과 마이그레이션 CLI(`data-source.ts`)가 **같은 해석 함수**를 사용한다. |
| FR-8 | 기존 `DB_HOST` 등 개별 변수도 당분간 동작한다. `DATABASE_URL` 이 없고 개별 변수가 하나라도 있으면 그것으로 접속하며, **폐기 예정 경고를 로그에 남긴다.** |
| FR-9 | 둘 다 없으면 로컬 개발 기본값(`postgresql://authori@localhost:5432/authori_db`)을 쓴다. 현재 동작과 같다. |
| FR-10 | `DB_LOGGING` 은 접속 정보가 아니므로 그대로 둔다. |
| FR-11 | 엔티티 목록을 **한 곳에서 정의**하고 런타임·CLI 가 함께 참조한다. `AdminUserTenant` 누락이 해소된다. |

## 4. 비기능 요구사항

| ID | 요구사항 |
|---|---|
| NFR-1 | **비밀번호가 로그에 남지 않는다.** 오류 메시지와 폐기 경고 어디에도 자격증명을 넣지 않는다. |
| NFR-2 | **실제 자격증명을 저장소에 커밋하지 않는다.** `.env.example`·`docker-compose.yml` 에는 예시 값만 둔다. |
| NFR-3 | URL 해석은 단위 테스트로 검증한다(정상·특수문자·포트 생략·sslmode·형식 오류). |
| NFR-4 | DB 스키마·마이그레이션 변경 없음. |
| NFR-5 | `.env.example`, `docker-compose.yml`, `README.md` 가 새 형식을 반영한다. |

## 5. 제외 범위

- **커넥션 풀 설정**(pool size, timeout) — 현재 지정하지 않고 TypeORM 기본값을 쓴다. URL 형식과 무관한 별개 주제다.
- **읽기 전용 복제본·다중 DB** — 단일 접속만 다룬다.
- **`docs/guide/new-service-reference.md` 의 예시 코드** — 다른 서비스를 만들 때 참고하는 독립 문서다. 본 작업의 변경 대상이 아니며, 필요하면 별도로 갱신한다.
- **개별 변수(`DB_*`) 의 최종 제거** — FR-8 로 당분간 유지한다. 모든 배포가 `DATABASE_URL` 로 옮겨간 뒤 별도 작업으로 제거한다.
- **엔티티 목록 누락으로 이미 배포된 환경의 복구** — 아직 배포 전이므로 해당 없음.

## 6. 성공 기준

- `.env` 에 `DATABASE_URL` 하나만 두고 API 가 기동하고, 마이그레이션 CLI 도 같은 DB 에 붙는다.
- 비밀번호에 `@` 가 포함돼도(퍼센트 인코딩) 정상 접속한다.
- `DATABASE_URL=not-a-url` 로 두면 **기동이 명확한 오류로 실패한다**(조용한 localhost 접속이 아니다).
- 기존 `DB_*` 만 설정된 환경도 그대로 동작하며 경고가 남는다.
- `AdminUserTenant` 를 포함한 모든 엔티티가 런타임에서 해석된다.
- `bun run lint`(기존 baseline 대비 신규 유입 0건), `bun run typecheck`, `bun run test`, `bun run build` 통과.
