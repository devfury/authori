# 개발설계서 — 비밀번호 재설정 및 회원 탈퇴(계정 비활성화·유예 삭제)

> **Status:** Draft
> **Owner:** Jinho Lee
> **Created:** 2026-07-07
> **Updated:** 2026-07-07
> **Related:** (requirements) docs/requirements/2026-07-07-password-reset-and-withdrawal-requirements.md

## 1. 범위와 비범위

### 범위
- 공개 비밀번호 재설정 API 2종(request/confirm)과 프론트엔드 화면.
- 기존 M2M `deactivate` 강화(비활성화 시각 기록·토큰 폐기·조건부 안내 메일).
- 유예기간 경과 계정 자동 삭제 스케줄러(다중 인스턴스 안전).
- 관련 엔티티/설정/마이그레이션/메일 템플릿.

### 비범위
- 이메일·아이디 찾기, SMS 채널, 소프트 삭제, 관리자 대행 재설정.

## 2. 아키텍처 개요

두 기능은 기존 두 축을 각각 확장한다.

1. **공개 OAuth 축** (`oauth/authorize` 모듈, `t/:tenantSlug/oauth/*`, `RequireTenantGuard`): 비밀번호 재설정. `EmailVerificationService` / `verify-email` 흐름과 대칭 구조로 신규 `PasswordResetService`를 둔다.
2. **M2M 사용자 관리 축** (`users` + `rbac` 모듈, `t/:tenantSlug/api/*`, `OAuthAccessTokenGuard + ScopeGuard`): 비활성화 강화. 삭제 스케줄러는 신규 서비스로 추가한다.

## 3. 데이터 모델

### 3.1 신규 엔티티 `PasswordResetToken`
`EmailVerificationToken`과 동형. `apps/api/src/database/entities/password-reset-token.entity.ts`.

| 컬럼 | 타입 | 비고 |
|------|------|------|
| `id` | uuid PK | |
| `tenantId` | uuid | `tenant_id` |
| `userId` | uuid | `user_id` |
| `tokenHash` | varchar | `token_hash`, sha256 hex |
| `expiresAt` | timestamptz | `expires_at` |
| `usedAt` | timestamptz null | `used_at`, 사용 시각 |
| `createdAt` | timestamptz | `created_at` |

인덱스: `(tenant_id, token_hash)`.

### 3.2 `User` 컬럼 추가
- `deactivatedAt: timestamptz | null` (`deactivated_at`). 비활성화(탈퇴) 시각. 유예 삭제 기준이자 "탈퇴 비활성"과 "미인증 INACTIVE"의 구분자.

### 3.3 `TenantSettings` 컬럼 추가
- `accountDeletionGracePeriodDays: int` (`account_deletion_grace_period_days`), 기본 `30`. 비활성화 후 자동 삭제까지의 유예 일수.

### 3.4 마이그레이션 (3건)
1. `password_reset_tokens` 테이블 생성 + 인덱스.
2. `users.deactivated_at` 컬럼 추가(null 허용).
3. `tenant_settings.account_deletion_grace_period_days` 컬럼 추가(default 30).

## 4. API 설계

### 4.1 비밀번호 재설정 요청
```
POST /t/:tenantSlug/oauth/password-reset/request
Guard: RequireTenantGuard   Throttle: 5 / 60s
Body: { email: string }
```
처리 순서:
1. 메일 인프라 사용 가능 여부 판정(아래 6장). 불가 시 → `502`/`{ status: 'mail_delivery_failed' }` 반환하고 종료(계정 조회 이전 또는 무관하게 처리하여 열거 방지).
2. `email`로 사용자 조회. 없으면 → 성공 응답 `{ status: 'sent' }`(메일 미발송, 열거 방지).
3. 있으면 → 일회용 토큰 발급(sha256 저장, TTL `app.passwordResetTtl` 기본 3600초) 후 재설정 메일 발송.
   - 발송 성공 → `{ status: 'sent' }`.
   - 발송 중 예외 → `{ status: 'mail_delivery_failed' }`(실패 안내).

