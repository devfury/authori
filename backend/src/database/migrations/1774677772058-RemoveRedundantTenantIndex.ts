import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveRedundantTenantIndex1774677772058 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ext_auth_tenant"`);
    await queryRunner.query(`DROP UNIQUE INDEX IF EXISTS "UQ_ext_auth_tenant_default"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_ext_auth_tenant" ON "external_auth_providers" ("tenant_id")`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_ext_auth_tenant_default"
        ON "external_auth_providers" ("tenant_id")
        WHERE "client_id" IS NULL
    `);
  }
}
