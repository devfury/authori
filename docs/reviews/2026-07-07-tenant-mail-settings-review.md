# 개발완료보고서 — 메일 발신자·개발용 리다이렉트 테넌트별 설정

- 작성일: 2026-07-07
- 브랜치: `feat/per-tenant-mail-settings`
- 관련 문서:
  - [요구사항정의서](../requirements/2026-07-07-tenant-mail-settings-requirements.md)
  - [개발설계서](../specs/2026-07-07-tenant-mail-settings-spec.md)
  - [개발계획서](../plans/2026-07-07-tenant-mail-settings-plan.md)

## 1. 구현 요약

인증 메일의 발신자(`mailFrom`)와 개발용 강제 수신자(`mailDevRedirectTo`)를 전역 환경변수(`SMTP_FROM`, `SMTP_DEV_REDIRECT_TO`)에서 **테넌트별 설정(`TenantSettings`)** 으로 이전했다. `mailDevRedirectTo`는 `NODE_ENV=production`에서 설정할 수 없으며 관리 UI에 노출되지 않는다.

## 2. 완료된 작업

| # | 작업 | 파일 |
|---|------|------|
| 1 | 엔티티 컬럼 추가 (`mailFrom`, `mailDevRedirectTo`) | `database/entities/tenant-settings.entity.ts` |
| 2 | 마이그레이션 | `database/migrations/1780700000000-AddTenantMailSettings.ts` |
| 3 | 환경변수 제거 (`smtp.from`, `smtp.devRedirectTo`) | `common/config/app.config.ts` |
| 4 | `MailService` 파라미터화 (`DEFAULT_MAIL_FROM` 폴백, `resolveRecipient(to, devRedirectTo)`, isDev 게이트 유지) | `common/mail/mail.service.ts` |
| 5 | 테넌트 `settings` 로드 후 값 주입 | `oauth/authorize/email-verification.service.ts` |
| 6 | DTO 필드 추가 | `tenants/dto/create-tenant.dto.ts` |
| 7 | production 저장 strip (`ConfigService` 주입) | `tenants/tenants.service.ts` |
| 8 | `GET /tenants/:id`에 `mailDevRedirectEditable` 플래그 | `tenants/tenants.controller.ts` |
| 9 | 프론트 타입 확장 | `web/src/api/tenants.ts` |
| 10 | 관리 UI 입력 필드 + payload | `web/src/views/platform/tenants/TenantDetailView.vue` |
| 11 | env/문서 정리 | `.env.example`, `apps/api/.env.example`, `CLAUDE.md` |
| 12 | 단위 테스트 | `common/mail/mail.service.spec.ts`, `tenants/tenants.service.spec.ts` |

## 3. 빌드/테스트 결과

| 명령 | 결과 |
|------|------|
| `bun run typecheck` | ✅ 통과 (api + web) |
| `bun run test` | ✅ 통과 (api 99 tests, web 10 tests — 신규 spec 2개 포함) |
| `bun run build` | ✅ 성공 (api + web) |
| `bun run lint` | ⚠️ 62 errors — **모두 이번 변경과 무관한 기존 파일**(guards, 기존 spec, e2e, 과거 마이그레이션 등)에서 발생. 본 작업의 신규/수정 파일은 lint 클린. `develop` 기준 사전 존재하는 문제. |

### 신규 테스트 커버리지
- `MailService`: from 폴백, from 지정, development에서 devRedirect 적용, production에서 devRedirect 무시, devRedirect 미설정.
- `TenantsService`: production에서 `mailDevRedirectTo` strip, development에서 보존.

## 4. 남은 리스크 / 후속 작업

- **환경변수 제거 영향**: 기존 배포의 `SMTP_FROM`/`SMTP_DEV_REDIRECT_TO`는 더 이상 사용되지 않는다. 배포 전 각 테넌트에 `mailFrom`을 설정하지 않으면 기본 발신자(`Authori <no-reply@authori.local>`)로 발송된다. → 운영 반영 시 테넌트별 발신자 설정 안내 필요.
- **마이그레이션 실행 필요**: 배포 시 `bun run migration:run`으로 `1780700000000-AddTenantMailSettings` 적용.
- **기존 lint 부채**: 리포지토리 전반의 사전 lint 오류는 본 작업 범위 밖. 별도 정리 작업 권장.
- **조회 응답 노출**: `mailDevRedirectTo` 값은 조회 응답에서 제외하지 않았다(요구사항 결정). production에서는 값이 설정될 수 없으므로 실질적 노출은 없다.
