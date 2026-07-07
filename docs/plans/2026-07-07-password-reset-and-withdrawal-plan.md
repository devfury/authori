# 비밀번호 재설정 및 회원 탈퇴(계정 비활성화·유예 삭제) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 비로그인 사용자를 위한 공개 비밀번호 재설정(이메일 토큰 2단계)과, M2M 비활성화 강화 + 유예기간 경과 후 자동 삭제(다중 인스턴스 안전)를 구현한다.

**Architecture:** 공개 재설정은 `oauth/authorize` 모듈의 `verify-email` 흐름과 대칭인 `PasswordResetService`로 구현한다. 탈퇴는 기존 M2M `deactivate` 엔드포인트와 `usersService.deactivate()`를 강화하고, 신규 `AccountDeletionSweepService` 크론이 유예기간 경과 계정을 `pg_try_advisory_xact_lock` + `FOR UPDATE SKIP LOCKED`로 안전하게 삭제한다.

**Tech Stack:** NestJS, TypeORM, Postgres, `@nestjs/schedule`, `@nestjs/throttler`, nodemailer, Vue 3 + Pinia + Vue Router + Tailwind.

**관련 문서:**
- 요구사항정의서: `docs/requirements/2026-07-07-password-reset-and-withdrawal-requirements.md`
- 개발설계서: `docs/specs/2026-07-07-password-reset-and-withdrawal-spec.md`

## Global Constraints

- 모든 문서·주석은 한국어로 작성한다.
- 편집·검증은 worktree `.worktree/password-reset-and-withdrawal` (브랜치 `feat/password-reset-and-withdrawal`) 안에서 수행한다.
- 재설정 토큰의 raw 값은 DB에 저장하지 않는다. `CryptoUtil.sha256Hex()` 해시만 저장한다.
- 재설정 요청/확정 응답에 토큰이나 재설정 URL을 절대 포함하지 않는다.
- 트랜잭션으로 여러 엔티티를 저장할 때 `dataSource.transaction(async (manager) => {...})`를 쓰고, 감사 로그(`auditService.record()`)는 커밋 후 호출한다.
- 토큰 폐기는 삭제가 아니라 `revoked: true` 업데이트로 한다(단, 계정 완전 삭제 `usersService.delete()`는 기존대로 하드 삭제).
- 각 태스크 커밋 메시지 말미에 다음을 포함한다:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- 계획이 바뀌면 코드와 이 계획서의 체크박스를 같은 커밋에서 함께 갱신한다.

**공용 테스트 실행 (apps/api 기준):**
```bash
cd apps/api && bun run test -- <spec-file>
```

---

## Phase 1 — 데이터 모델 & 설정

### Task 1: `PasswordResetToken` 엔티티 + barrel + 마이그레이션

**Files:**
- Create: `apps/api/src/database/entities/password-reset-token.entity.ts`
- Modify: `apps/api/src/database/entities/index.ts:30` (barrel export 추가)
- Create: `apps/api/src/database/migrations/1780800000000-AddPasswordResetTokens.ts`

**Interfaces:**
- Produces: `PasswordResetToken` 엔티티 — 컬럼 `id, tenantId, userId, tokenHash, expiresAt, usedAt, createdAt`. 테이블 `password_reset_tokens`.

- [x] **Step 1: 엔티티 작성** — `password-reset-token.entity.ts`:

```ts
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 비밀번호 재설정 토큰.
 * raw 토큰은 메일 링크로만 전달하고 DB에는 sha256 해시만 저장한다.
 */
@Entity('password_reset_tokens')
export class PasswordResetToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Index()
  @Column({ name: 'token_hash' })
  tokenHash: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
```

- [x] **Step 2: barrel export 추가** — `index.ts` 끝(30번 줄 아래)에 추가:

```ts
export { PasswordResetToken } from './password-reset-token.entity';
```

- [x] **Step 3: 마이그레이션 작성** — `1780800000000-AddPasswordResetTokens.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPasswordResetTokens1780800000000 implements MigrationInterface {
  name = 'AddPasswordResetTokens1780800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "password_reset_tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "token_hash" character varying NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "used_at" timestamptz,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_password_reset_tokens" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_password_reset_tokens_user_id" ON "password_reset_tokens" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_password_reset_tokens_token_hash" ON "password_reset_tokens" ("token_hash")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_password_reset_tokens_token_hash"`);
    await queryRunner.query(`DROP INDEX "IDX_password_reset_tokens_user_id"`);
    await queryRunner.query(`DROP TABLE "password_reset_tokens"`);
  }
}
```
> `uuid_generate_v4()`는 기존 마이그레이션에서 이미 uuid-ossp 확장을 사용하므로 그대로 사용 가능하다. 확장 관련 오류가 나면 기존 초기 마이그레이션의 `CREATE EXTENSION` 사용 방식을 따른다.

- [x] **Step 4: 타입체크로 검증**

Run: `cd apps/api && bun run typecheck`
Expected: PASS (신규 엔티티/배럴 참조 오류 없음)

- [x] **Step 5: 커밋**

```bash
git add apps/api/src/database/entities/password-reset-token.entity.ts apps/api/src/database/entities/index.ts apps/api/src/database/migrations/1780800000000-AddPasswordResetTokens.ts docs/plans/2026-07-07-password-reset-and-withdrawal-plan.md
git commit -m "feat: PasswordResetToken 엔티티·마이그레이션 추가"
```

---

### Task 2: `User.deactivatedAt` 컬럼 + 마이그레이션

**Files:**
- Modify: `apps/api/src/database/entities/user.entity.ts:56` (lastLoginAt 아래)
- Create: `apps/api/src/database/migrations/1780800100000-AddUserDeactivatedAt.ts`

**Interfaces:**
- Produces: `User.deactivatedAt: Date | null` (컬럼 `deactivated_at`).

- [x] **Step 1: 컬럼 추가** — `user.entity.ts`의 `lastLoginAt` 정의 바로 아래에 삽입:

```ts
  /** 비활성화(탈퇴) 시각. 유예기간 경과 시 자동 삭제 기준이자 미인증 INACTIVE와의 구분자 */
  @Column({ name: 'deactivated_at', nullable: true, type: 'timestamptz' })
  deactivatedAt: Date | null;
