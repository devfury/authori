import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantMailSettings1780700000000 implements MigrationInterface {
  name = 'AddTenantMailSettings1780700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tenant_settings" ADD "mail_from" character varying`);
    await queryRunner.query(
      `ALTER TABLE "tenant_settings" ADD "mail_dev_redirect_to" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tenant_settings" DROP COLUMN "mail_dev_redirect_to"`);
    await queryRunner.query(`ALTER TABLE "tenant_settings" DROP COLUMN "mail_from"`);
  }
}
