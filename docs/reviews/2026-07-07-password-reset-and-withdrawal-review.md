# 개발완료보고서 — 비밀번호 재설정 및 회원 탈퇴(계정 비활성화·유예 삭제)

> **Status:** Approved
> **Owner:** Jinho Lee
> **Created:** 2026-07-07
> **Updated:** 2026-07-07
> **Branch:** `feat/password-reset-and-withdrawal`
> **Related:**
> - 요구사항정의서: `docs/requirements/2026-07-07-password-reset-and-withdrawal-requirements.md`
> - 개발설계서: `docs/specs/2026-07-07-password-reset-and-withdrawal-spec.md`
> - 개발계획서: `docs/plans/2026-07-07-password-reset-and-withdrawal-plan.md`

## 1. 구현 요약

두 기능을 구현했다.

1. **비밀번호 재설정 (공개, 이메일 토큰 2단계)** — 비로그인 사용자가 호출하는 인증 없는 공개 엔드포인트.
   - `POST /t/:tenantSlug/oauth/password-reset/request` `{ email }` → `{ status: 'sent' | 'mail_delivery_failed' }`
   - `POST /t/:tenantSlug/oauth/password-reset/confirm` `{ token, newPassword }` → `{ status: 'reset', email }`
   - 토큰은 `PasswordResetToken`에 sha256 해시로 저장, TTL 기본 3600초. 확정 시 해당 사용자 access/refresh 토큰 폐기, 계정 status는 불변.
   - 계정 열거 방지: 정상 인프라에서 계정 유무와 무관하게 `sent`, 인프라 장애 시에만 `mail_delivery_failed`.
   - 프론트: `/forgot-password`, `/reset-password` (src/views/oauth/), 로그인 화면에 "비밀번호를 잊으셨나요?" 링크.
2. **회원 탈퇴 (M2M 비활성화 + 유예 후 자동 삭제)**
   - 기존 `POST /t/:tenantSlug/api/users/:userId/deactivate`(scope `users:write`) 강화: status=INACTIVE + `deactivatedAt` 기록 + access/refresh 토큰 폐기, `emailVerificationRequired` 테넌트는 비활성화 안내 메일(best-effort).
   - `activate`/`unlock` 시 `deactivatedAt` 초기화(예약 삭제 취소).
   - `AccountDeletionSweepService` 일일 크론: `pg_try_advisory_xact_lock`으로 단일 인스턴스만 실행, 유예기간(`accountDeletionGracePeriodDays`, 기본 30, 테넌트 설정) 경과한 INACTIVE(+`deactivated_at IS NOT NULL`) 계정을 `usersService.delete()`로 하드 삭제.
   - 관리 UI(TenantDetailView)에 유예기간 입력 추가.

## 2. 완료된 작업 (12개 태스크)

| # | 작업 | 커밋 |
|---|------|------|
| 1 | PasswordResetToken 엔티티·마이그레이션 | d727f66 |
| 2 | User.deactivatedAt 컬럼 | 2ff7456 |
| 3 | TenantSettings.accountDeletionGracePeriodDays | 0b85001 |
| 4 | passwordResetTtl 설정 | 064e4f2 |
| 5 | MailService 재설정·비활성화 메일 + isConfigured | 2cfdd7d |
| 6 | PasswordResetService | 02934d6 |
| (style) | 메일 로그 라인 lint 포맷 | 9719a93 |
| 7 | 재설정 DTO·컨트롤러·모듈 배선 | 9dd8d94 |
| 8 | usersService 비활성화 강화 | 128475c |
| 9 | AccountDeletionSweepService | f64a917 |
| 10 | 재설정 프론트 화면·라우트 | ac35c07 |
| 11 | 테넌트 설정 UI 유예기간 | 6bf19fc |
| Fix | 스윕 self-deadlock 제거(FOR UPDATE) | 318bc1a |
| Fix | deactivate 메일 게이팅 best-effort | 5b60e4b |

각 태스크는 서브에이전트 구현 → 태스크 리뷰(스펙+품질) → 승인 절차를 거쳤다.

## 3. 빌드/테스트 실행 결과

