import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 가입 승인 보류(거절) 기능:
 * - users.approval_held_at — 보류 시각 표식. NULL이면 보류 아님(기존 사용자 전원 NULL → 집계 불변).
 * - audit_logs_action_enum에 'USER.APPROVAL_HELD' 추가. TS enum과 DB ENUM을 같은 마이그레이션에서
 *   함께 반영한다(1781000100000에서 DB ENUM 누락으로 감사 로그 INSERT가 22P02로 실패했던 전례).
 */
export class AddUserApprovalHold1781100000000 implements MigrationInterface {
  name = 'AddUserApprovalHold1781100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "approval_held_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(
      `ALTER TYPE "public"."audit_logs_action_enum" ADD VALUE IF NOT EXISTS 'USER.APPROVAL_HELD'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL은 ENUM 값 제거를 지원하지 않으므로 컬럼만 되돌린다.
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "approval_held_at"`);
  }
}
