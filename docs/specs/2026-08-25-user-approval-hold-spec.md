# 개발설계서 — 가입 승인 보류(거절) 및 일괄 승인/보류

- 작성일: 2026-08-25
- 작성자: Jinho Lee
- 관련 요구사항: [2026-08-25-user-approval-hold-requirements.md](../requirements/2026-08-25-user-approval-hold-requirements.md)

## 1. 범위

관리자 승인 대기 가입자를 **보류(거절)** 처리하는 단건/일괄 API와, 사용자 목록에서 멀티선택으로
**일괄 승인(활성화)/일괄 보류**하는 관리 UI를 추가한다. 보류된 사용자는 INACTIVE를 유지하되 승인 대기
집계에서 제외돼 즉시 알림·일일 다이제스트를 더 이상 발생시키지 않는다.

비범위: 보류 해제(대기 복귀) 전용 액션, 가입자 안내 발송, 보류자 자동 삭제 정책, 승인/보류 외 일괄
액션, ezAria 메시지 형식 변경.

## 2. 아키텍처

```
[관리 UI UserListView]
   ├─ GET  /admin/tenants/:tid/users?pending=true      ← 승인 대기 필터
   ├─ POST /admin/tenants/:tid/users/bulk/activate     ← 멀티선택 일괄 승인
   │        { userIds[] }
   └─ POST /admin/tenants/:tid/users/bulk/hold         ← 멀티선택 일괄 보류
            { userIds[], reason? }
[관리 UI UserDetailView]
   └─ POST /admin/tenants/:tid/users/:id/hold          ← 단건 보류
            { reason? }

UsersService
   ├─ hold(): 대상 검증 → approvalHeldAt=now() → AuditLog USER.APPROVAL_HELD(metadata.reason)
   ├─ bulkActivate()/bulkHold(): 건별 루프 → 부분 성공 결과 { succeeded, failed }
   └─ activate(): approvalHeldAt·pendingApprovalSince 모두 해제 (기존 + 1줄)

PendingApprovalNotifierService.countPending()
   └─ ... AND approval_held_at IS NULL                 ← 집계 조건 1개 추가
```

새 모듈·새 서비스 없이 기존 `users/` 모듈과 `common/notification/`의 집계 쿼리만 확장한다.

### 채택 근거 (대안 비교)

| 대안 | 판단 |
|---|---|
| **A. `approval_held_at` 컬럼 1개 추가 (채택)** | 기존 표식(`pendingApprovalSince`·`deactivatedAt`)과 같은 timestamp-표식 패턴. 신청 이력 보존, 집계 조건 1개 추가로 끝난다. |
| B. `pendingApprovalSince`를 NULL로 지워 보류 표현 | 컬럼 추가는 없지만 보류가 "이메일 인증 대기"와 구분 불가 → 요구사항 FR-7 위반. |
| C. `UserStatus`에 HELD 상태 추가 | 상태 머신·기존 status 분기(로그인 거부, 필터, 배지) 전면 영향. 과도하다. |

## 3. 데이터 모델

### 3.1 `users` (컬럼 추가)

| 컬럼 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `approval_held_at` | timestamptz | `NULL` | 가입 승인 보류 시각. 보류 시 기록, 활성화 시 `NULL` |

- `pendingApprovalSince`는 보류 시 **지우지 않는다**(신청 시점 이력 보존).
- INACTIVE 구분 규칙(판정 순서): `deactivatedAt` 有 → **탈퇴** / `approvalHeldAt` 有 → **보류** /
  `pendingApprovalSince` 有 → **승인 대기** / 모두 無 → **이메일 인증 대기(또는 관리자 생성)**.

### 3.2 `audit_logs` (ENUM 값 추가)

`AuditAction.USER_APPROVAL_HELD = 'USER.APPROVAL_HELD'`. TS enum과 DB ENUM
(`audit_logs_action_enum`)을 **같은 마이그레이션에서 함께** 추가한다
(`1781000100000-AddNotifyTestSentAuditAction`에서 DB ENUM 누락으로 22P02가 났던 전례 반영).

### 3.3 마이그레이션

`1781100000000-AddUserApprovalHold.ts` 1개:

```sql
ALTER TABLE "users" ADD COLUMN "approval_held_at" timestamptz;                        -- up
ALTER TYPE "public"."audit_logs_action_enum" ADD VALUE IF NOT EXISTS 'USER.APPROVAL_HELD';
-- down: ALTER TABLE "users" DROP COLUMN "approval_held_at" (ENUM 값 제거는 PG 미지원 → no-op)
```

