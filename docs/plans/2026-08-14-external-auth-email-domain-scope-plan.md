# 개발계획서 — 외부 인증 프로바이더 이메일 도메인 적용 범위

- 작성일: 2026-08-14
- 작성자: Jinho Lee
- 관련 요구사항: [2026-08-14-external-auth-email-domain-scope-requirements.md](../requirements/2026-08-14-external-auth-email-domain-scope-requirements.md)
- 관련 설계서: [2026-08-14-external-auth-email-domain-scope-spec.md](../specs/2026-08-14-external-auth-email-domain-scope-spec.md)

## Goal

외부 인증 프로바이더에 이메일 도메인 적용 범위 조건을 추가하여, 하나의 테넌트/클라이언트 아래에서
로그인 이메일의 호스트명에 따라 서로 다른 외부 인증 프로바이더로 분기할 수 있게 한다.
기존에 등록된 프로바이더의 동작은 100% 유지한다.

## 작업 환경

- 브랜치: `feat/external-auth-email-domain-scope`
- worktree: `.worktree/external-auth-email-domain-scope`
- 베이스: `develop` (`ed86e79`)

## 변경 파일 목록

| 구분 | 파일 | 작업 |
|---|---|---|
| Backend | `apps/api/src/database/entities/external-auth-provider.entity.ts` | 수정 |
| Backend | `apps/api/src/database/migrations/1780900000000-AddExternalAuthEmailDomains.ts` | 신규 |
| Backend | `apps/api/src/external-auth/dto/create-provider.dto.ts` | 수정 |
| Backend | `apps/api/src/external-auth/external-auth.service.ts` | 수정 |
| Backend | `apps/api/src/external-auth/external-auth.service.spec.ts` | 수정 |
| Backend | `apps/api/src/oauth/authorize/authorize.service.ts` | 수정 (1줄) |
| Frontend | `apps/web/src/api/external-auth.ts` | 수정 |
| Frontend | `apps/web/src/views/tenant/external-auth/ExternalAuthFormView.vue` | 수정 |
| Frontend | `apps/web/src/views/tenant/external-auth/ExternalAuthListView.vue` | 수정 |
| 문서 | `CLAUDE.md` | 수정 |
| 문서 | `docs/reviews/2026-08-14-external-auth-email-domain-scope-review.md` | 신규 |

## 작업 단계

### Phase 1 — 데이터 모델

- [x] 1-1. `ExternalAuthProvider` 엔티티에 `emailDomains: string[] | null` (`email_domains` jsonb, nullable) 컬럼 추가 + JSDoc 주석
- [x] 1-2. 마이그레이션 `1780900000000-AddExternalAuthEmailDomains.ts` 작성 (up: ADD COLUMN, down: DROP COLUMN)

### Phase 2 — 도메인 정규화/추출 유틸 (TDD)

- [x] 2-1. `external-auth.service.spec.ts`에 `normalizeEmailDomains` 테스트 작성 — 공백/대문자/`@` 접두사 정규화, 중복 제거, 빈 배열→`null`, 점 없는 값 400, 와일드카드 400
- [x] 2-2. `external-auth.service.spec.ts`에 `extractEmailDomain` 테스트 작성 — 소문자 반환, `@` 없음→`null`, 인용 로컬파트(`"a@b"@test.com`) 처리
- [x] 2-3. `ExternalAuthService`에 `normalizeEmailDomains` / `extractEmailDomain` 구현 (설계서 §3)

### Phase 3 — 프로바이더 선택 로직 (TDD)

- [x] 3-1. `findActive` 우선순위 ①~④ 각각이 선택되는 테스트 4개 작성
- [x] 3-2. 미매칭→`null`, `email` 미전달 시 도메인 조건 프로바이더 제외, `enabled=false` 제외 테스트 작성
- [x] 3-3. `findActive(tenantId, clientId, email?)` 구현 — 단일 쿼리 + 메모리 우선순위 판정 (설계서 §4.2)
- [x] 3-4. `authorize.service.ts:313`에서 `dto.email`을 `findActive`에 전달

