# 개발계획서 — 메일 발신자·개발용 리다이렉트 테넌트별 설정

- 작성일: 2026-07-07
- 관련 설계: [2026-07-07-tenant-mail-settings-spec.md](../specs/2026-07-07-tenant-mail-settings-spec.md)
- 관련 요구사항: [2026-07-07-tenant-mail-settings-requirements.md](../requirements/2026-07-07-tenant-mail-settings-requirements.md)

## Goal

인증 메일 발신자(`mailFrom`)·개발용 강제 수신자(`mailDevRedirectTo`)를 환경변수에서 테넌트별 설정으로 이전. dev redirect는 production에서 설정 불가·UI 미노출.

## 변경 파일 목록

- `apps/api/src/database/entities/tenant-settings.entity.ts`
- `apps/api/src/database/migrations/1780700000000-AddTenantMailSettings.ts` (신규)
- `apps/api/src/common/config/app.config.ts`
- `apps/api/src/common/mail/mail.service.ts`
- `apps/api/src/oauth/authorize/email-verification.service.ts`
- `apps/api/src/tenants/dto/create-tenant.dto.ts`
- `apps/api/src/tenants/tenants.service.ts`
- `apps/api/src/tenants/tenants.controller.ts`
- `apps/web/src/api/tenants.ts`
- `apps/web/src/views/platform/tenants/TenantDetailView.vue`
- `.env`, `.env.example`, `CLAUDE.md`
- 테스트: `apps/api/src/common/mail/mail.service.spec.ts`, `apps/api/src/tenants/tenants.service.spec.ts`

## 작업 단계

- [ ] 1. `TenantSettings` 엔티티에 `mailFrom`, `mailDevRedirectTo` 컬럼 추가
- [ ] 2. 마이그레이션 `1780700000000-AddTenantMailSettings` 작성 (up/down)
- [ ] 3. `app.config.ts`에서 `smtp.from`, `smtp.devRedirectTo` 제거
- [ ] 4. `MailService`: `DEFAULT_MAIL_FROM` 상수, `SmtpConfig`/폴백 정리, `VerificationEmailParams`에 `from`/`devRedirectTo` 추가, `resolveRecipient` 시그니처 변경, 발송부 반영
- [ ] 5. `EmailVerificationService.issueAndSend`: 테넌트 `settings` 로드 후 `from`/`devRedirectTo` 전달
- [ ] 6. `CreateTenantSettingsDto`에 `mailFrom`, `mailDevRedirectTo` 필드 추가
- [ ] 7. `TenantsService`: `ConfigService` 주입 + production에서 `mailDevRedirectTo` strip (create/update)
- [ ] 8. `TenantsController`: `GET /:id` 응답에 `mailDevRedirectEditable` 플래그 병합
- [ ] 9. 프론트 `api/tenants.ts` 타입 확장 (settings 2필드 + `mailDevRedirectEditable`)
- [ ] 10. `TenantDetailView.vue`: 발신자 입력(항상), dev redirect 입력(플래그 조건), 저장 payload 반영
- [ ] 11. `.env`/`.env.example`/`CLAUDE.md`에서 `SMTP_FROM`·`SMTP_DEV_REDIRECT_TO` 제거·설명 갱신
- [ ] 12. 단위 테스트 작성/갱신 (MailService 폴백·dev 게이트, TenantsService strip)
- [ ] 13. `bun run lint && bun run typecheck && bun run test && bun run build`

## 검증 명령과 기대 결과

```bash
bun run lint       # 오류 0
bun run typecheck  # 오류 0
bun run test       # 신규/기존 테스트 통과
bun run build      # 성공
```

기능 검증(수동):
- development에서 테넌트 A/B에 서로 다른 `mailFrom` 설정 → 각기 다른 발신자로 발송.
- development에서 `mailDevRedirectTo` 설정 → 실 수신자 대신 해당 주소로 발송, 로그 출력.
- `NODE_ENV=production` 기동 → `GET /tenants/:id` 응답의 `mailDevRedirectEditable=false`, UI에 dev redirect 입력 없음, 해당 필드 담아 PUT 해도 저장 안 됨.

## 리스크

- `SMTP_FROM`/`SMTP_DEV_REDIRECT_TO` 제거로 기존 배포 환경변수가 무시됨 → 문서·env 파일 정리 및 완료보고서에 명시.
- `mailFrom` 미설정 테넌트는 하드코딩 기본 발신자 사용 → 의도된 폴백.
- 마이그레이션 타임스탬프 충돌 없는지 확인(현재 최신 `1780600000000`).
