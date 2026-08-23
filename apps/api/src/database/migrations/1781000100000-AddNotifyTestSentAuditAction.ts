import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AuditAction.NOTIFY_TEST_SENT를 audit_logs.action ENUM 타입에 추가한다.
 * 1781000000000-AddPendingApprovalNotify에서 TS enum만 추가하고 DB ENUM 값을 빠뜨려
 * ezAria 테스트 발송 시 감사 로그 INSERT가 22P02로 실패했다.
 */
export class AddNotifyTestSentAuditAction1781000100000 implements MigrationInterface {
  name = 'AddNotifyTestSentAuditAction1781000100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."audit_logs_action_enum" ADD VALUE IF NOT EXISTS 'NOTIFY.TEST_SENT'`,
    );
  }

  // PostgreSQL은 ENUM 값 제거를 지원하지 않으므로 down은 no-op
  public async down(): Promise<void> {
    return Promise.resolve();
  }
}