> 열거 방지와 실패 안내의 양립: 정상 인프라에서는 "계정 유무와 무관하게 sent"로 응답해 열거를 막고, 인프라 자체 장애일 때만 실패를 노출한다. 인프라 장애 시 재설정은 모두에게 불가하므로 계정 존재를 실질적으로 노출하지 않는다.

### 4.2 비밀번호 재설정 확정
```
POST /t/:tenantSlug/oauth/password-reset/confirm
Guard: RequireTenantGuard   Throttle: 10 / 60s
Body: { token: string, newPassword: string }
```
처리 순서:
1. `sha256(token)`으로 레코드 조회. 없거나 만료(`expiresAt < now`)/사용완료(`usedAt != null`)면 `400 invalid_token` / `token_expired`.
2. 사용자 조회. 없으면 `404`.
3. `newPassword`를 테넌트 `passwordMinLength`로 검증.
4. 트랜잭션: 새 해시 저장 + 토큰 `usedAt` 기록 + 해당 사용자 access/refresh 토큰 폐기.
5. 커밋 후 AuditLog 기록(`USER_UPDATED`, `metadata: { field: 'password', source: 'password_reset' }`).
6. 응답 `{ status: 'reset', email }`. 계정 `status`는 변경하지 않음.

### 4.3 계정 비활성화(기존 엔드포인트 강화)
```
POST /t/:tenantSlug/api/users/:userId/deactivate   (변경 없음)
Guard: OAuthAccessTokenGuard + ScopeGuard, scope: users:write
```
`usersService.deactivate()` 동작 확장:
1. `status = INACTIVE`, `deactivatedAt = now` 저장.
2. 해당 사용자 access/refresh 토큰 폐기.
3. 커밋 후: AuditLog(`USER_DEACTIVATED`) 기록.
4. 테넌트 `emailVerificationRequired === true`이면 `MailService.sendAccountDeactivatedEmail()` 발송(발송 실패는 비활성화를 막지 않음 — best-effort, 로그 기록).

`activate()` / `unlock()`: 기존 동작에 더해 `deactivatedAt = null`로 초기화(예약 삭제 취소).

## 5. 스케줄러 설계 — `AccountDeletionSweepService`

`apps/api/src/users/account-deletion-sweep.service.ts` (또는 `rbac/`). 기존 `pending-request-cleanup.service.ts` 패턴 준용.

```ts
@Cron(CronExpression.EVERY_DAY_AT_3AM)
async sweep() {
  await this.dataSource.transaction(async (m) => {
    const [{ locked }] = await m.query(
      'SELECT pg_try_advisory_xact_lock($1) AS locked', [ACCOUNT_SWEEP_LOCK_KEY],
    );
    if (!locked) return;              // 다른 인스턴스가 실행 중 → skip (FR-21)
    await this.runSweep(m);
  });
}
```

`runSweep` 로직:
1. 테넌트별 `accountDeletionGracePeriodDays`를 반영해 삭제 대상 사용자 조회. 조회는
   `WHERE status='INACTIVE' AND deactivated_at IS NOT NULL AND deactivated_at < (now - grace)`
   형태로, 테넌트별 grace를 조인/계산한다. `FOR UPDATE SKIP LOCKED`로 잠근 행만 취득(FR-22).
2. 각 사용자에 대해 `usersService.delete()` 호출(멱등, 하드 삭제, cascade).
3. 삭제 건은 AuditLog(`USER_DELETED`, `metadata: { source: 'account_deletion_sweep' }`).

- `deactivated_at IS NOT NULL` 조건이 미인증 INACTIVE 계정을 자동 제외(FR-19).
- `ACCOUNT_SWEEP_LOCK_KEY`는 고정 bigint 상수.
- 단일 인스턴스 배포에서도 무해(락 획득 후 정상 수행).

## 6. 메일 (`common/mail/MailService`)

기존 `sendVerificationEmail`과 동일한 발신자/dev-redirect 규칙을 따른다.