```

- [x] **Step 2: 마이그레이션 작성** — `1780800100000-AddUserDeactivatedAt.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserDeactivatedAt1780800100000 implements MigrationInterface {
  name = 'AddUserDeactivatedAt1780800100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "deactivated_at" timestamptz`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "deactivated_at"`);
  }
}
```

- [x] **Step 3: 타입체크**

Run: `cd apps/api && bun run typecheck`
Expected: PASS

- [x] **Step 4: 커밋**

```bash
git add apps/api/src/database/entities/user.entity.ts apps/api/src/database/migrations/1780800100000-AddUserDeactivatedAt.ts docs/plans/2026-07-07-password-reset-and-withdrawal-plan.md
git commit -m "feat: User.deactivatedAt 컬럼 추가"
```

---

### Task 3: `TenantSettings.accountDeletionGracePeriodDays` + 마이그레이션

**Files:**
- Modify: `apps/api/src/database/entities/tenant-settings.entity.ts:78` (mailDevRedirectTo 아래)
- Create: `apps/api/src/database/migrations/1780800200000-AddAccountDeletionGracePeriod.ts`

**Interfaces:**
- Produces: `TenantSettings.accountDeletionGracePeriodDays: number` (기본 30, 컬럼 `account_deletion_grace_period_days`).

- [x] **Step 1: 컬럼 추가** — `tenant-settings.entity.ts`의 `mailDevRedirectTo` 정의 아래에 삽입:

```ts
  /** 계정 비활성화 후 자동 삭제까지의 유예 일수 */
  @Column({ name: 'account_deletion_grace_period_days', default: 30 })
  accountDeletionGracePeriodDays: number;
```

- [x] **Step 2: 마이그레이션 작성** — `1780800200000-AddAccountDeletionGracePeriod.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAccountDeletionGracePeriod1780800200000 implements MigrationInterface {
  name = 'AddAccountDeletionGracePeriod1780800200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenant_settings" ADD "account_deletion_grace_period_days" integer NOT NULL DEFAULT 30`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenant_settings" DROP COLUMN "account_deletion_grace_period_days"`,
    );
  }
}
```

- [x] **Step 3: 타입체크**

Run: `cd apps/api && bun run typecheck`
Expected: PASS

- [x] **Step 4: 커밋**

```bash
git add apps/api/src/database/entities/tenant-settings.entity.ts apps/api/src/database/migrations/1780800200000-AddAccountDeletionGracePeriod.ts docs/plans/2026-07-07-password-reset-and-withdrawal-plan.md
git commit -m "feat: TenantSettings.accountDeletionGracePeriodDays 추가"
```

---

### Task 4: `passwordResetTtl` 설정

**Files:**
- Modify: `apps/api/src/common/config/app.config.ts:47` (emailVerificationTtl 아래)
- Modify: `apps/api/.env.example` (있으면 `PASSWORD_RESET_TTL=3600` 추가)

**Interfaces:**
- Produces: `config.get<number>('app.passwordResetTtl')` (기본 3600).

- [x] **Step 1: 설정 추가** — `app.config.ts`의 `emailVerificationTtl` 줄 아래에 추가:

```ts
  passwordResetTtl: parseInt(process.env.PASSWORD_RESET_TTL ?? '3600', 10),
```

- [x] **Step 2: .env.example 갱신** — `apps/api/.env.example`에 SMTP/EMAIL 관련 항목 근처에 추가(파일이 있으면):

```
PASSWORD_RESET_TTL=3600
```

- [x] **Step 3: 타입체크**

Run: `cd apps/api && bun run typecheck`
Expected: PASS

- [x] **Step 4: 커밋**

```bash
git add apps/api/src/common/config/app.config.ts apps/api/.env.example docs/plans/2026-07-07-password-reset-and-withdrawal-plan.md
git commit -m "feat: passwordResetTtl 설정 추가"
```

---

## Phase 2 — 메일 서비스

### Task 5: MailService — 재설정/비활성화 메일 + 설정 여부 노출

**Files:**
- Modify: `apps/api/src/common/mail/mail.service.ts`
- Test: `apps/api/src/common/mail/mail.service.spec.ts` (없으면 생성)

**Interfaces:**
- Produces:
  - `get isConfigured(): boolean` — SMTP host 설정 여부.
  - `sendPasswordResetEmail(params: PasswordResetEmailParams): Promise<void>` — 미설정 시 로그 후 반환, 발송 실패 시 throw.
  - `sendAccountDeactivatedEmail(params: AccountDeactivatedEmailParams): Promise<void>` — 미설정 시 로그 후 반환, 발송 실패 시 throw.
  - `PasswordResetEmailParams { to; resetUrl; serviceName; brandColor?; ttlSeconds; from?; devRedirectTo? }`
  - `AccountDeactivatedEmailParams { to; serviceName; from?; devRedirectTo? }`

- [x] **Step 1: 실패 테스트 작성** — `mail.service.spec.ts`:

```ts
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

function makeService(host: string): MailService {
  const config = {
    get: (key: string) => {
      if (key === 'app.smtp')
        return { host, port: 587, secure: false, user: '', pass: '', tlsRejectUnauthorized: true };
      if (key === 'app.nodeEnv') return 'development';
      return undefined;
    },
  } as unknown as ConfigService;
  return new MailService(config);
}

describe('MailService.isConfigured', () => {
  it('SMTP host 미설정이면 false', () => {
    expect(makeService('').isConfigured).toBe(false);
  });

  it('SMTP host 설정이면 true', () => {
    expect(makeService('smtp.example.com').isConfigured).toBe(true);
  });

  it('미설정 상태에서 재설정 메일은 throw 없이 반환한다', async () => {
    await expect(
      makeService('').sendPasswordResetEmail({
        to: 'u@e.com',
        resetUrl: 'https://x/reset?token=t',
        serviceName: 'svc',
        ttlSeconds: 3600,
      }),
    ).resolves.toBeUndefined();
  });
});
```

- [x] **Step 2: 테스트 실패 확인**

Run: `cd apps/api && bun run test -- mail.service.spec`
Expected: FAIL (`isConfigured` / `sendPasswordResetEmail` 미정의)

- [x] **Step 3: 구현** — `mail.service.ts` 수정:

(a) `configured` getter를 public `isConfigured`로 노출(기존 private `get configured()` 이름을 `isConfigured`로 바꾸고 `sendVerificationEmail` 내부의 `this.configured` 참조도 `this.isConfigured`로 변경):

```ts
  /** SMTP_HOST 설정 여부. 미설정 시 메일을 보내지 않는다(개발용 폴백). */
  get isConfigured(): boolean {
    return !!this.smtp.host;
  }
```

(b) 파일 상단 인터페이스 영역에 추가:

```ts
export interface PasswordResetEmailParams {
  to: string;
  resetUrl: string;
  serviceName: string;
  brandColor?: string | null;
  ttlSeconds: number;
  from?: string | null;
  devRedirectTo?: string | null;
}

