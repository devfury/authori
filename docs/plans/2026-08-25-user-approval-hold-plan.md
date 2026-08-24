# 개발계획서 — 가입 승인 보류(거절) 및 일괄 승인/보류

- 작성일: 2026-08-25
- 작성자: Jinho Lee
- 관련 문서: [요구사항정의서](../requirements/2026-08-25-user-approval-hold-requirements.md) · [개발설계서](../specs/2026-08-25-user-approval-hold-spec.md)

## Goal

승인 대기 가입자를 보류(거절) 처리하는 단건/일괄 API와 사용자 목록 멀티선택 일괄 승인/보류 UI를
추가한다. 보류된 사용자는 ezAria 즉시 알림·일일 다이제스트 집계에서 제외된다.

## 변경 파일 목록

### Backend (`apps/api`)

| 파일 | 변경 |
|---|---|
| `src/database/entities/user.entity.ts` | `approvalHeldAt` 컬럼 추가, INACTIVE 구분 주석 갱신 |
| `src/database/entities/audit-log.entity.ts` | `USER_APPROVAL_HELD` 액션 추가 |
| `src/database/migrations/1781100000000-AddUserApprovalHold.ts` | 신규 — 컬럼 + audit ENUM 값 |
| `src/users/dto/hold-user.dto.ts` | 신규 — `HoldUserDto` |
| `src/users/dto/bulk-users.dto.ts` | 신규 — `BulkActivateUsersDto`, `BulkHoldUsersDto` |
| `src/users/users.service.ts` | `hold()`·`bulkActivate()`·`bulkHold()` 추가, `activate()`에 표식 해제, `findAll()`에 `pending` 필터 |
| `src/users/users.controller.ts` | `POST bulk/activate`·`POST bulk/hold`(`:id` 라우트보다 위 선언)·`POST :id/hold`, `GET`에 `pending` 쿼리 |
| `src/common/notification/pending-approval-notifier.service.ts` | `countPending()`에 `approvalHeldAt IS NULL` 조건 |
| `src/users/users.service.spec.ts` | hold/bulk/activate 해제 테스트 |
| `src/common/notification/pending-approval-notifier.service.spec.ts` | 보류 제외 집계 테스트 |

### Frontend (`apps/web`)

| 파일 | 변경 |
|---|---|
| `src/api/users.ts` | `User` 표식 필드 3개, `pending` 쿼리, `hold`/`bulkActivate`/`bulkHold` 메서드 |
| `src/components/shared/StatusBadge.vue` | `PENDING_APPROVAL`·`APPROVAL_HELD` 키 추가 |
| `src/views/tenant/users/HoldUsersDialog.vue` | 신규 — 보류 확인 + 사유 입력 다이얼로그(단건/다건 공용) |
| `src/views/tenant/users/UserListView.vue` | 체크박스 멀티선택, 일괄 액션 바, 보조 배지, 승인 대기 필터, 결과 요약 |
| `src/views/tenant/users/UserDetailView.vue` | 대기/보류 배지·시각 표시, 단건 "가입 보류" 버튼 |

### 문서

| 파일 | 변경 |
|---|---|
| `CLAUDE.md` | 승인 대기 알림 단락에 보류 표식·집계 조건 반영 |
| `docs/reviews/2026-08-25-user-approval-hold-review.md` | 신규 — 5단계에서 작성 |

## 작업 단계

- [x] 1. 엔티티·감사 액션·마이그레이션: `approvalHeldAt` 컬럼, `USER_APPROVAL_HELD` enum(TS+DB), 마이그레이션 파일
- [x] 2. 서비스 구현: `hold()` 대상 검증·표식 기록·감사 로그, `activate()` 표식 해제, `findAll()` `pending` 필터
- [x] 3. bulk 서비스 구현: `bulkActivate()`·`bulkHold()` 부분 성공 루프, 중복 제거, `BulkUserActionResult`
- [x] 4. DTO·컨트롤러: `HoldUserDto`·`BulkActivateUsersDto`·`BulkHoldUsersDto`, 라우트 3개(bulk를 `:id`보다 위 선언), `pending` 쿼리 파라미터
- [ ] 5. 알림 집계 변경: `countPending()`에 보류 제외 조건 + 주석 갱신
- [ ] 6. 백엔드 단위 테스트: users.service(hold/bulk/activate), notifier(보류 제외)
- [ ] 7. 웹 API 클라이언트·StatusBadge: 타입/메서드 추가, 배지 키 추가
- [ ] 8. `HoldUsersDialog.vue` 신규 작성
- [ ] 9. `UserListView.vue`: 체크박스 선택, 일괄 액션 바, 확인 다이얼로그 연결, 결과 요약, 보조 배지, 승인 대기 필터(URL 동기화 포함)
- [ ] 10. `UserDetailView.vue`: 배지·시각 표시, 단건 보류 버튼
- [ ] 11. CLAUDE.md 승인 대기 알림 단락 갱신
- [ ] 12. 4단계 검증 실행 및 통과 확인

## 검증 명령과 기대 결과

```bash
bun run lint        # 오류 0
bun run typecheck   # 오류 0
bun run test        # 전체 통과 (신규 테스트 포함)
bun run build       # api·web 빌드 성공
```

## 리스크

| 리스크 | 대응 |
|---|---|
| DB ENUM 값 누락 시 감사 로그 INSERT 22P02 (전례 있음) | 마이그레이션에 컬럼과 ENUM 값을 함께 넣고 코드 리뷰에서 확인 |
| `bulk/*`가 `:id/*` 라우트에 선점 매칭 | 컨트롤러에서 bulk 라우트를 먼저 선언, 수동 확인 |
| 대기 사용자가 이미 다른 경로(PATCH 비활성화)로 변경된 뒤 bulk 요청 도착 | 건별 조건 검사로 실패 목록 처리 — 전체 실패로 번지지 않음 |
| 선택 상태와 목록 새로고침의 불일치(다른 페이지 선택 잔존) | 페이지/필터/새로고침 시 선택 초기화 |
| 마이그레이션 미실행 환경에서 신규 컬럼 조회 오류 | 배포 절차상 `migration:run` 선행 — 리뷰 문서에 명시 |
