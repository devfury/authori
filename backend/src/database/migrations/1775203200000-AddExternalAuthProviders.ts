import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExternalAuthProviders1775203200000 implements MigrationInterface {
  name = 'AddExternalAuthProviders1775203200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "external_auth_providers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "client_id" character varying, "enabled" boolean NOT NULL DEFAULT true, "provider_url" character varying NOT NULL, "credential_header" character varying, "credential_value" character varying, "jit_provision" boolean NOT NULL DEFAULT true, "sync_on_login" boolean NOT NULL DEFAULT true, "field_mapping" jsonb, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_9be9f58ed2de359bdab2f4e5b0d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_57cc4af0949100bd6f0983cc9d" ON "external_auth_providers" ("tenant_id", "client_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_external_auth_provider_scoped_active" ON "external_auth_providers" ("tenant_id", "client_id") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_external_auth_provider_tenant_default_active" ON "external_auth_providers" ("tenant_id") WHERE "client_id" IS NULL AND "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "external_auth_providers" ADD CONSTRAINT "FK_09c5240a5cbfc6bcb6e1802f911" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "external_auth_providers" DROP CONSTRAINT "FK_09c5240a5cbfc6bcb6e1802f911"`,
    );
    await queryRunner.query(`DROP INDEX "public"."UQ_external_auth_provider_tenant_default_active"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_external_auth_provider_scoped_active"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_57cc4af0949100bd6f0983cc9d"`);
    await queryRunner.query(`DROP TABLE "external_auth_providers"`);
  }
}
