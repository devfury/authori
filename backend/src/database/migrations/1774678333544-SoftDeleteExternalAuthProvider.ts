import { MigrationInterface, QueryRunner } from 'typeorm';

export class SoftDeleteExternalAuthProvider1774678333544 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // deleted_at 컬럼 추가
    await queryRunner.query(
      `ALTER TABLE "external_auth_providers" ADD COLUMN "deleted_at" TIMESTAMPTZ NULL`,
    );

    // 기존 유니크 인덱스 제거 후 soft-delete 조건 포함하여 재생성
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_ext_auth_tenant_client_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_ext_auth_tenant_default"`);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_ext_auth_tenant_client_id"
        ON "external_auth_providers" ("tenant_id", "client_id")
        WHERE "client_id" IS NOT NULL AND "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_ext_auth_tenant_default"
        ON "external_auth_providers" ("tenant_id")
        WHERE "client_id" IS NULL AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_ext_auth_tenant_client_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_ext_auth_tenant_default"`);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_ext_auth_tenant_client_id"
        ON "external_auth_providers" ("tenant_id", "client_id")
        WHERE "client_id" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_ext_auth_tenant_default"
        ON "external_auth_providers" ("tenant_id")
        WHERE "client_id" IS NULL
    `);

    await queryRunner.query(
      `ALTER TABLE "external_auth_providers" DROP COLUMN "deleted_at"`,
    );
  }
}