- **신규** `sendPasswordResetEmail({ to, resetUrl, serviceName, brandColor, ttlSeconds })`.
- **신규** `sendAccountDeactivatedEmail({ to, serviceName, ... })`.
- **개선**: 현재 SMTP 미설정 시 조용히 로그만 남기고 성공처럼 끝난다. 재설정 요청이 발송 성공/실패/미설정을 구분해야 하므로, 발송 메서드가 결과를 판별 가능하게 한다(예: 미설정·전송예외를 명시적 실패로 신호). `verify-email` 등 기존 호출부는 실패를 "가입을 막지 않는" best-effort로 계속 처리(동작 불변).

## 7. 프론트엔드 (`apps/web`)

- 라우트 `/forgot-password` (`meta.layout: 'auth', public: true`): 이메일 입력 → `password-reset/request` 호출. 응답 상태(`sent` / `mail_delivery_failed`)에 따라 안내 문구 분기.
- 라우트 `/reset-password` (`meta.layout: 'auth', public: true`): 쿼리 `token`, `tenantSlug` 수신 → 새 비밀번호 입력 → `password-reset/confirm` 호출. `verify-email` 뷰와 동형.
- 로그인 페이지(`OAuthLoginView.vue`)에 "비밀번호를 잊으셨나요?" 링크 추가.
- OAuth 엔드포인트 호출은 별도 `axios.create()` 인스턴스 사용(401 관리자 로그아웃 트리거 방지 규칙 준수). 재설정 URL은 `email-verification.service.ts`의 `buildVerifyUrl`과 동일하게 `loginPageUrl` origin 기준으로 생성한다.
- 관리 UI(TenantSettings 편집)에 `accountDeletionGracePeriodDays` 입력 추가.

## 8. 설정 (`app.config.ts`)
- `app.passwordResetTtl` (기본 3600초). `.env` 예시(`PASSWORD_RESET_TTL`) 추가.

## 9. 보안·성능·운영 제약
- 재설정 토큰은 평문 저장 금지(sha256). 응답으로 토큰/URL을 반환하지 않는다.
- 두 공개 엔드포인트에 throttle 적용(무차별 요청·토큰 추측 완화).
- 재설정·비활성화 시 세션 토큰 폐기로 탈취 세션 잔존 방지.
- 삭제는 되돌릴 수 없으므로 유예기간·재활성화 취소로 오조작을 완충한다.
- 스윕은 advisory lock + SKIP LOCKED로 다중 인스턴스에서 중복/충돌 없이 동작.

## 10. 대안과 채택 근거
- **토큰 저장소**: `EmailVerificationToken` 재사용 대신 별도 `PasswordResetToken` 채택 — 목적·TTL·수명주기가 달라 의미 혼선을 피함.
- **스케줄러 중복 방지**: (a) 특정 레플리카만 크론 활성(env), (b) K8s CronJob→엔드포인트, (c) Postgres advisory lock. 앱 자족적이고 크래시 안전한 (c) 채택. (a)는 지정 인스턴스 장애 시 정지, (b)는 운영 설정 의존.
- **삭제 방식**: 소프트 삭제 대신 기존 하드 삭제 `delete()` 재사용 — 범위 최소화, 개인정보 완전 삭제 요건 부합.

## 11. 테스트 전략
- 재설정: request(계정 유무·인프라 정상/장애별 응답), confirm(유효/만료/사용완료/위조 토큰, 비밀번호 정책, 토큰 폐기), 열거 방지.
- 비활성화: `deactivatedAt` 기록·토큰 폐기·조건부 메일, `activate`/`unlock` 시 취소.
- 스윕: cutoff 경계, 테넌트별 유예기간, 미인증 INACTIVE 제외, advisory lock skip 경로.

## 12. 변경 파일 개요(예정)
- 신규: `password-reset-token.entity.ts`, `password-reset.service.ts`, `password-reset.controller.ts`(또는 `AuthorizeController`에 통합), `account-deletion-sweep.service.ts`, 마이그레이션 3건, 프론트 `ForgotPasswordView.vue`/`ResetPasswordView.vue`.
- 수정: `user.entity.ts`, `tenant-settings.entity.ts`, `users.service.ts`(deactivate/activate/unlock/delete 활용), `mail.service.ts`, `app.config.ts`, 라우터·로그인 뷰·테넌트 설정 UI, 엔티티 index barrel.
