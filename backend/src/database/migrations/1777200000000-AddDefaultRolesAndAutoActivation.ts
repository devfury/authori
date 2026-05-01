import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDefaultRolesAndAutoActivation1777200000000
  implements MigrationInterface
{
  name = 'AddDefaultRolesAndAutoActivation1777200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_roles"
      ADD COLUMN "is_default" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_settings"
      ADD COLUMN "auto_activate_registration" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_settings"
      DROP COLUMN "auto_activate_registration"
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_roles"
      DROP COLUMN "is_default"
    `);
  }
}
