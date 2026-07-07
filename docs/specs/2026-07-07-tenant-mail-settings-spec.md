# 개발설계서 — 메일 발신자·개발용 리다이렉트 테넌트별 설정

- 작성일: 2026-07-07
- 관련 요구사항: [2026-07-07-tenant-mail-settings-requirements.md](../requirements/2026-07-07-tenant-mail-settings-requirements.md)

## 1. 개요

인증 메일의 발신자(`from`)와 개발용 강제 수신자(dev redirect)를 전역 환경변수에서 **테넌트별 설정(`TenantSettings`)** 으로 이전한다. dev redirect는 production에서 설정 불가하며 관리 UI에 노출되지 않는다.

## 2. 데이터 모델

`TenantSettings` 엔티티(`apps/api/src/database/entities/tenant-settings.entity.ts`)에 2개 컬럼 추가.

| 컬럼(DB) | 프로퍼티 | 타입 | Null | 기본값 | 용도 |
|---|---|---|---|---|---|
| `mail_from` | `mailFrom` | `varchar` | O | `null` | 인증 메일 발신자 (`Name <addr>` 형식 허용) |
| `mail_dev_redirect_to` | `mailDevRedirectTo` | `varchar` | O | `null` | 개발용 강제 수신자 (dev 전용) |

두 컬럼 모두 nullable. 기존 행은 NULL로 남으며 발송 시 폴백된다.

### 마이그레이션
`apps/api/src/database/migrations/1780700000000-AddTenantMailSettings.ts`

```sql
-- up
ALTER TABLE "tenant_settings" ADD "mail_from" character varying;
ALTER TABLE "tenant_settings" ADD "mail_dev_redirect_to" character varying;
-- down
ALTER TABLE "tenant_settings" DROP COLUMN "mail_dev_redirect_to";
ALTER TABLE "tenant_settings" DROP COLUMN "mail_from";
```

## 3. 백엔드 설계

### 3.1 `app.config.ts` — 환경변수 제거
`smtp` 객체에서 `from`, `devRedirectTo` **삭제**. host/port/secure/user/pass/tlsRejectUnauthorized는 유지.

### 3.2 `MailService` (`common/mail/mail.service.ts`)
- 모듈 상수 `DEFAULT_MAIL_FROM = 'Authori <no-reply@authori.local>'` 도입.
- `SmtpConfig` 인터페이스에서 `from`, `devRedirectTo` 제거. 생성자 폴백 객체에서도 제거.
- `VerificationEmailParams`에 필드 추가:
  - `from?: string | null` — 테넌트 발신자. falsy면 `DEFAULT_MAIL_FROM`.
  - `devRedirectTo?: string | null` — 테넌트 dev redirect.
- `resolveRecipient(to, devRedirectTo)` 시그니처로 변경. 로직: `if (this.isDev && devRedirectTo) return devRedirectTo;` (isDev 게이트 유지).
- `sendVerificationEmail`에서 `from: params.from || DEFAULT_MAIL_FROM`, `resolveRecipient(params.to, params.devRedirectTo)` 사용.

### 3.3 `EmailVerificationService.issueAndSend` (`oauth/authorize/email-verification.service.ts`)
- 기존 `tenantRepo.findOne({ where: { id: tenantId } })`에 `relations: ['settings']` 추가.
- `sendVerificationEmail` 호출 시 전달:
  - `from: tenant?.settings?.mailFrom ?? null`
  - `devRedirectTo: tenant?.settings?.mailDevRedirectTo ?? null`

### 3.4 DTO — `CreateTenantSettingsDto` (`tenants/dto/create-tenant.dto.ts`)
필드 2개 추가(둘 다 optional):
```ts
@ApiPropertyOptional({ description: '인증 메일 발신자 주소' })
@IsOptional() @IsString() @MaxLength(320)
mailFrom?: string;

@ApiPropertyOptional({ description: '개발용 강제 수신자 (production에서는 무시됨)' })
@IsOptional() @IsString() @MaxLength(320)
mailDevRedirectTo?: string;
```
값 초기화(빈 문자열 허용)를 위해 `IsEmail` 대신 `IsString` 사용.

### 3.5 `TenantsService` — production 저장 거부 (FR-6)
- `ConfigService` 주입.
- private 헬퍼 `stripProductionOnlySettings(settings)`: `nodeEnv === 'production'`이면 `delete settings.mailDevRedirectTo`.
- `create`, `update` 두 경로 모두 `dto.settings`에 대해 저장 직전 호출.

### 3.6 컨트롤러 — 프론트 플래그 (FR-7)
- `GET /tenants/:id`(`findOne`) 응답에 `mailDevRedirectEditable: boolean`(= `nodeEnv !== 'production'`) 필드를 병합해 반환.
  ```ts
  const tenant = await this.tenantsService.findOne(id);
  return { ...tenant, mailDevRedirectEditable: this.config.get('app.nodeEnv') !== 'production' };
  ```
- 컨트롤러에 `ConfigService` 주입.

## 4. 프론트엔드 설계

### 4.1 `api/tenants.ts`
- `TenantSettings` 인터페이스에 `mailFrom?: string | null`, `mailDevRedirectTo?: string | null` 추가.
- `Tenant` 인터페이스에 `mailDevRedirectEditable?: boolean` 추가.
- `UpdateTenantPayload.settings`에 `mailFrom?`, `mailDevRedirectTo?` 추가.

### 4.2 `TenantDetailView.vue`
- 설정 폼에 **발신자 주소** 입력(`v-model="tenant.settings.mailFrom"`) — 항상 표시.
- **개발용 강제 수신자** 입력(`v-model="tenant.settings.mailDevRedirectTo"`) — `v-if="tenant.mailDevRedirectEditable"`로 렌더링.
- 저장 payload(`settings`)에 `mailFrom` 항상 포함, `mailDevRedirectTo`는 `mailDevRedirectEditable`일 때만 포함.

## 5. 보안 / 검증

- **3중 방어**: (1) production UI 미노출, (2) production 저장 API 무시, (3) send 시점 `NODE_ENV=development` 게이트.
- production 판단은 서버 `app.nodeEnv` 단일 소스. 프론트는 백엔드 플래그만 신뢰.

## 6. 테스트 설계

- `mail.service.spec.ts`(신규 또는 확장): `from` 폴백, dev redirect가 isDev일 때만 적용, production(isDev=false)에서 devRedirectTo 무시.
- `tenants.service.spec.ts`: production에서 `mailDevRedirectTo` strip, development에서 보존.
- 기존 `OAuthRegisterView.spec.ts` 등 회귀 확인.

## 7. 영향 범위 요약

| 구분 | 파일 |
|---|---|
| 엔티티 | `database/entities/tenant-settings.entity.ts` |
| 마이그레이션 | `database/migrations/1780700000000-AddTenantMailSettings.ts` (신규) |
| 설정 | `common/config/app.config.ts` |
| 메일 | `common/mail/mail.service.ts` |
| 발송 | `oauth/authorize/email-verification.service.ts` |
| DTO | `tenants/dto/create-tenant.dto.ts` |
| 서비스 | `tenants/tenants.service.ts` |
| 컨트롤러 | `tenants/tenants.controller.ts` |
| 프론트 API | `web/src/api/tenants.ts` |
| 프론트 뷰 | `web/src/views/platform/tenants/TenantDetailView.vue` |
| env/문서 | `.env`, `.env.example`, `CLAUDE.md`(SMTP 설명) |
