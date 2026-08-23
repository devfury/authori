# 개발계획서 — 승인 대기 신규 가입자 ezAria 알림

- 작성일: 2026-08-23
- 작성자: Jinho Lee
- 관련 문서: [요구사항정의서](../requirements/2026-08-23-pending-approval-notify-requirements.md) · [개발설계서](../specs/2026-08-23-pending-approval-notify-spec.md)
- 작업 브랜치: `feat/pending-approval-notify`

## Goal

관리자 승인 대기 상태로 가입한 신규 사용자를 가입 즉시와 매일 09:00(KST) 두 시점에
테넌트별 ezAria 채팅방으로 알려, 승인 없이 방치되는 상태를 구조적으로 없앤다.

## 변경 파일 목록

### API (`apps/api`)

| 파일 | 변경 |
|---|---|
| `src/common/config/app.config.ts` | `ezaria`(token/baseUrl/timeout), `adminBaseUrl` 추가 |
| `src/database/entities/tenant-settings.entity.ts` | `pendingApprovalNotifyEnabled`, `ezariaChatRoomId` |
| `src/database/entities/user.entity.ts` | `pendingApprovalSince` |
| `src/database/entities/audit-log.entity.ts` | `AuditAction.NOTIFY_TEST_SENT` |
| `src/database/migrations/1781000000000-AddPendingApprovalNotify.ts` | 신규 — 컬럼 2+1, 백필, 부분 인덱스 |
| `src/common/notification/notification.module.ts` | 신규 — `@Global()` 모듈 |
| `src/common/notification/ezaria.client.ts` | 신규 — ezAria Bot API 전송 |
| `src/common/notification/mask.util.ts` | 신규 — 이메일 마스킹 |
| `src/common/notification/pending-approval-notifier.service.ts` | 신규 — 게이트·집계·메시지 조립·발송 |
| `src/common/notification/pending-approval-digest.service.ts` | 신규 — `@Cron` + advisory lock |
| `src/oauth/authorize/authorize.service.ts` | 승인 대기 표식 기록 + best-effort 알림 |
| `src/users/users.service.ts` | `activate()`에서 표식 해제 |
| `src/tenants/dto/create-tenant.dto.ts` | 설정 DTO 2필드 |
| `src/tenants/tenants.controller.ts` | `POST /admin/tenants/:id/notify-test` |
| `.env.example` | ezAria/관리 UI 변수 문서화 |
| 각 `*.spec.ts` | 설계서 8절 테스트 |

### Web (`apps/web`)

| 파일 | 변경 |
|---|---|
| `src/api/tenants.ts` | 타입 2필드 + `notifyTest()` |
| `src/views/platform/tenants/TenantDetailView.vue` | ezAria 알림 섹션(토글/방 ID/테스트 발송) |

### 문서

| 파일 | 변경 |
|---|---|
| `CLAUDE.md` | 회원가입 활성화 정책 절에 승인 대기 알림 동작 반영 |
| `docs/reviews/2026-08-23-pending-approval-notify-review.md` | 5단계 개발완료보고서 |

## 작업 단계

- [x] 1. 요구사항정의서 작성 및 커밋
- [x] 2. 개발설계서·개발계획서 작성 및 커밋
- [x] 3. 설정: `app.config.ts`에 `ezaria`·`adminBaseUrl` 추가, `.env.example` 문서화
- [x] 4. 엔티티: `TenantSettings` 2컬럼, `User.pendingApprovalSince`, `AuditAction.NOTIFY_TEST_SENT`
- [x] 5. 마이그레이션 작성 (컬럼 추가 + 기존 대기자 백필 + 부분 인덱스, `down` 포함)
- [ ] 6. `mask.util.ts` + 단위 테스트
- [ ] 7. `EzariaClient` + 단위 테스트 (전송 payload / 비-2xx throw / 미설정 / 타임아웃)
- [ ] 8. `PendingApprovalNotifierService` + 단위 테스트 (게이트 no-op / 메시지 내용 / 예외 미전파 / sendTest reason)
- [ ] 9. `NotificationModule` 등록 및 `AppModule` 편입
- [ ] 10. `AuthorizeService.register()` 표식 기록 + best-effort 알림 + 단위 테스트
- [ ] 11. `UsersService.activate()` 표식 해제 + 단위 테스트
- [ ] 12. `PendingApprovalDigestService` + 단위 테스트 (락 skip / 0건 침묵 / 테넌트별 계속)
- [ ] 13. 테넌트 설정 DTO 2필드 + 테스트 발송 엔드포인트(감사 로그) + 테스트
- [ ] 14. 웹: `api/tenants.ts` 타입·`notifyTest()`
- [ ] 15. 웹: `TenantDetailView.vue` ezAria 알림 섹션
- [ ] 16. `CLAUDE.md` 갱신
- [ ] 17. 4단계 검증 (`lint` → `typecheck` → `test` → `build`)
- [ ] 18. 개발완료보고서 작성, `develop` 병합·push, ezAria 알림

## 검증 명령과 기대 결과

```bash
bun run lint       # 신규 경고 0
bun run typecheck  # 오류 0
bun run test       # 전체 통과 (신규 스펙 포함)
bun run build      # api/web 빌드 성공
```

마이그레이션은 DB 접속이 가능한 환경에서 `bun run migration:run`으로 별도 확인한다(CI 검증 대상 아님).

## 리스크

| 리스크 | 대응 |
|---|---|
| 가입 경로에 외부 HTTP 호출 추가 → 응답 지연·실패 유발 | `try/catch` + 5초 타임아웃, 기본 비활성 |
| 봇 토큰 유출 | `.env` 전용, 로그·응답·프론트 미노출, URL 전체 로깅 금지 |
| 다이제스트 다중 인스턴스 중복 발송 | advisory lock(전용 키) — 기존 sweep 서비스와 동일 패턴 |
| 백필 범위 과다로 첫 다이제스트 과다 알림 | 이메일 인증 OFF 테넌트의 미탈퇴 INACTIVE로 한정, 기본 비활성이라 켠 테넌트만 수신 |
| 알림 피로 | 다이제스트는 1건 이상일 때만 발송, 0건이면 침묵 |
