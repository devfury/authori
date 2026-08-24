# 요구사항정의서 — 가입 승인 보류(거절) 및 일괄 승인/보류

- 작성일: 2026-08-25
- 작성자: Jinho Lee
- 상태: 초안 (승인 대기)

## 1. 문제 정의

승인 대기 알림 기능(`docs/requirements/2026-08-23-pending-approval-notify-requirements.md`)으로
관리자 승인 대기 가입자(`users.pendingApprovalSince IS NOT NULL`)를 식별하고 ezAria로 알리게 됐지만,
관리자가 취할 수 있는 조치는 **승인(활성화)뿐**이고 "거절"에 해당하는 동작이 없다.

- 현재 거절하려면 비활성화(`PATCH :id`)나 삭제(`DELETE :id`)를 유용해야 한다. 비활성화는 데이터상
  **탈퇴**(`deactivatedAt` 기록)와 구분되지 않고 감사 로그도 `USER.DEACTIVATED`로 남아 "가입 거절"
  의사가 어디에도 기록되지 않는다.
- 승인하지 않고 방치하면 해당 가입자가 **매일 09:00 다이제스트에 계속 집계**된다. "승인하지 않기로
  결정했다"를 표현할 방법이 없어 알림이 영구히 반복된다.
- 관리 UI 사용자 목록은 승인 대기 여부를 보여주지 않으며(API 응답에도 `pendingApprovalSince` 미노출),
  단건 활성화만 가능해 대기 건이 여러 개면 한 건씩 처리해야 한다.

## 2. 목표

- 관리자가 승인 대기 가입자를 **보류(거절)** 처리할 수 있다. 보류된 사용자는 INACTIVE를 유지하되
  더 이상 승인 대기로 집계되지 않아 즉시 알림·다이제스트 대상에서 빠진다.
- 보류는 탈퇴·이메일 인증 대기와 데이터상 구분되고, 감사 로그에 전용 액션으로 기록된다.
- 관리 UI 사용자 목록에서 승인 대기/보류 상태를 확인하고, **여러 명을 멀티선택해 일괄 승인(활성화)
  또는 일괄 보류**할 수 있다.

## 3. 사용자·역할 범위

| 역할 | 관련 동작 |
|---|---|
| 엔드유저(가입자) | 대상. 보류 처리돼도 별도 안내를 받지 않으며 로그인 시 기존과 동일하게 비활성 계정으로 거부된다. |
| 테넌트 관리자(TENANT_ADMIN) | 자기 테넌트 사용자의 단건/일괄 승인·보류 |
| 플랫폼 관리자(PLATFORM_ADMIN) | 모든 테넌트에 대해 위 동작 수행 |

## 4. 기능 요구사항

### 보류(거절) 상태

| ID | 요구사항 |
|----|----------|
| FR-1 | `users` 테이블에 `approvalHeldAt`(timestamptz, nullable) 컬럼을 추가한다. 보류 처리 시각을 기록하며, 기존 사용자는 `NULL`로 마이그레이션한다. |
| FR-2 | 보류 처리 시 `approvalHeldAt = now()`를 기록한다. `pendingApprovalSince`는 지우지 않고 보존해 "언제 가입 신청했는지" 이력을 유지한다. `status`는 INACTIVE 그대로 두고 `deactivatedAt`은 건드리지 않는다. |
| FR-3 | 승인 대기 집계(`PendingApprovalNotifierService.countPending`)에 `approvalHeldAt IS NULL` 조건을 추가한다. 보류된 사용자는 즉시 알림·일일 다이제스트 어디에도 집계되지 않는다. |
| FR-4 | 보류는 승인 대기 사용자(INACTIVE ∧ `pendingApprovalSince IS NOT NULL` ∧ `deactivatedAt IS NULL` ∧ `approvalHeldAt IS NULL`)에게만 허용한다. 조건에 맞지 않으면 409로 거부한다. |
| FR-5 | 보류된 사용자를 되돌리는 방법은 기존 **활성화**뿐이다. 활성화 시 `approvalHeldAt`과 `pendingApprovalSince`를 모두 `NULL`로 지운다. 별도 "보류 해제(대기 복귀)" 기능은 만들지 않는다. |
| FR-6 | 보류 시 감사 로그에 전용 액션 `USER.APPROVAL_HELD`를 기록한다(audit_logs action ENUM에 값 추가 마이그레이션 포함). 관리자가 선택적으로 입력한 사유(자유 텍스트)는 감사 로그 `metadata.reason`에만 저장하고 users 테이블에는 저장하지 않는다. |
| FR-7 | 이 기능으로 INACTIVE의 네 가지 의미를 데이터로 구분한다: 승인 대기(`pendingApprovalSince` 有, `approvalHeldAt` 無), 보류(`approvalHeldAt` 有), 이메일 인증 대기(둘 다 無, `deactivatedAt` 無), 탈퇴(`deactivatedAt` 有). |

### API

