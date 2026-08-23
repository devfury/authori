# 개발설계서 — 승인 대기 신규 가입자 ezAria 알림

- 작성일: 2026-08-23
- 작성자: Jinho Lee
- 관련 요구사항: [2026-08-23-pending-approval-notify-requirements.md](../requirements/2026-08-23-pending-approval-notify-requirements.md)

## 1. 범위

관리자 승인이 필요한 신규 가입(공개 회원가입 + 자동 활성화 OFF + 이메일 인증 OFF)이 발생했을 때
테넌트별 ezAria 채팅방으로 (1) 가입 즉시 알림과 (2) 매일 09:00 잔량 다이제스트를 발송한다.

비범위: 이메일 인증 미완료 독촉, 관리자 생성 INACTIVE 알림, ezAria 외 채널, outbox·재시도 워커,
테넌트별 알림 시각 커스터마이징, 알림 내 승인 인터랙션.

## 2. 아키텍처

```
[POST /t/:slug/oauth/register]
        │
   AuthorizeService.register()
        ├─ UsersService.create(initialStatus=INACTIVE)
        ├─ users.pending_approval_since = now()        ← 승인 대기 표식
        └─ (best-effort) PendingApprovalNotifierService.notifyNewPending()
                              │
                              ├─ TenantSettings 조회 (enabled / ezariaChatRoomId)
                              ├─ 대기 건수 집계
                              └─ EzariaClient.send(chatRoomId, content)  → ezAria Bot API

[@Cron 09:00 Asia/Seoul]
   PendingApprovalDigestService.run()
        ├─ pg_try_advisory_xact_lock (중복 인스턴스 차단)
        ├─ 알림 켜진 테넌트별 대기 집계 (1건 이상만)
        └─ PendingApprovalNotifierService.notifyDigest() → EzariaClient.send()
```

`common/notification/` 모듈은 `MailModule`과 같은 `@Global()` 모듈로 등록해 `AuthorizeModule`에서
추가 import 없이 주입한다. 외부 HTTP 호출은 `EzariaClient` 한 곳으로 좁혀 단위 테스트에서 모킹한다.

### 채택 근거 (대안 비교)

| 대안 | 판단 |
|---|---|
| **A. 서비스 직접 호출 (채택)** | 부품 최소, 기존 `MailService` best-effort 패턴과 동일. 채널이 1개인 현 시점에 가장 단순하다. |
| B. `EventEmitter2` 도메인 이벤트 | 채널 확장에 유연하나 채널이 1개인 지금은 간접 계층만 늘고 추적이 어려워진다. |
| C. 알림 outbox 테이블 + 재시도 워커 | 전달 보장은 되지만 무겁다. 일일 다이제스트가 유실 백스톱이라 불필요하다. |

## 3. 데이터 모델

### 3.1 `tenant_settings` (컬럼 추가)

| 컬럼 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `pending_approval_notify_enabled` | boolean | `false` | 승인 대기 알림 사용 여부 |
| `ezaria_chat_room_id` | varchar(128) | `NULL` | 수신 ezAria 채팅방 ID |

### 3.2 `users` (컬럼 추가)

| 컬럼 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `pending_approval_since` | timestamptz | `NULL` | 관리자 승인 대기 시작 시각. 승인 대기 INACTIVE로 가입될 때 기록, 활성화 시 `NULL` |

이 컬럼이 `status=INACTIVE`의 세 가지 의미(관리자 승인 대기 / 이메일 인증 대기 / 탈퇴)를 구분한다.
탈퇴는 기존 `deactivated_at`으로 이미 구분되며, 집계 조건에 두 컬럼을 함께 사용한다.

### 3.3 마이그레이션 `1781000000000-AddPendingApprovalNotify.ts`

1. `tenant_settings`에 두 컬럼 추가.
2. `users`에 `pending_approval_since` 추가.
3. 기존 승인 대기 사용자 백필 — 이메일 인증이 꺼진 테넌트의 `status='INACTIVE' AND deactivated_at IS NULL`
   사용자에 `created_at`을 채운다. 첫 다이제스트부터 누락 없이 집계된다.
4. 집계 성능을 위한 부분 인덱스
   `IDX_users_pending_approval (tenant_id, pending_approval_since) WHERE pending_approval_since IS NOT NULL`.
5. `down()`은 인덱스·컬럼을 역순 제거.

## 4. 설정

### 4.1 환경변수 (`apps/api/src/common/config/app.config.ts`)

| 변수 | 기본값 | 설명 |
|---|---|---|
| `EZARIA_BOT_TOKEN` | `''` | ezAria 봇 토큰. 비어 있으면 발송하지 않고 로그만 남긴다 |
| `EZARIA_BOT_BASE_URL` | `https://aria.ezcaretech.com:13443/v1/bot/send` | 봇 전송 엔드포인트 base |
| `EZARIA_SEND_TIMEOUT_MS` | `5000` | 전송 타임아웃 |
| `ADMIN_BASE_URL` | `LOGIN_PAGE_URL`의 origin | 알림 링크에 사용할 관리 UI base URL |