export interface AccountDeactivatedEmailParams {
  to: string;
  serviceName: string;
  from?: string | null;
  devRedirectTo?: string | null;
}
```

(c) 메서드 추가(발송 로직은 `sendVerificationEmail`과 동일한 미설정/리디렉션/try-catch 패턴):

```ts
  async sendPasswordResetEmail(params: PasswordResetEmailParams): Promise<void> {
    const subject = `[${params.serviceName}] 비밀번호 재설정 안내`;
    const html = this.renderPasswordResetHtml(params);

    if (!this.isConfigured) {
      this.logger.warn(
        `SMTP 미설정 — 재설정 메일을 발송하지 않습니다. to=${params.to} link=${params.resetUrl}`,
      );
      return;
    }

    const recipient = this.resolveRecipient(params.to, params.devRedirectTo);
    try {
      await this.getTransporter().sendMail({
        from: params.from || DEFAULT_MAIL_FROM,
        to: recipient,
        subject,
        html,
      });
    } catch (error) {
      this.logger.error(`재설정 메일 발송 실패 to=${recipient}: ${(error as Error).message}`);
      throw error;
    }
  }

  async sendAccountDeactivatedEmail(params: AccountDeactivatedEmailParams): Promise<void> {
    const subject = `[${params.serviceName}] 계정 비활성화 안내`;
    const html = this.renderAccountDeactivatedHtml(params);

    if (!this.isConfigured) {
      this.logger.warn(`SMTP 미설정 — 비활성화 안내 메일을 발송하지 않습니다. to=${params.to}`);
      return;
    }

    const recipient = this.resolveRecipient(params.to, params.devRedirectTo);
    try {
      await this.getTransporter().sendMail({
        from: params.from || DEFAULT_MAIL_FROM,
        to: recipient,
        subject,
        html,
      });
    } catch (error) {
      this.logger.error(`비활성화 안내 메일 발송 실패 to=${recipient}: ${(error as Error).message}`);
      throw error;
    }
  }
```

(d) 렌더 헬퍼 추가 — `renderVerificationHtml`을 복제하되 문구/버튼을 재설정용으로 바꾼다:

```ts
  private renderPasswordResetHtml(params: PasswordResetEmailParams): string {
    const color = params.brandColor || '#4f46e5';
    const hours = Math.round(params.ttlSeconds / 3600);
    const safeUrl = this.escapeHtml(params.resetUrl);
    const safeName = this.escapeHtml(params.serviceName);
    return `<!DOCTYPE html>
<html lang="ko"><body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:32px 0;"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
      <tr><td style="padding:32px 32px 16px;"><h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#111827;">${safeName}</h1><h2 style="margin:0;font-size:16px;font-weight:600;color:#374151;">비밀번호 재설정</h2></td></tr>
      <tr><td style="padding:0 32px 24px;">
        <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#4b5563;">아래 버튼을 클릭해 새 비밀번호를 설정해 주세요. 이 링크는 ${hours}시간 동안 유효합니다.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr><td style="border-radius:8px;background:${color};">
          <a href="${safeUrl}" target="_blank" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#fff;text-decoration:none;border-radius:8px;">비밀번호 재설정</a>
        </td></tr></table>
        <p style="margin:0 0 8px;font-size:12px;color:#9ca3af;">버튼이 동작하지 않으면 아래 주소를 브라우저에 붙여넣어 주세요.</p>
        <p style="margin:0;font-size:12px;color:#6b7280;word-break:break-all;"><a href="${safeUrl}" target="_blank" style="color:${color};">${safeUrl}</a></p>
      </td></tr>
      <tr><td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;"><p style="margin:0;font-size:12px;color:#9ca3af;">본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.</p></td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  }

  private renderAccountDeactivatedHtml(params: AccountDeactivatedEmailParams): string {
    const safeName = this.escapeHtml(params.serviceName);
    return `<!DOCTYPE html>
<html lang="ko"><body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:32px 0;"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
      <tr><td style="padding:32px 32px 16px;"><h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#111827;">${safeName}</h1><h2 style="margin:0;font-size:16px;font-weight:600;color:#374151;">계정 비활성화 안내</h2></td></tr>
      <tr><td style="padding:0 32px 24px;"><p style="margin:0;font-size:14px;line-height:1.6;color:#4b5563;">요청에 따라 계정이 비활성화되었습니다. 일정 유예기간이 지나면 계정과 관련 데이터가 삭제됩니다. 계정을 다시 사용하려면 서비스 제공자에게 문의해 주세요.</p></td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  }
```

- [x] **Step 4: 테스트 통과 확인**

Run: `cd apps/api && bun run test -- mail.service.spec`
Expected: PASS

- [x] **Step 5: 커밋**

```bash
git add apps/api/src/common/mail/mail.service.ts apps/api/src/common/mail/mail.service.spec.ts docs/plans/2026-07-07-password-reset-and-withdrawal-plan.md
git commit -m "feat: MailService 재설정·비활성화 메일 및 isConfigured 노출"
```

---

## Phase 3 — 비밀번호 재설정 백엔드

### Task 6: `PasswordResetService`

**Files:**
- Create: `apps/api/src/oauth/authorize/password-reset.service.ts`
- Test: `apps/api/src/oauth/authorize/password-reset.service.spec.ts`

**Interfaces:**
- Consumes: `PasswordResetToken`(Task 1), `MailService.isConfigured`/`sendPasswordResetEmail`(Task 5), `config('app.passwordResetTtl')`(Task 4).
- Produces:
  - `requestReset(tenantId, tenantSlug, email): Promise<{ status: 'sent' | 'mail_delivery_failed' }>`
  - `confirmReset(tenantId, rawToken, newPassword, ctx?): Promise<{ status: 'reset'; email: string }>`

- [x] **Step 1: 실패 테스트 작성** — `password-reset.service.spec.ts` (핵심 분기 검증, repo/mail은 목):

```ts
import { PasswordResetService } from './password-reset.service';

function build(overrides: Partial<Record<string, any>> = {}) {
  const tokens: any[] = [];
  const mail = { isConfigured: true, sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined), ...overrides.mail };
  const tokenRepo = {
    create: (v: any) => v,
    save: jest.fn(async (v: any) => { tokens.push(v); return v; }),
    findOne: jest.fn(async () => overrides.tokenRecord ?? null),
  };
  const userRepo = { findOne: jest.fn(async () => overrides.user ?? null) };
  const tenantRepo = { findOne: jest.fn(async () => ({ name: 'svc', settings: { mailFrom: null, mailDevRedirectTo: null, passwordMinLength: 8 } })) };
  const config = { get: (k: string) => (k === 'app.passwordResetTtl' ? 3600 : 'http://localhost:5173/login') };
  const svc = new PasswordResetService(
    tokenRepo as any, userRepo as any, tenantRepo as any,
    {} as any /* accessTokenRepo */, {} as any /* refreshTokenRepo */,
    {} as any /* dataSource */, config as any, mail as any, { record: jest.fn() } as any,
  );
  return { svc, mail, tokenRepo, userRepo, tokens };
}