| ID | 요구사항 |
|----|----------|
| FR-8 | 단건 보류 엔드포인트 `POST /admin/tenants/:tenantId/users/:id/hold`를 추가한다. body로 선택적 `reason`을 받는다. |
| FR-9 | 일괄 엔드포인트 `POST .../users/bulk/activate`와 `POST .../users/bulk/hold`를 추가한다. body는 `{ userIds: string[] }`(hold는 선택적 `reason` 포함), 최대 100건. |
| FR-10 | 일괄 처리는 **부분 성공** 방식이다: 건별로 처리하고 `{ succeeded: string[], failed: { userId, reason }[] }` 형태로 결과를 반환한다. 한 건의 실패가 나머지를 중단시키지 않는다. |
| FR-11 | 일괄 활성화는 기존 단건 `activate()`와 동일한 규칙(상태 전환, 표식 해제, 건별 `USER.ACTIVATED` 감사 로그)을 따른다. 일괄 보류는 FR-4의 대상 조건을 건별로 검사하고 건별 `USER.APPROVAL_HELD`를 남긴다. |
| FR-12 | 사용자 목록/단건 조회 API 응답에 `pendingApprovalSince`, `approvalHeldAt`을 포함한다. 목록 API에 승인 대기 필터(`pending=true` 쿼리 파라미터: INACTIVE ∧ 대기 표식 有 ∧ 보류·탈퇴 아님)를 추가한다. |

### 관리 UI

| ID | 요구사항 |
|----|----------|
| FR-13 | 사용자 목록(`UserListView.vue`) 상태 컬럼에 승인 대기(예: 노란색 "승인 대기")·보류(예: 회색 "보류") 배지를 기존 상태 배지와 함께 표시한다. |
| FR-14 | 상태 필터에 "승인 대기" 항목을 추가한다(FR-12의 `pending=true` 필터 사용). |
| FR-15 | 목록에 행 체크박스와 전체선택 체크박스를 추가한다. 1건 이상 선택 시 "선택 승인"·"선택 보류" 버튼이 활성화된다. |
| FR-16 | 선택 승인/보류 실행 전 확인 다이얼로그를 표시한다(선택 건수 명시, 보류는 사유 입력란 포함). 실행 후 성공/실패 건수를 표시하고 목록을 새로고침한다. |
| FR-17 | 승인은 선택된 사용자 중 INACTIVE 사용자에게, 보류는 승인 대기 사용자에게만 적용된다. 조건에 맞지 않는 선택 건은 실패 목록으로 응답에 표시된다. |
| FR-18 | 사용자 상세(`UserDetailView.vue`)에 승인 대기/보류 상태와 시각을 표시하고, 승인 대기 사용자에게는 단건 "보류" 버튼(사유 입력 포함)을 제공한다. |

## 5. 비기능 요구사항

- **하위호환**: 기존 사용자·기존 API 동작은 변하지 않는다. `approvalHeldAt`은 전원 `NULL`로 시작하므로 집계 결과도 마이그레이션 직후 동일하다.
- **권한**: 새 엔드포인트는 모두 기존 `TenantAdminGuard`를 그대로 사용한다.
- **일괄 처리 크기**: `userIds`는 1~100건으로 제한하고 초과 시 400으로 거부한다.
- **감사 추적**: 일괄 처리도 감사 로그는 건별로 남긴다(하나의 벌크 액션으로 뭉치지 않음). 동일 요청임을 추적할 수 있도록 기존 `requestId`가 각 로그에 포함된다.
- **개인정보**: 보류 사유는 감사 로그에만 저장되므로 기존 감사 로그 접근 권한 체계를 그대로 따른다.

## 6. 제외 범위 (Out of Scope)

- 보류 해제(승인 대기로 복귀) 전용 액션 — 활성화로 갈음한다.
- 보류 처리 시 가입자 본인에게 이메일 등 안내 발송.
- 보류된 가입자의 자동 삭제·보존 기한 정책.
- 보류 사유의 users 테이블 저장 및 상세 화면 상시 노출(감사 로그에서 조회).
- 일괄 비활성화·일괄 삭제 등 승인/보류 이외의 일괄 액션.
- ezAria 알림 메시지 형식 변경(집계 조건만 변경).

## 7. 성공 기준

- 승인 대기 사용자를 보류 처리하면 즉시 `countPending` 집계에서 빠지고, 다음 날 09:00 다이제스트에도 나타나지 않는다.
- 보류된 사용자는 목록에서 "보류" 배지로 표시되고, 탈퇴 사용자·이메일 인증 대기 사용자와 데이터로 구분된다.
- 보류 시 감사 로그에 `USER.APPROVAL_HELD`가 남고 입력한 사유가 metadata에 포함된다.
- 목록에서 승인 대기 필터로 대기자만 조회한 뒤 전체선택 → 일괄 승인하면 전원 ACTIVE가 되고 표식이 해제된다.
- 일괄 요청에 조건 불일치 건이 섞여 있어도 나머지는 처리되고, 실패 건과 사유가 응답·화면에 표시된다.
- 보류된 사용자를 활성화하면 정상 로그인이 가능하고 두 표식이 모두 해제된다.
- `bun run lint && bun run typecheck && bun run test && bun run build` 통과.

## 8. 관련 문서

- 선행: `docs/requirements/2026-08-23-pending-approval-notify-requirements.md`
- 설계: `docs/specs/2026-08-25-user-approval-hold-spec.md` (2단계에서 작성)
- 계획: `docs/plans/2026-08-25-user-approval-hold-plan.md` (2단계에서 작성)
