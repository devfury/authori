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