백필 없음(기존 사용자 전원 `NULL` = 보류 아님 → 집계 결과 불변).

## 4. API 설계

모두 기존 `UsersController`(`admin/tenants/:tenantId/users`, `TenantAdminGuard`)에 추가한다.
**Nest는 선언 순서대로 라우트를 매칭하므로 `bulk/*` 라우트를 `:id/*` 라우트보다 위에 선언한다**
(`POST bulk/hold`가 `:id/hold`의 `id='bulk'`로 잡히는 것 방지).

### 4.1 `POST .../users/:id/hold` — 단건 보류

- Body: `HoldUserDto { reason?: string }` (`@IsOptional @IsString @MaxLength(500)`)
- 204 No Content. 대상 조건 위반 시 409 `not_pending_approval`, 미존재 시 404.
- 대상 조건(FR-4): `status=INACTIVE ∧ pendingApprovalSince≠NULL ∧ deactivatedAt=NULL ∧ approvalHeldAt=NULL`
- 처리: `approvalHeldAt=now()` 저장 → 감사 로그 `USER.APPROVAL_HELD`, `metadata: { email, reason? }`
  (reason은 값이 있을 때만 포함).

### 4.2 `POST .../users/bulk/activate` — 일괄 승인

- Body: `BulkActivateUsersDto { userIds: string[] }`
  (`@IsArray @ArrayMinSize(1) @ArrayMaxSize(100) @IsUUID(undefined, { each: true })`)
- 200:

```json
{ "succeeded": ["<userId>"], "failed": [{ "userId": "<userId>", "reason": "not_inactive" }] }
```

- 건별 처리: `status=INACTIVE`가 아니면 `not_inactive`, 미존재면 `not_found`로 실패 목록에 넣고
  계속 진행한다. 성공 건은 기존 단건 `activate()`와 동일 규칙(ACTIVE 전환, `deactivatedAt`·
  `pendingApprovalSince`·`approvalHeldAt` 해제, 건별 `USER.ACTIVATED` 감사 로그).
- 기존 단건 `activate()`는 상태 검증 없이 동작하는 현행 그대로 두고(하위호환), 검증은 bulk에서만 한다.

### 4.3 `POST .../users/bulk/hold` — 일괄 보류

- Body: `BulkHoldUsersDto { userIds: string[], reason?: string }` (제약은 4.1·4.2와 동일)
- 200: 4.2와 같은 형태. 건별로 4.1의 대상 조건을 검사해 위반 시 `not_pending_approval`/`not_found`.
- `reason`은 모든 성공 건의 감사 로그 metadata에 동일하게 기록한다.

### 4.4 `GET .../users` — 승인 대기 필터·표식 노출

- 쿼리 파라미터 `pending=true` 추가: `status=INACTIVE ∧ pendingApprovalSince≠NULL ∧
  deactivatedAt=NULL ∧ approvalHeldAt=NULL` 조건으로 필터. `status` 파라미터와 함께 오면
  `pending`이 우선한다(UI에서는 동시에 보내지 않음).
- 응답 항목에 `pendingApprovalSince`, `approvalHeldAt`, `deactivatedAt` 포함
  (엔티티 컬럼이므로 별도 직렬화 작업 없음 — 웹 타입 정의에만 추가).

### 4.5 서비스 시그니처

```ts
// users.service.ts
hold(tenantId, id, reason: string | null, ctx?: AuditContext): Promise<void>
bulkActivate(tenantId, userIds: string[], ctx?: AuditContext): Promise<BulkUserActionResult>
bulkHold(tenantId, userIds: string[], reason: string | null, ctx?: AuditContext): Promise<BulkUserActionResult>

export interface BulkUserActionResult {
  succeeded: string[];
  failed: { userId: string; reason: string }[];
}
```

bulk 메서드는 단건 메서드를 건별 `try/catch`로 호출하는 루프다(최대 100건, 트랜잭션으로 묶지 않음
— 부분 성공이 요구사항이고 감사 로그는 커밋 후 기록 원칙 유지). 중복 `userIds`는 사전에 제거한다.

## 5. 알림 집계 변경

`PendingApprovalNotifierService.countPending()`의 base 쿼리에 1개 조건 추가:

```ts
.andWhere('u.approvalHeldAt IS NULL')
```

즉시 알림(`notifyNewPending`)·다이제스트 모두 이 집계를 쓰므로 이 한 곳이면 충분하다.
주석의 "구분" 설명도 4가지 의미(대기/보류/인증 대기/탈퇴)로 갱신한다.

