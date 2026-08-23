import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPendingApprovalNotify1781000000000 implements MigrationInterface {
  name = 'AddPendingApprovalNotify1781000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenant_settings" ADD COLUMN "pending_approval_notify_enabled" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_settings" ADD COLUMN "ezaria_chat_room_id" character varying(128)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "pending_approval_since" TIMESTAMP WITH TIME ZONE`,
    );

    // 기존 승인 대기 사용자 백필.
    // 이메일 인증이 꺼진 테넌트의 미탈퇴(deactivated_at IS NULL) INACTIVE 사용자는
    // 관리자 승인 대기 상태이므로 created_at을 표식으로 채워 첫 다이제스트부터 집계에 포함시킨다.
    await queryRunner.query(`
      UPDATE "users" u
      SET "pending_approval_since" = u."created_at"
      FROM "tenant_settings" ts
      WHERE ts."tenant_id" = u."tenant_id"
        AND u."status" = 'INACTIVE'
        AND u."deactivated_at" IS NULL
        AND ts."email_verification_required" = false
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_users_pending_approval" ON "users" ("tenant_id", "pending_approval_since") WHERE "pending_approval_since" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_users_pending_approval"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "pending_approval_since"`);
    await queryRunner.query(`ALTER TABLE "tenant_settings" DROP COLUMN "ezaria_chat_room_id"`);
    await queryRunner.query(
      `ALTER TABLE "tenant_settings" DROP COLUMN "pending_approval_notify_enabled"`,
    );
  }
}
