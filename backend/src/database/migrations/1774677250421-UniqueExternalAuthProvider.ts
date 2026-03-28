import { MigrationInterface, QueryRunner } from 'typeorm';

export class UniqueExternalAuthProvider1774677250421 implements MigrationInterface {
  name = 'UniqueExternalAuthProvider1774677250421';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // client_id가 있는 경우: (tenant_id, client_id) 유니크
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_ext_auth_tenant_client_id"
        ON "external_auth_providers" ("tenant_id", "client_id")
        WHERE "client_id" IS NOT NULL
    `);

    // client_id가 NULL인 경우: tenant당 기본 프로바이더 1개만 허용
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_ext_auth_tenant_default"
        ON "external_auth_providers" ("tenant_id")
        WHERE "client_id" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_ext_auth_tenant_client_id"`);
    await queryRunner.query(`DROP INDEX "UQ_ext_auth_tenant_default"`);
  }
}