`app.ezaria = { botToken, baseUrl, timeoutMs }`, `app.adminBaseUrl` 로 노출한다. 토큰은 로그·응답에 넣지 않는다.

### 4.2 테넌트 설정 API

기존 `PATCH /admin/tenants/:id`(`PlatformAdminGuard`)의 `settings`에 두 필드를 추가한다.
현 저장소의 테넌트 설정 편집은 플랫폼 관리자 전용이므로 알림 설정도 동일한 권한 범위를 따른다
(요구사항 FR-12/13의 역할 표에서 테넌트 관리자 편집은 기존 엔드포인트 구조상 이번 범위에서 제외).

`CreateTenantSettingsDto` 추가 필드:

```ts
@IsOptional() @IsBoolean()  pendingApprovalNotifyEnabled?: boolean;
@IsOptional() @IsString() @MaxLength(128)  ezariaChatRoomId?: string;
```

### 4.3 테스트 발송 API

```
POST /admin/tenants/:id/notify-test        (PlatformAdminGuard)
200 { "sent": true }
200 { "sent": false, "reason": "notify_disabled" | "chat_room_not_set" | "bot_not_configured" | "send_failed" }
```

성공/실패 모두 감사 로그 `NOTIFY.TEST_SENT`(신규 `AuditAction`)를 남기고 `metadata`에 `sent`/`reason`을 기록한다.
채팅방 ID 오타를 저장 전에 확인할 수 있게 하는 것이 목적이므로 `sent=false`도 4xx가 아닌 200으로 반환한다.

## 5. 컴포넌트 설계

### 5.1 `common/notification/ezaria.client.ts`

```ts
@Injectable()
export class EzariaClient {
  get isConfigured(): boolean;                       // botToken 존재 여부
  async send(chatRoomId: string, content: string): Promise<void>;  // 실패 시 throw
}
```

- `POST {baseUrl}/{botToken}`, body `{ chatRoomId, content }`, `Content-Type: application/json`.
- `AbortSignal.timeout(timeoutMs)`로 타임아웃. 비-2xx는 상태코드와 본문 앞부분을 담아 `Error`.
- 로그에는 `chatRoomId`와 상태만 남기고 **토큰은 절대 출력하지 않는다**(URL 전체 로깅 금지).

### 5.2 `common/notification/mask.util.ts`

`maskEmail('jinho@ez.com') → 'j***@ez.com'`. 로컬파트 1자 이하면 `***@ez.com`, `@`가 없으면 앞 1자만 남긴다.

### 5.3 `common/notification/pending-approval-notifier.service.ts`

```ts
async notifyNewPending(tenantId: string, user: { email: string; createdAt: Date }): Promise<void>
async notifyDigest(tenantId: string, now?: Date): Promise<void>   // 내부에서 집계, 0건이면 발송 생략
async sendTest(tenantId: string): Promise<{ sent: boolean; reason?: string }>
async countPending(tenantId: string): Promise<PendingApprovalStat>   // { count, oldestSince, latestSince, oldestEmail }
```

- 공통 게이트: `EzariaClient.isConfigured` ∧ `settings.pendingApprovalNotifyEnabled` ∧ `settings.ezariaChatRoomId`.
  하나라도 없으면 `debug` 로그만 남기고 반환(SMTP 미설정 폴백과 동일).
- `notifyNewPending`/`notifyDigest`는 내부에서 예외를 잡아 `error` 로그만 남긴다(호출자에게 전파하지 않음).
  `sendTest`는 결과를 `{sent, reason}`으로 돌려준다.
- 시각 표기는 `Asia/Seoul` 기준 `YYYY-MM-DD HH:mm` 포맷 헬퍼로 통일한다.

### 5.4 메시지 형식

가입 즉시:

```
🔔 [Acme] 신규 가입 승인 대기
- 가입자: j***@ez.com
- 가입: 2026-08-23 14:03 (KST)
- 현재 승인 대기: 총 3건
- 승인 화면: https://admin.example.com/admin/tenants/<tenantId>/users
```

일일 다이제스트:

```
🔔 [Acme] 승인 대기 사용자 3건
- 최장 대기: 5일 경과 (j***@ez.com)
- 최근 가입: 2026-08-23 14:03 (KST)
- 승인 화면: https://admin.example.com/admin/tenants/<tenantId>/users
```

테스트 발송:

```
🔔 [Acme] ezAria 알림 테스트
- 이 채팅방으로 승인 대기 알림이 발송됩니다.
```

### 5.5 `common/notification/pending-approval-digest.service.ts`

```ts
@Cron('0 0 9 * * *', { timeZone: 'Asia/Seoul' })
async run(): Promise<void>
```

- `AccountDeletionSweepService`와 동일하게 `dataSource.transaction` 안에서
  `SELECT pg_try_advisory_xact_lock($1)`(전용 키 `481924`)을 잡고, 실패하면 skip.