describe('PasswordResetService.requestReset', () => {
  it('메일 미설정이면 계정 조회 없이 mail_delivery_failed', async () => {
    const { svc, userRepo } = build({ mail: { isConfigured: false, sendPasswordResetEmail: jest.fn() } });
    const res = await svc.requestReset('t1', 'slug', 'u@e.com');
    expect(res.status).toBe('mail_delivery_failed');
    expect(userRepo.findOne).not.toHaveBeenCalled();
  });

  it('계정이 없으면 sent(열거 방지), 메일 미발송', async () => {
    const { svc, mail } = build({ user: null });
    const res = await svc.requestReset('t1', 'slug', 'missing@e.com');
    expect(res.status).toBe('sent');
    expect(mail.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('계정이 있으면 토큰 저장 후 메일 발송, sent', async () => {
    const { svc, mail, tokens } = build({ user: { id: 'u1', email: 'u@e.com' } });
    const res = await svc.requestReset('t1', 'slug', 'u@e.com');
    expect(res.status).toBe('sent');
    expect(tokens.length).toBe(1);
    expect(mail.sendPasswordResetEmail).toHaveBeenCalled();
  });

  it('발송 중 예외면 mail_delivery_failed', async () => {
    const { svc } = build({
      user: { id: 'u1', email: 'u@e.com' },
      mail: { isConfigured: true, sendPasswordResetEmail: jest.fn().mockRejectedValue(new Error('smtp down')) },
    });
    const res = await svc.requestReset('t1', 'slug', 'u@e.com');
    expect(res.status).toBe('mail_delivery_failed');
  });
});
```

- [x] **Step 2: 테스트 실패 확인**

Run: `cd apps/api && bun run test -- password-reset.service.spec`
Expected: FAIL (`PasswordResetService` 미정의)

- [x] **Step 3: 구현** — `password-reset.service.ts`:

```ts
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  AccessToken,
  AuditAction,
  PasswordResetToken,
  RefreshToken,
  Tenant,
  TenantSettings,
  User,
} from '../../database/entities';
import { CryptoUtil } from '../../common/crypto/crypto.util';
import { AuditService, AuditContext } from '../../common/audit/audit.service';
import { MailService } from '../../common/mail/mail.service';

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    @InjectRepository(PasswordResetToken)
    private readonly tokenRepo: Repository<PasswordResetToken>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(AccessToken)
    private readonly accessTokenRepo: Repository<AccessToken>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly mailService: MailService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * 재설정을 시작한다. 계정 열거 방지를 위해:
   * - 메일 인프라 불가 시: 계정 조회 이전에 mail_delivery_failed 반환
   * - 계정 없음(인프라 정상): sent 반환(메일 미발송)
   * - 계정 있음: 토큰 발급·발송. 발송 예외 시 mail_delivery_failed
   */
  async requestReset(
    tenantId: string,
    tenantSlug: string,
    email: string,
  ): Promise<{ status: 'sent' | 'mail_delivery_failed' }> {
    if (!this.mailService.isConfigured) {
      return { status: 'mail_delivery_failed' };
    }

    const user = await this.userRepo.findOne({ where: { tenantId, email } });
    if (!user) {
      return { status: 'sent' };
    }

    const ttlSeconds = this.config.get<number>('app.passwordResetTtl') ?? 3600;
    const rawToken = CryptoUtil.generateToken(32);
    const tokenHash = CryptoUtil.sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await this.tokenRepo.save(
      this.tokenRepo.create({ tenantId, userId: user.id, tokenHash, expiresAt, usedAt: null }),
    );

    const tenant = await this.tenantRepo.findOne({
      where: { id: tenantId },
      relations: ['settings'],
    });
    const serviceName = tenant?.name || '비밀번호 재설정';
    const resetUrl = this.buildResetUrl(rawToken, tenantSlug);

    try {
      await this.mailService.sendPasswordResetEmail({
        to: user.email,
        resetUrl,
        serviceName,
        ttlSeconds,
        from: tenant?.settings?.mailFrom ?? null,
        devRedirectTo: tenant?.settings?.mailDevRedirectTo ?? null,
      });
    } catch (error) {
      this.logger.error(`재설정 메일 발송 실패 userId=${user.id}: ${(error as Error).message}`);
      return { status: 'mail_delivery_failed' };
    }

    return { status: 'sent' };
  }

  /**
   * 토큰을 검증하고 비밀번호를 변경한다. 성공 시 해당 사용자 토큰을 폐기한다.
   * 계정 status는 변경하지 않는다.
   */
  async confirmReset(
    tenantId: string,
    rawToken: string,
    newPassword: string,
    ctx: AuditContext = {},
  ): Promise<{ status: 'reset'; email: string }> {
    if (!rawToken) throw new BadRequestException('invalid_token');

    const tokenHash = CryptoUtil.sha256Hex(rawToken);
    const record = await this.tokenRepo.findOne({ where: { tenantId, tokenHash } });
    if (!record) throw new BadRequestException('invalid_token');
    if (record.usedAt) throw new BadRequestException('invalid_token');
    if (record.expiresAt.getTime() < Date.now()) throw new BadRequestException('token_expired');

    const user = await this.userRepo.findOne({ where: { tenantId, id: record.userId } });
    if (!user) throw new NotFoundException('user_not_found');

    const settings = await this.tenantRepo
      .findOne({ where: { id: tenantId }, relations: ['settings'] })
      .then((t) => t?.settings);
    const minLength = settings?.passwordMinLength ?? 8;
    if (newPassword.length < minLength) {
      throw new BadRequestException({ message: 'password_too_short', minLength });
    }

    user.passwordHash = await CryptoUtil.hash(newPassword);
    record.usedAt = new Date();

    await this.dataSource.transaction(async (manager) => {
      await manager.save(User, user);
      await manager.save(PasswordResetToken, record);
      await manager.update(AccessToken, { tenantId, userId: user.id }, { revoked: true });
      await manager.update(RefreshToken, { tenantId, userId: user.id }, { revoked: true });
    });

    await this.auditService.record({
      tenantId,
      action: AuditAction.USER_UPDATED,
      actorType: 'user',
      actorId: user.id,
      targetType: 'user',
      targetId: user.id,
      metadata: { field: 'password', source: 'password_reset' },
      ...ctx,
    });

    return { status: 'reset', email: user.email };
  }

  /** loginPageUrl origin 기준으로 프론트 /reset-password 링크를 만든다 */
  private buildResetUrl(rawToken: string, tenantSlug: string): string {
    const loginPageUrl =
      this.config.get<string>('app.loginPageUrl') ?? 'http://localhost:5173/login';
    const url = new URL('/reset-password', new URL(loginPageUrl).origin);
    url.searchParams.set('token', rawToken);
    url.searchParams.set('tenantSlug', tenantSlug);
    return url.toString();
  }
}
```
> `TenantSettings` import는 타입만 사용되나, `AccessToken`/`RefreshToken`/`Tenant`/`User`/`PasswordResetToken`/`AuditAction`은 런타임 참조된다. `TenantSettings`를 직접 참조하지 않으면 import에서 제외해도 된다(lint 확인).

- [x] **Step 4: 테스트 통과 확인**

Run: `cd apps/api && bun run test -- password-reset.service.spec`
Expected: PASS

- [x] **Step 5: 커밋**

```bash
git add apps/api/src/oauth/authorize/password-reset.service.ts apps/api/src/oauth/authorize/password-reset.service.spec.ts docs/plans/2026-07-07-password-reset-and-withdrawal-plan.md
git commit -m "feat: PasswordResetService 구현"
```

---

### Task 7: 재설정 DTO + 컨트롤러 엔드포인트 + 모듈 배선

**Files:**
- Create: `apps/api/src/oauth/authorize/dto/password-reset-request.dto.ts`
- Create: `apps/api/src/oauth/authorize/dto/password-reset-confirm.dto.ts`
- Modify: `apps/api/src/oauth/authorize/authorize.controller.ts` (엔드포인트 2개 추가)
- Modify: `apps/api/src/oauth/authorize/authorize.module.ts` (엔티티·프로바이더 추가)
- Test: `apps/api/src/oauth/authorize/authorize.controller.spec.ts` (있으면 확장, 없으면 최소 생성)

**Interfaces:**
- Consumes: `PasswordResetService`(Task 6).
- Produces: `POST /t/:tenantSlug/oauth/password-reset/request`, `POST /t/:tenantSlug/oauth/password-reset/confirm`.

- [x] **Step 1: DTO 작성** — `password-reset-request.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class PasswordResetRequestDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;
}
```

`password-reset-confirm.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class PasswordResetConfirmDto {
  @ApiProperty({ description: '재설정 메일 링크의 토큰' })
  @IsString()
  token: string;

  @ApiProperty({ example: 'newSecurePassword123' })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
```

- [x] **Step 2: 컨트롤러에 주입 및 엔드포인트 추가** — `authorize.controller.ts`:

(a) import 추가:

```ts
import { PasswordResetService } from './password-reset.service';
import { PasswordResetRequestDto } from './dto/password-reset-request.dto';
import { PasswordResetConfirmDto } from './dto/password-reset-confirm.dto';
```

(b) 생성자에 주입:

```ts
    private readonly passwordResetService: PasswordResetService,
```

(c) `verify-email` 핸들러 아래에 추가:

```ts
  @Post('password-reset/request')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: '비밀번호 재설정 요청',
    description:
      '이메일로 재설정 링크를 발송한다. 계정 존재 여부는 노출하지 않는다(정상 인프라 기준 항상 sent). 메일 발송 불가 시 mail_delivery_failed를 반환한다.',
  })
  passwordResetRequest(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: PasswordResetRequestDto,
  ) {
    return this.passwordResetService.requestReset(tenant.tenantId, tenant.tenantSlug, dto.email);
  }

  @Post('password-reset/confirm')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: '비밀번호 재설정 확정',
    description: '재설정 토큰을 검증하고 새 비밀번호로 변경한다. 성공 시 기존 세션 토큰을 폐기한다.',
  })
  passwordResetConfirm(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: PasswordResetConfirmDto,
    @Req() req: Request,
  ) {
    return this.passwordResetService.confirmReset(tenant.tenantId, dto.token, dto.newPassword, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.requestId,
    });
  }
