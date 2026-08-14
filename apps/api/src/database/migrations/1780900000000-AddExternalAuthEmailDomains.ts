import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExternalAuthEmailDomains1780900000000 implements MigrationInterface {
  name = 'AddExternalAuthEmailDomains1780900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "external_auth_providers" ADD COLUMN "email_domains" jsonb`,
    );
    // 도메인 조건이 있는 프로바이더는 같은 범위에 여러 개 등록할 수 있어
    // 기존 범위 전체 유니크 인덱스를 도메인 조건 없는 경우에만 적용하도록 좁힌다.
    await queryRunner.query(`DROP INDEX "public"."UQ_external_auth_provider_scoped_active"`);
    await queryRunner.query(
      `DROP INDEX "public"."UQ_external_auth_provider_tenant_default_active"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_external_auth_provider_scoped_unrestricted_active" ON "external_auth_providers" ("tenant_id", "client_id") WHERE "deleted_at" IS NULL AND "client_id" IS NOT NULL AND "email_domains" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_external_auth_provider_tenant_default_unrestricted_active" ON "external_auth_providers" ("tenant_id") WHERE "client_id" IS NULL AND "deleted_at" IS NULL AND "email_domains" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."UQ_external_auth_provider_tenant_default_unrestricted_active"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_external_auth_provider_scoped_unrestricted_active"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_external_auth_provider_scoped_active" ON "external_auth_providers" ("tenant_id", "client_id") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_external_auth_provider_tenant_default_active" ON "external_auth_providers" ("tenant_id") WHERE "client_id" IS NULL AND "deleted_at" IS NULL`,
    );
    await queryRunner.query(`ALTER TABLE "external_auth_providers" DROP COLUMN "email_domains"`);
  }
}
