import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantDeletedAuditAction1777000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."audit_logs_action_enum" ADD VALUE IF NOT EXISTS 'TENANT.DELETED'`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL은 ENUM 값 제거를 지원하지 않으므로 down은 no-op
  }
}