```

- [x] **Step 3: 모듈 배선** — `authorize.module.ts`:

(a) 엔티티 import에 `PasswordResetToken, AccessToken, RefreshToken` 추가(배럴에서), `TypeOrmModule.forFeature([...])` 배열에도 추가.

(b) providers 배열에 `PasswordResetService` 추가:

```ts
    PasswordResetService,
```

(c) 상단에 `import { PasswordResetService } from './password-reset.service';` 추가.

- [x] **Step 4: 컨트롤러 스펙 확인/보강** — `authorize.controller.spec.ts`가 있으면 새 provider(`PasswordResetService`) mock을 추가해 DI가 깨지지 않게 한다. 없으면 이 단계는 생략하고 앱 부팅 테스트(아래)로 대체한다.

- [x] **Step 5: 타입체크 + 유닛테스트**

Run: `cd apps/api && bun run typecheck && bun run test -- authorize`
Expected: PASS (또는 관련 스펙 없음 → 0 tests)

- [x] **Step 6: 커밋**

```bash
git add apps/api/src/oauth/authorize/dto/password-reset-request.dto.ts apps/api/src/oauth/authorize/dto/password-reset-confirm.dto.ts apps/api/src/oauth/authorize/authorize.controller.ts apps/api/src/oauth/authorize/authorize.module.ts docs/plans/2026-07-07-password-reset-and-withdrawal-plan.md
git commit -m "feat: 비밀번호 재설정 공개 엔드포인트 추가"
```

---

## Phase 4 — 비활성화 강화

### Task 8: `usersService` deactivate/activate/unlock 강화

**Files:**
- Modify: `apps/api/src/users/users.service.ts` (deactivate/activate/unlock)
- Modify: `apps/api/src/users/users.module.ts` (Tenant, AccessToken, RefreshToken 엔티티 + MailService 의존)
- Test: `apps/api/src/users/users.service.spec.ts` (있으면 확장, 없으면 최소 생성)

**Interfaces:**
- Consumes: `MailService.sendAccountDeactivatedEmail`(Task 5), `User.deactivatedAt`(Task 2).
- Produces: `deactivate()`가 `deactivatedAt` 기록 + 토큰 폐기 + 조건부 메일 발송; `activate()`/`unlock()`가 `deactivatedAt`을 null로 초기화.

- [x] **Step 1: 실패 테스트 작성** — `users.service.spec.ts` (핵심 동작만; repo는 목):

```ts
import { UsersService } from './users.service';
import { UserStatus } from '../database/entities';