- 아래 집계 쿼리로 **후보 테넌트만** 한 번에 좁힌 뒤(알림 ON + 채팅방 설정 + 대기 1건 이상),
  테넌트별로 `notifyDigest(tenantId)`를 호출한다. 건수·최장 대기·최근 가입 집계는 알림 서비스의
  `countPending()`이 담당해 가입 즉시 알림과 같은 코드 경로를 쓴다.
- `notifyDigest()`가 내부에서 예외를 삼키므로 한 테넌트 실패가 나머지 테넌트를 멈추지 않는다.

집계 쿼리:

```sql
SELECT u.tenant_id, COUNT(*) AS cnt,
       MIN(u.pending_approval_since) AS oldest,
       MAX(u.pending_approval_since) AS latest
FROM users u
JOIN tenant_settings ts ON ts.tenant_id = u.tenant_id
WHERE u.status = 'INACTIVE'
  AND u.deactivated_at IS NULL
  AND u.pending_approval_since IS NOT NULL
  AND ts.pending_approval_notify_enabled = true
  AND ts.ezaria_chat_room_id IS NOT NULL
GROUP BY u.tenant_id
```

### 5.6 가입 경로 변경 (`oauth/authorize/authorize.service.ts`)

`register()`에서 `emailVerificationRequired === false && initialStatus === INACTIVE` 인 경우에만:

1. `userRepo.update({ id }, { pendingApprovalSince: new Date() })`
2. `try { await notifier.notifyNewPending(...) } catch { logger.error(...) }`

`CreateUserDto`에는 표식 필드를 추가하지 않는다. 관리자용 사용자 생성 API로 승인 대기 표식이 새는 것을 막기 위해
표식은 공개 가입 경로에서만 기록한다.

### 5.7 활성화 시 표식 해제 (`users/users.service.ts`)

`activate()`에서 `status = ACTIVE`, `deactivatedAt = null`과 함께 `pendingApprovalSince = null`로 지운다.
`EmailVerificationService.confirm()` 경로는 애초에 표식이 없어 변경하지 않는다.

## 6. 프론트엔드 설계

- `apps/web/src/api/tenants.ts`
  - `TenantSettings`/`UpdateTenantPayload.settings`에 `pendingApprovalNotifyEnabled`, `ezariaChatRoomId` 추가.
  - `notifyTest(id)` → `POST /admin/tenants/:id/notify-test`, 응답 `{ sent, reason? }`.
- `apps/web/src/views/platform/tenants/TenantDetailView.vue`
  - "메일 설정" 아래에 **ezAria 알림** 섹션 추가: 사용 토글, 채팅방 ID 입력, `테스트 발송` 버튼.
  - 토글이 꺼져 있으면 채팅방 ID 입력과 테스트 버튼을 `disabled` 처리한다.
  - 테스트 결과는 기존 `successMsg`/`error`와 별도 상태로 표시하고, `reason`을 한국어 문구로 매핑한다.
  - 저장 payload에 두 필드를 포함한다(빈 문자열은 `null` 저장을 의미).

## 7. 보안·성능·운영 제약

- **비밀정보**: 봇 토큰은 `.env` 전용. 로그·API 응답·프론트로 노출하지 않는다.
- **개인정보**: 알림 본문에는 마스킹 이메일만 넣는다. 프로필 값은 넣지 않는다.
- **가입 경로 지연**: 알림은 가입 응답 직전 best-effort 호출이며 5초 타임아웃으로 상한이 고정된다.
- **중복 발송**: 다이제스트는 advisory lock으로 인스턴스 간 1회 실행을 보장한다.
- **성능**: 집계는 부분 인덱스를 사용하며 테넌트 수 만큼의 발송만 발생한다.
- **기본 비활성**: 신규/기존 테넌트 모두 기본 `false`이므로 미설정 환경의 동작은 바뀌지 않는다.

## 8. 테스트 설계

| 대상 | 검증 |
|---|---|
| `mask.util` | 일반/1자 로컬파트/`@` 없는 값 |
| `EzariaClient` | 정상 전송 payload, 비-2xx 시 throw, 토큰 미로깅, 미설정 시 `isConfigured=false` |
| `PendingApprovalNotifierService` | 비활성/방 미설정/봇 미설정 시 no-op, 메시지 본문에 마스킹 이메일·건수·링크 포함, 전송 실패 시 예외 미전파, `sendTest` reason 매핑 |
| `PendingApprovalDigestService` | 락 미획득 시 skip, 0건 테넌트 침묵, 집계값 전달, 테넌트 1건 실패 시 나머지 계속 |
| `AuthorizeService.register` | 승인 대기 케이스에서 표식 기록 + 알림 호출, 이메일 인증/자동 활성화 케이스에서 미호출, 알림 실패가 가입 성공을 막지 않음 |
| `UsersService.activate` | `pendingApprovalSince`가 `null`로 초기화됨 |
| 테넌트 설정 | 두 필드 저장/조회, 테스트 발송 엔드포인트 응답 shape |