### Phase 4 — 중복 검사 규칙 (TDD)

- [x] 4-1. 도메인 겹침 409(메시지에 충돌 도메인 포함) / 안 겹치면 성공 / `clientId` 범위 다르면 성공 / update 시 자기 자신 제외 테스트 작성
- [x] 4-2. `checkDuplicate(tenantId, clientId, emailDomains, excludeId?)` 구현 (설계서 §5)
- [x] 4-3. `create()` / `update()`에서 `emailDomains` 정규화 후 저장 및 변경 시 중복 검사 호출

### Phase 5 — API DTO

- [x] 5-1. `CreateProviderDto`에 `emailDomains?: string[] | null` 추가 (`@IsOptional` `@IsArray` `@IsString({each:true})` + Swagger 데코레이터)

### Phase 6 — 관리 UI

- [ ] 6-1. `apps/web/src/api/external-auth.ts`의 `ExternalAuthProvider` / `CreateProviderPayload`에 `emailDomains` 추가
- [ ] 6-2. `ExternalAuthFormView.vue`에 도메인 입력 textarea 추가 (줄바꿈/콤마 구분, 헬프 텍스트, 저장 파싱, 로드 역변환)
- [ ] 6-3. `ExternalAuthListView.vue` 적용 범위 셀에 도메인 표시 (3개 초과 시 축약 + `title` 전체 목록)

### Phase 7 — 문서 및 마무리

- [ ] 7-1. `CLAUDE.md`의 외부 인증 관련 설명에 도메인 적용 범위 규칙 반영
- [ ] 7-2. 개발완료보고서 `docs/reviews/2026-08-14-external-auth-email-domain-scope-review.md` 작성

## 검증

각 Phase 완료 시 관련 테스트를 실행하고, 전체 작업 완료 후 아래를 순서대로 실행한다.

| 명령 | 기대 결과 |
|---|---|
| `bun run lint` | 오류 0 |
| `bun run typecheck` | 오류 0 |
| `bun run test` | 전체 통과 (신규 케이스 포함) |
| `bun run build` | api/web 빌드 성공 |

마이그레이션 확인(DB 접속 가능한 경우에만):

| 명령 | 기대 결과 |
|---|---|
| `cd apps/api && bun run migration:run` | `email_domains` 컬럼 추가 성공 |
| `cd apps/api && bun run migration:revert` | 컬럼 제거 성공 (롤백 검증) |

## 커밋 규칙

- 코드 변경과 **본 계획서의 체크박스 갱신을 같은 커밋에 포함**한다.
- Phase 단위로 커밋한다. 커밋 메시지 예: `feat: 외부 인증 프로바이더 이메일 도메인 선택 로직 구현`
- 작업 완료 후 `git push -u origin feat/external-auth-email-domain-scope`

## 리스크

| 리스크 | 대응 |
|---|---|
| `findActive` 쿼리 구조를 2회→1회로 바꾸면서 기존 동작이 미묘하게 달라질 수 있음 | 기존 spec 테스트를 수정 없이 통과시키는 것을 필수 조건으로 둔다. 통과하지 않으면 구현을 고친다(테스트를 고치지 않는다). |
| 기존 `checkDuplicate`에 의존하는 테스트가 새 시그니처로 깨질 수 있음 | 파라미터를 추가하되 도메인 없는 경우의 동작을 기존과 동일하게 유지 |
| 관리자가 서브도메인이 자동 매칭될 것으로 오해 | 폼 헬프 텍스트에 명시 (6-2) |
| jsonb 배열 비교를 DB에서 하려다 복잡해질 수 있음 | 설계 확정대로 애플리케이션 메모리에서 판정한다 |
| 프론트 입력에서 대소문자/`@`가 섞여 들어와 서버 정규화와 어긋남 | 프론트에서도 동일 정규화를 수행하되, **서버 정규화를 신뢰의 원천**으로 둔다 |