function build(user: any, settings: any = { emailVerificationRequired: false }) {
  const saved: any[] = [];
  const userRepo = { findOne: jest.fn(async () => user), save: jest.fn(async (u: any) => { saved.push({ ...u }); return u; }) };
  const managerUpdate = jest.fn();
  const dataSource = {
    transaction: jest.fn(async (cb: any) => cb({ save: async (_e: any, v: any) => v, update: managerUpdate })),
    getRepository: () => ({ findOne: async () => ({ name: 'svc', settings }) }),
  };
  const mail = { sendAccountDeactivatedEmail: jest.fn().mockResolvedValue(undefined) };
  const svc = new UsersService(userRepo as any, {} as any, dataSource as any, {} as any, { record: jest.fn() } as any, mail as any, {} as any);
  return { svc, userRepo, mail, managerUpdate, saved };
}
```
> 실제 생성자 시그니처(주입 추가분)에 맞춰 인자 순서를 조정한다. 아래 구현에서 확정한다.

핵심 검증:

```ts
describe('UsersService.deactivate', () => {
  it('deactivatedAt을 기록하고 토큰을 폐기한다', async () => {
    const user = { id: 'u1', email: 'u@e.com', status: UserStatus.ACTIVE, deactivatedAt: null };
    const { svc, managerUpdate } = build(user);
    await svc.deactivate('t1', 'u1');
    expect(user.status).toBe(UserStatus.INACTIVE);
    expect(user.deactivatedAt).toBeInstanceOf(Date);
    expect(managerUpdate).toHaveBeenCalled(); // 토큰 revoke
  });

  it('emailVerificationRequired면 안내 메일을 보낸다', async () => {
    const user = { id: 'u1', email: 'u@e.com', status: UserStatus.ACTIVE, deactivatedAt: null };
    const { svc, mail } = build(user, { emailVerificationRequired: true, mailFrom: null, mailDevRedirectTo: null });
    await svc.deactivate('t1', 'u1');
    expect(mail.sendAccountDeactivatedEmail).toHaveBeenCalled();
  });
});

describe('UsersService.activate', () => {
  it('deactivatedAt을 초기화한다(예약 삭제 취소)', async () => {
    const user = { id: 'u1', status: UserStatus.INACTIVE, deactivatedAt: new Date() };
    const { svc } = build(user);
    await svc.activate('t1', 'u1');
    expect(user.deactivatedAt).toBeNull();
  });
});
```

- [x] **Step 2: 테스트 실패 확인**

Run: `cd apps/api && bun run test -- users.service.spec`
Expected: FAIL

- [x] **Step 3: 구현** — `users.service.ts`:

(a) 생성자에 주입 추가 — `MailService`, `Tenant`, `AccessToken`, `RefreshToken` repo. import 갱신:

```ts
import { AccessToken, RefreshToken, Tenant } from '../database/entities';
import { MailService } from '../common/mail/mail.service';
```
생성자 파라미터 끝에 추가:

```ts
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(AccessToken)
    private readonly accessTokenRepo: Repository<AccessToken>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    private readonly mailService: MailService,
```

(b) `deactivate()` 교체:

```ts
  async deactivate(tenantId: string, id: string, ctx?: AuditContext): Promise<void> {
    const user = await this.findOne(tenantId, id);
    user.status = UserStatus.INACTIVE;
    user.deactivatedAt = new Date();

    await this.dataSource.transaction(async (manager) => {
      await manager.save(User, user);
      await manager.update(AccessToken, { tenantId, userId: id }, { revoked: true });
      await manager.update(RefreshToken, { tenantId, userId: id }, { revoked: true });
    });

    await this.auditService.record({
      tenantId,
      action: AuditAction.USER_DEACTIVATED,
      targetType: 'user',
      targetId: id,
      ...ctx,
    });

    // 이메일 인증 옵션이 켜진 테넌트는 비활성화 안내 메일 발송(best-effort)
    const tenant = await this.tenantRepo.findOne({
      where: { id: tenantId },
      relations: ['settings'],
    });
    if (tenant?.settings?.emailVerificationRequired) {
      try {
        await this.mailService.sendAccountDeactivatedEmail({
          to: user.email,
          serviceName: tenant.name ?? '계정',
          from: tenant.settings.mailFrom ?? null,
          devRedirectTo: tenant.settings.mailDevRedirectTo ?? null,
        });
      } catch (error) {
        this.logger.error?.(`비활성화 안내 메일 실패 userId=${id}: ${(error as Error).message}`);
      }
    }
  }
```
> `UsersService`에 `Logger`가 없으면 `import { Logger } from '@nestjs/common'` 후 `private readonly logger = new Logger(UsersService.name);`를 추가하거나, catch 블록에서 `console` 대신 조용히 무시한다.

(c) `activate()`에 초기화 추가 — `user.status = UserStatus.ACTIVE;` 다음 줄:

```ts
    user.deactivatedAt = null;
```

(d) `unlock()`에도 동일하게 `user.deactivatedAt = null;` 추가(`user.lockedUntil = null;` 다음).

- [x] **Step 4: 모듈 배선** — `users.module.ts`의 `TypeOrmModule.forFeature([User, UserProfile])`를 `[User, UserProfile, Tenant, AccessToken, RefreshToken]`로 확장하고, `imports`에 `MailModule` 추가(`import { MailModule } from '../common/mail/mail.module';`). MailModule 경로/이름은 기존 정의를 확인한다.
  > 실제로는 `MailModule`이 `app.module.ts`에서 `@Global()`로 이미 등록되어 있어 `UsersModule`에 재-import하지 않았다(다른 전역 모듈 소비 패턴과 동일).

- [x] **Step 5: 테스트 통과 + 타입체크**

Run: `cd apps/api && bun run typecheck && bun run test -- users.service.spec`
Expected: PASS

- [x] **Step 6: 커밋**

```bash
git add apps/api/src/users/users.service.ts apps/api/src/users/users.module.ts apps/api/src/users/users.service.spec.ts docs/plans/2026-07-07-password-reset-and-withdrawal-plan.md
git commit -m "feat: 비활성화 시 deactivatedAt 기록·토큰 폐기·안내 메일"
```

---

## Phase 5 — 유예 후 자동 삭제 스케줄러

### Task 9: `AccountDeletionSweepService`

**Files:**
- Create: `apps/api/src/users/account-deletion-sweep.service.ts`
- Modify: `apps/api/src/users/users.module.ts` (provider 추가)
- Test: `apps/api/src/users/account-deletion-sweep.service.spec.ts`

**Interfaces:**
- Consumes: `usersService.delete()`, `User.deactivatedAt`, `TenantSettings.accountDeletionGracePeriodDays`.
- Produces: `sweep()`(크론), `runSweep(manager)`(락 획득 후 실제 삭제).

- [x] **Step 1: 실패 테스트 작성** — `account-deletion-sweep.service.spec.ts`:

```ts
import { AccountDeletionSweepService } from './account-deletion-sweep.service';