- `bun run typecheck` — **PASS**
- `bun run test` — **PASS** (api 121 tests, web 10 tests)
- `bun run build` — **PASS** (api + web)
- `bun run lint` — **FAIL(기존 baseline)**: 69 errors가 이 브랜치가 건드리지 않은 파일(예: `test/registration-default-role.e2e-spec.ts` 21, `test/m2m-rbac.e2e-spec.ts` 6, `src/main.ts`, `src/admin/guards/*`, `src/oauth/keys/keys.service.ts` 등)에 광범위하게 존재하는 **선행 기술 부채**다. type-aware `no-unsafe-*` 규칙이 테스트의 `any`-mock에 걸리는 패턴으로, develop에서 이미 실패하던 상태. 신규 서비스 스펙은 clean이며 확장한 `users.service.spec.ts`는 해당 파일의 기존 패턴을 따른다. 이 브랜치는 새로운 lint 오류 유형을 추가하지 않았다.

## 4. 코드 리뷰 결과

최종 whole-branch 리뷰(가장 유능한 모델)에서 **Critical 1건 + Important 1건**을 발견하여 수정했다.

- **[Critical, 수정됨]** 삭제 스윕 self-deadlock: `runSweep`의 트랜잭션 A가 `FOR UPDATE ... SKIP LOCKED`로 행 잠금을 쥔 채 `usersService.delete()`의 별도 트랜잭션 B가 같은 행을 DELETE하려 대기 → A는 B를 await하여 교착(단일 인스턴스+단일 계정에서도 발생). advisory lock이 이미 인스턴스 간 직렬화를 보장하므로 `FOR UPDATE`를 제거했고, 삭제 루프에 per-item try/catch를 추가했다. (318bc1a)
- **[Important, 수정됨]** `deactivate`의 메일 게이팅용 `tenantRepo.findOne`이 best-effort try/catch 밖에 있어, 조회 실패 시 이미 커밋·감사된 후 500이 나고 재시도 시 `deactivatedAt`이 리셋되는 문제 → 조회를 try/catch 안으로 이동. (5b60e4b)

수정 재리뷰에서 두 수정 모두 확인, 신규 이슈 없음.

## 5. 남은 리스크 / 후속 작업

- **마이그레이션 실행 필요**: 3건(`1780800000000` PasswordResetToken, `1780800100000` User.deactivated_at, `1780800200000` TenantSettings grace period)을 배포 환경에서 `bun run migration:run`으로 적용해야 한다. 로컬 DB 미가용으로 이 브랜치에서는 실행하지 않았다(up/down 대칭·엔티티 정합성은 리뷰로 확인).
- **선행 lint 부채(ACCEPTABLE)**: 저장소 전역 `bun run lint` 실패는 이 기능 범위를 벗어난 별도 정리 과제. 무관한 파일 다수를 건드려야 하므로 이번 브랜치에 포함하지 않았다.
- **수용된 Minor(리뷰에서 ACCEPTABLE 판정)**:
  - PasswordResetService / UsersService에 미사용 주입 repo(`accessTokenRepo`/`refreshTokenRepo`) — 폐기는 `manager.update`로 수행하므로 무해한 dead deps.
  - 스윕 실패 대상은 다음 03:00 실행에서 재시도(알림 없음).
  - 재설정 confirm DTO `@MinLength(8)`가 배열형 검증 에러를 내어 8자 미만 비밀번호는 프론트에서 일반 메시지로 표시(테넌트 `passwordMinLength`가 8 미만일 때 정책 드리프트 가능성). UX 한정.
  - 재발급 시 이전 미사용 재설정 토큰을 무효화하지 않음(각 토큰은 여전히 단회·TTL 제한).
- **다중 인스턴스 안전성**: advisory xact lock + 멱등 하드 삭제로 중복 실행 시에도 안전(`FOR UPDATE` 제거 후에도 단일 sweeper 보장 유지).

## 6. 검증 명령 재현

```bash
cd /path/to/repo   # (worktree: .worktree/password-reset-and-withdrawal)
bun run typecheck   # PASS
bun run test        # PASS (api 121 / web 10)
bun run build       # PASS
# 배포 시:
cd apps/api && bun run migration:run
```