## 6. UI/UX 설계

### 6.1 `UserListView.vue` — 멀티선택·배지·필터

- **체크박스**: 테이블 첫 컬럼에 행 체크박스, 헤더에 현재 페이지 전체선택 체크박스.
  선택 상태는 `Set<string>`(userId). 페이지 이동·필터 변경·새로고침 시 선택을 비운다.
- **일괄 액션 바**: 1건 이상 선택 시 헤더 아래에 "N명 선택됨 · [선택 승인] [선택 보류]" 바 표시.
  - 선택 승인 → `ConfirmDialog`(건수 명시) → `bulkActivate`.
  - 선택 보류 → 신규 `HoldUsersDialog.vue`(건수 명시 + 선택 사유 textarea, `ChangePasswordDialog`
    패턴) → `bulkHold`.
  - 응답 후 "승인 N건 완료, M건 실패" 요약을 표시하고(실패 건은 `userId→email` 매핑해 사유와 함께
    나열) 목록을 새로고침한다.
- **배지**: 상태 컬럼에서 기존 `StatusBadge` 옆에 보조 배지를 함께 표시.
  `approvalHeldAt` 有 → "보류", 그 외 `status=INACTIVE ∧ pendingApprovalSince 有 ∧ deactivatedAt 無`
  → "승인 대기". `StatusBadge.vue`의 map에 `PENDING_APPROVAL`(yellow)·`APPROVAL_HELD`(orange) 키를
  추가하고 뷰에서 계산한 키를 넘긴다.
- **필터**: 상태 select에 "승인 대기" 옵션(값 `PENDING`) 추가. 선택 시 `status` 대신
  `pending=true`로 조회한다. URL 쿼리(`status=PENDING`) 동기화 및 `normalizeStatusFilter` 갱신.

### 6.2 `UserDetailView.vue` — 단건 보류

- 상태 영역에 승인 대기/보류 배지와 시각(`pendingApprovalSince`, `approvalHeldAt`)을 표시.
- 승인 대기 상태(위 배지 조건)일 때만 "가입 보류" 버튼을 노출 → `HoldUsersDialog`(단건 모드,
  이메일 명시 + 사유 입력) → `POST :id/hold` → 재조회.

### 6.3 `api/users.ts`

- `User`에 `pendingApprovalSince: string | null`, `approvalHeldAt: string | null`,
  `deactivatedAt: string | null` 추가.
- `UserListQuery`에 `pending?: boolean` 추가.
- 메서드 추가: `hold(tenantId, userId, reason?)`, `bulkActivate(tenantId, userIds)`,
  `bulkHold(tenantId, userIds, reason?)` + `BulkUserActionResult` 타입.

## 7. 보안·성능 제약

- 새 엔드포인트는 전부 기존 `TenantAdminGuard` 사용 — 자기 테넌트 사용자에게만 동작한다.
- `userIds` 1~100건 제한(class-validator), 중복 제거. 건별 루프 최대 100회 조회+저장으로 충분히 작다.
- 보류 사유는 감사 로그 metadata에만 저장(JSONB) — 기존 감사 로그 접근 통제를 그대로 따른다.
- 감사 로그는 건별 기록이며 동일 요청 추적은 기존 `requestId`로 한다.

## 8. 테스트 설계

| 파일 | 케이스 |
|---|---|
| `users/users.service.spec.ts` (확장) | hold: 정상(표식·감사 로그·reason metadata) / 대기 아님 409 / 이미 보류 409 / 탈퇴자 409. activate: 두 표식 해제. bulkActivate: 부분 성공(성공+`not_inactive`+`not_found` 혼합), 중복 ID 제거. bulkHold: 부분 성공, reason 전파 |
| `common/notification/pending-approval-notifier.service.spec.ts` (확장) | 보류된 사용자가 `countPending` 집계에서 제외되는지 |
| `users/users.controller` 관련 | bulk 라우트가 `:id` 라우트보다 먼저 매칭되는지는 e2e 성격이라 단위 테스트 제외(선언 순서로 보장, 코드 리뷰 항목) |

## 9. 관련 문서

- 요구사항: `docs/requirements/2026-08-25-user-approval-hold-requirements.md`
- 계획: `docs/plans/2026-08-25-user-approval-hold-plan.md`
- 선행 기능: `docs/specs/2026-08-23-pending-approval-notify-spec.md`
