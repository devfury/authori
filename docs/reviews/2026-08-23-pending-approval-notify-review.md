# 개발완료보고서 — 승인 대기 신규 가입자 ezAria 알림

- 작성일: 2026-08-23
- 작성자: Jinho Lee
- 작업 브랜치: `feat/pending-approval-notify`
- 관련 문서: [요구사항정의서](../requirements/2026-08-23-pending-approval-notify-requirements.md) · [개발설계서](../specs/2026-08-23-pending-approval-notify-spec.md) · [개발계획서](../plans/2026-08-23-pending-approval-notify-plan.md)

## 1. 구현 요약

이메일 인증과 자동 활성화가 모두 꺼진 상태로 공개 회원가입이 발생하면 신규 사용자는 관리자가 직접
활성화할 때까지 로그인할 수 없는데, 이 사실을 아무도 통보받지 못해 무한히 대기할 수 있었다.
이제 두 시점에 테넌트별 ezAria 채팅방으로 알린다.

1. **가입 즉시** — 마스킹된 이메일, 가입 시각(KST), 현재 승인 대기 건수, 관리 UI 승인 화면 링크.
2. **매일 09:00(KST) 잔량 다이제스트** — 대기 건수, 최장 대기 경과일, 최근 가입 시각, 승인 링크.
   대기 0건이면 발송하지 않는다.

`users.pendingApprovalSince` 표식을 도입해 `status=INACTIVE`의 세 의미(관리자 승인 대기 /
이메일 인증 대기 / 탈퇴)를 구분했고, 활성화 시 표식을 지워 알림이 멈추게 했다.

## 2. 완료된 작업

| 영역 | 변경 |
|---|---|
| 설정 | `app.config.ts`에 `ezaria`(botToken/baseUrl/timeoutMs)·`adminBaseUrl` 추가, `.env.example` 문서화 |
| 스키마 | `TenantSettings.pendingApprovalNotifyEnabled`·`ezariaChatRoomId`, `User.pendingApprovalSince`, `AuditAction.NOTIFY_TEST_SENT` |
| 마이그레이션 | `1781000000000-AddPendingApprovalNotify` — 컬럼 3개 추가, 기존 승인 대기자 `created_at` 백필, 부분 인덱스 `IDX_users_pending_approval`, `down` 포함 |
| 알림 채널 | `common/notification/` 신규 — `EzariaClient`(봇 API POST, 5초 타임아웃, 토큰 미로깅), `maskEmail`, `PendingApprovalNotifierService`, `PendingApprovalDigestService`(`@Cron 0 0 9 * * *` Asia/Seoul + advisory lock `481924`) |
| 가입 경로 | `AuthorizeService.register()`에서 승인 대기 표식 기록 + best-effort 알림 (실패는 로그) |
| 활성화 경로 | `UsersService.activate()`에서 표식 해제 |
| 관리 API | 테넌트 설정 DTO 2필드(빈 채팅방 ID는 `null` 정규화), `POST /admin/tenants/:id/notify-test`(감사 로그 기록, 실패도 `sent:false`+`reason`으로 200 반환) |
| 관리 UI | 테넌트 상세에 **ezAria 알림** 섹션 — 사용 토글, 수신 채팅방 ID, 테스트 발송 버튼, `reason` 한국어 매핑 |
| 문서 | `CLAUDE.md`에 승인 대기 알림 정책·모듈 반영 |

### 발송 게이트

세 조건이 모두 충족될 때만 발송한다. 하나라도 없으면 건너뛰고 로그만 남긴다(SMTP 미설정 폴백과 동일).

1. 전역 `EZARIA_BOT_TOKEN`
2. 테넌트 `pendingApprovalNotifyEnabled`
3. 테넌트 `ezariaChatRoomId`

## 3. 빌드/테스트 실행 결과

```
bun run lint       ✅ 122 problems (67 errors, 55 warnings) — develop baseline과 완전히 동일 (신규 유입 0)
bun run typecheck  ✅ @authori/api, @authori/web 모두 성공
bun run test       ✅ api 23 suites / 187 tests, web 10 tests — 전부 통과
bun run build      ✅ api, web 빌드 성공
```

- lint는 저장소 기존 baseline에서 이미 실패 상태다(주로 e2e·일부 spec의 `no-unsafe-*`).
  본 작업 전(develop)과 후 결과가 파일 목록·문제 수까지 동일함을 확인했고, 신규 파일이 baseline에
  들어가지 않도록 새로 작성한 spec의 lint 오류는 모두 해소했다.
- 신규 단위 테스트 40건 추가: `maskEmail`(5), `EzariaClient`(5), `PendingApprovalNotifierService`(15),
  `PendingApprovalDigestService`(4), `AuthorizeService.register` 알림(4), `UsersService.activate` 표식 해제(1),
  테넌트 설정·테스트 발송(4), 기타.

## 4. 검증하지 못한 항목

- **마이그레이션 실제 실행**: DB 접속이 가능한 환경에서 `bun run migration:run`으로 별도 확인이 필요하다
  (CI 검증 대상 아님). 백필 UPDATE는 `tenant_settings` 조인 기반이라 테넌트 설정이 없는 사용자는 대상에서 빠진다.
- **실제 ezAria 전송**: 봇 토큰이 설정된 환경에서 관리 UI의 `테스트 발송` 버튼으로 확인이 필요하다.
  단위 테스트는 `fetch`를 모킹한다.

## 5. 남은 리스크 · 후속 작업

| 항목 | 내용 |
|---|---|
| 테넌트 관리자 권한 | 테넌트 설정 편집은 기존 구조상 `PlatformAdminGuard` 전용이다. 테넌트 관리자가 자기 테넌트 알림을 직접 설정하려면 별도 엔드포인트가 필요하다(요구사항 FR-12/13 역할 표 중 이번 범위에서 제외). |
| 이메일 인증 미완료 독촉 | 범위에서 제외했다. 인증 링크를 방치한 가입자는 여전히 알림 대상이 아니다. |
| 알림 시각 고정 | 다이제스트는 09:00 KST 고정이다. 테넌트별 시각 설정은 후속 과제. |
| 백필 범위 | 이메일 인증이 꺼진 테넌트의 미탈퇴 INACTIVE 사용자 전체에 표식이 붙는다. 관리자가 의도적으로 만든 INACTIVE 계정도 포함될 수 있으나, 알림 기본값이 비활성이라 켠 테넌트만 영향을 받는다. |
| 발송 유실 | 재시도·outbox가 없다. 일시 장애로 즉시 알림이 유실되면 다음 날 다이제스트가 백스톱 역할을 한다. |