describe('AccountDeletionSweepService.sweep', () => {
  it('advisory lock을 얻지 못하면 삭제하지 않는다', async () => {
    const del = jest.fn();
    const manager = { query: jest.fn().mockResolvedValue([{ locked: false }]) };
    const dataSource = { transaction: jest.fn(async (cb: any) => cb(manager)) };
    const svc = new AccountDeletionSweepService(dataSource as any, { delete: del } as any);
    await svc.sweep();
    expect(del).not.toHaveBeenCalled();
  });

  it('락 획득 시 대상 사용자를 usersService.delete로 삭제한다', async () => {
    const del = jest.fn().mockResolvedValue(undefined);
    const manager = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ locked: true }]) // advisory lock
        .mockResolvedValueOnce([{ id: 'u1', tenant_id: 't1' }]), // 대상 조회
    };
    const dataSource = { transaction: jest.fn(async (cb: any) => cb(manager)) };
    const svc = new AccountDeletionSweepService(dataSource as any, { delete: del } as any);
    await svc.sweep();
    expect(del).toHaveBeenCalledWith('t1', 'u1', expect.anything());
  });
});
```

- [x] **Step 2: 테스트 실패 확인**

Run: `cd apps/api && bun run test -- account-deletion-sweep.service.spec`
Expected: FAIL

- [x] **Step 3: 구현** — `account-deletion-sweep.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { UsersService } from './users.service';

/** 삭제 스윕 전용 advisory lock 키 (고정 상수) */
const ACCOUNT_SWEEP_LOCK_KEY = 481923;

@Injectable()
export class AccountDeletionSweepService {
  private readonly logger = new Logger(AccountDeletionSweepService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly usersService: UsersService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async sweep(): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const rows = await manager.query('SELECT pg_try_advisory_xact_lock($1) AS locked', [
        ACCOUNT_SWEEP_LOCK_KEY,
      ]);
      const locked = rows?.[0]?.locked === true || rows?.[0]?.locked === 't';
      if (!locked) {
        this.logger.debug('다른 인스턴스가 스윕 실행 중 — skip');
        return;
      }
      await this.runSweep(manager);
    });
  }

  /**
   * status=INACTIVE 이고 deactivated_at 이 테넌트별 유예기간을 초과한 사용자를 삭제한다.
   * deactivated_at IS NOT NULL 조건으로 미인증 INACTIVE 계정은 제외된다.
   * FOR UPDATE SKIP LOCKED 로 잠근 행만 취득해 중복 처리를 방지한다.
   */
  private async runSweep(manager: EntityManager): Promise<void> {
    const targets: Array<{ id: string; tenant_id: string }> = await manager.query(`
      SELECT u.id, u.tenant_id
      FROM users u
      JOIN tenant_settings ts ON ts.tenant_id = u.tenant_id
      WHERE u.status = 'INACTIVE'
        AND u.deactivated_at IS NOT NULL
        AND u.deactivated_at < (now() - (ts.account_deletion_grace_period_days || ' days')::interval)
      FOR UPDATE OF u SKIP LOCKED
    `);

    if (targets.length === 0) {
      this.logger.debug('삭제 대상 없음');
      return;
    }

    for (const t of targets) {
      await this.usersService.delete(t.tenant_id, t.id, {
        actorType: 'system',
        metadata: { source: 'account_deletion_sweep' },
      } as never);
    }
    this.logger.log(`유예기간 경과 계정 ${targets.length}건 삭제`);
  }
}
```
> `usersService.delete()`의 `ctx` 타입에 `metadata`가 없으면, `delete()`가 내부에서 기록하는 AuditLog metadata에 source를 넣도록 `delete()` 시그니처를 확장하거나, 세 번째 인자를 `{ actorType: 'system' }`만 전달한다. Task 실행 시 `delete()`의 실제 `AuditContext` 타입을 확인해 맞춘다.

- [x] **Step 4: 테스트 통과 확인**

Run: `cd apps/api && bun run test -- account-deletion-sweep.service.spec`
Expected: PASS

- [x] **Step 5: 모듈 배선** — `users.module.ts` providers에 `AccountDeletionSweepService` 추가. `ScheduleModule`은 `app.module.ts`에서 이미 `forRoot()` 되어 있으므로 추가 import 불필요.

- [x] **Step 6: 타입체크 + 커밋**

Run: `cd apps/api && bun run typecheck`
Expected: PASS

```bash
git add apps/api/src/users/account-deletion-sweep.service.ts apps/api/src/users/users.module.ts apps/api/src/users/account-deletion-sweep.service.spec.ts docs/plans/2026-07-07-password-reset-and-withdrawal-plan.md
git commit -m "feat: 유예기간 경과 계정 자동 삭제 스윕(advisory lock)"
```

---

## Phase 6 — 프론트엔드

### Task 10: 재설정 API 클라이언트 + 화면 + 라우트

**Files (실제 구현: 기존 코드베이스 관례를 따르기 위해 아래와 같이 변경됨 — `passwordReset.ts` 신규 생성 대신 기존 `oauth.ts`에 함수 추가, 뷰는 `src/views/oauth/` 하위에 배치):**
- Modify: `apps/web/src/api/oauth.ts` (`requestPasswordReset`/`confirmPasswordReset` 함수 추가, 기존 `oauthHttp` 인스턴스 재사용)
- Create: `apps/web/src/views/oauth/ForgotPasswordView.vue`
- Create: `apps/web/src/views/oauth/ResetPasswordView.vue`
- Modify: `apps/web/src/router/index.ts` (라우트 2개 추가: `oauth-forgot-password`, `oauth-reset-password`)
- Modify: `apps/web/src/views/oauth/OAuthLoginView.vue` ("비밀번호를 잊으셨나요?" 링크)

**Interfaces:**
- Consumes: 백엔드 `password-reset/request`·`confirm`(Task 7).

- [x] **Step 1: API 클라이언트** — `passwordReset.ts` (OAuth 엔드포인트이므로 별도 axios 인스턴스; 기존 OAuth 클라이언트의 baseURL/prefix 규칙을 따른다. `verify-email` 호출부 파일을 참고해 동일 인스턴스·경로 규칙을 재사용한다):

```ts
import axios from 'axios';

const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api' });

export async function requestPasswordReset(tenantSlug: string, email: string) {
  const { data } = await api.post(`/t/${tenantSlug}/oauth/password-reset/request`, { email });
  return data as { status: 'sent' | 'mail_delivery_failed' };
}

