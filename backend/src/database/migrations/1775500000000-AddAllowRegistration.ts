import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAllowRegistration1775500000000 implements MigrationInterface {
  name = 'AddAllowRegistration1775500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_settings"
      ADD COLUMN "allow_registration" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_settings"
      DROP COLUMN "allow_registration"
    `);
  }
}