export async function confirmPasswordReset(tenantSlug: string, token: string, newPassword: string) {
  const { data } = await api.post(`/t/${tenantSlug}/oauth/password-reset/confirm`, {
    token,
    newPassword,
  });
  return data as { status: 'reset'; email: string };
}
```
> `VITE_API_BASE_URL`/prefix는 기존 OAuth 호출부(로그인/verify-email)에서 쓰는 방식과 반드시 일치시킨다. 실제 구현 시 해당 파일을 열어 baseURL 규칙을 복사한다.

- [x] **Step 2: ForgotPasswordView** — `ForgotPasswordView.vue`. `meta.layout:'auth', public:true`. 이메일 입력 → `requestPasswordReset` 호출 → 응답 분기:
  - `sent` → "재설정 메일을 보냈습니다. 메일함을 확인해 주세요." (계정 유무 노출 금지 문구)
  - `mail_delivery_failed` → "현재 메일 발송이 불가하여 재설정을 진행할 수 없습니다. 잠시 후 다시 시도하거나 관리자에게 문의해 주세요."
  - `tenantSlug`는 쿼리스트링 또는 로그인 컨텍스트에서 취득(기존 로그인 뷰가 tenantSlug를 얻는 방식을 따른다).

- [x] **Step 3: ResetPasswordView** — `ResetPasswordView.vue`. `meta.layout:'auth', public:true`. 마운트 시 쿼리 `token`, `tenantSlug` 취득. 새 비밀번호·확인 입력 → `confirmPasswordReset` 호출 → 성공 시 "비밀번호가 변경되었습니다. 다시 로그인해 주세요." 후 `/login`으로 유도. 실패(`invalid_token`/`token_expired`/`password_too_short`) 시 메시지 표시. **마크업·상태 처리는 `VerifyEmailView.vue`(또는 `/verify-email` 뷰)를 그대로 참고해 동형으로 작성**한다.

- [x] **Step 4: 라우트 추가** — `router/index.ts`에 추가 (실제로는 `oauth-verify-email` 라우트와 동일한 `meta` 형태·네이밍 규칙(`oauth-*` prefix)을 따름):

```ts
{ path: '/forgot-password', name: 'oauth-forgot-password', component: () => import('@/views/oauth/ForgotPasswordView.vue'), meta: { layout: 'auth', public: true } },
{ path: '/reset-password', name: 'oauth-reset-password', component: () => import('@/views/oauth/ResetPasswordView.vue'), meta: { layout: 'auth', public: true } },
```

- [x] **Step 5: 로그인 페이지 링크** — `OAuthLoginView.vue`의 비밀번호 입력 근처에 추가 (실제로는 named route `oauth-forgot-password`로 이동하며, 기존 뷰의 `tenantSlug` 변수를 그대로 사용):

```html
<RouterLink :to="forgotPasswordRoute" class="text-xs font-medium hover:underline">비밀번호를 잊으셨나요?</RouterLink>
```

- [x] **Step 6: 빌드 검증**

Run: `cd apps/web && bun run build`
Result: PASS (vue-tsc -b && vite build 성공, 타입/템플릿 오류 없음)

- [x] **Step 7: 커밋**

```bash
git add apps/web/src/api/oauth.ts apps/web/src/views/oauth/ForgotPasswordView.vue apps/web/src/views/oauth/ResetPasswordView.vue apps/web/src/router/index.ts apps/web/src/views/oauth/OAuthLoginView.vue docs/plans/2026-07-07-password-reset-and-withdrawal-plan.md
git commit -m "feat: 비밀번호 재설정 프론트 화면·라우트 추가"
```

---

### Task 11: 테넌트 설정 UI — 삭제 유예기간

**Files:**
- Modify: 테넌트 설정 편집 뷰(예: `apps/web/src/views/.../TenantSettings*.vue`)와 테넌트 설정 API 클라이언트/타입.
- Modify: 백엔드 TenantSettings 업데이트 DTO(`accountDeletionGracePeriodDays` 허용).

**Interfaces:**
- Consumes: `TenantSettings.accountDeletionGracePeriodDays`(Task 3).

- [ ] **Step 1: 백엔드 DTO 허용** — 테넌트 설정 수정 DTO(`tenants` 모듈의 update settings DTO)에 다음 필드를 추가한다:

```ts
  @ApiPropertyOptional({ description: '비활성화 후 자동 삭제까지의 유예 일수', minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  accountDeletionGracePeriodDays?: number;
```
> 실제 DTO 파일 경로와 기존 필드 패턴(class-validator 데코레이터)을 확인해 동일 스타일로 추가한다. 서비스의 설정 저장 로직이 해당 필드를 반영하는지 확인한다.

- [ ] **Step 2: 프론트 입력 추가** — 테넌트 설정 편집 폼에 숫자 입력(기본 30, 최소 1)을 추가하고 저장 페이로드에 포함한다. 라벨: "계정 삭제 유예기간(일)". 기존 설정 필드(예: `passwordMinLength`) 입력을 참고해 동형으로 작성한다.

- [ ] **Step 3: 빌드/타입체크**

Run: `cd apps/api && bun run typecheck && cd ../web && bun run build`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add -A && git commit -m "feat: 테넌트 설정에 계정 삭제 유예기간 입력 추가"
```

---

## Phase 7 — 통합 검증

### Task 12: 마이그레이션 실행 + 전체 검증

- [ ] **Step 1: 마이그레이션 실행(로컬 DB)**

Run: `cd apps/api && bun run migration:run`
Expected: 3개 마이그레이션 적용 성공, 오류 없음

- [ ] **Step 2: 전체 lint/typecheck/test/build**

Run (루트):
```bash
bun run lint
bun run typecheck
bun run test
bun run build
```
Expected: 모두 PASS

- [ ] **Step 3: 수동 스모크(선택)** — 로컬에서 `bun run dev` 후:
  - `POST /api/t/{slug}/oauth/password-reset/request`로 존재/미존재 이메일 응답 확인(둘 다 `sent`; SMTP 끄면 `mail_delivery_failed`)
  - 재설정 링크 토큰으로 `confirm` → 비번 변경·토큰 폐기 확인
  - M2M `deactivate` → `deactivated_at` 세팅·토큰 revoke·(옵션 시)메일 확인

- [ ] **Step 4: 푸시 및 보고**

```bash
git push -u origin feat/password-reset-and-withdrawal
```
개발완료보고서(`docs/reviews/2026-07-07-password-reset-and-withdrawal-review.md`)를 작성하고, 브랜치명·주요 변경·검증 결과를 사용자에게 보고한다(가능 시 telegram-cli 알림).

---

## Self-Review 메모 (계획↔스펙 대조)

- FR-1~FR-11(재설정): Task 1,4,5,6,7,10 커버. 열거 방지 vs 실패 안내(FR-4/5)는 Task 6 `requestReset` 분기 + 테스트로 검증.
- FR-12~FR-19(비활성화·삭제): Task 2,3,8,9 커버. 미인증 INACTIVE 제외(FR-19)는 Task 9의 `deactivated_at IS NOT NULL` 조건.
- FR-20~FR-22(다중 인스턴스): Task 9 advisory lock + SKIP LOCKED.
- 미확정(실행 시 확인 필요): MailModule import 경로, 테넌트 설정 update DTO 경로, 프론트 OAuth axios baseURL 규칙, `usersService.delete()`의 AuditContext에 metadata 허용 여부. 각 태스크 노트에 명시.
