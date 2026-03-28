import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBrandingAndExternalAuth1775000000000 implements MigrationInterface {
  name = 'AddBrandingAndExternalAuth1775000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // oauth_clients에 branding 컬럼 추가
    await queryRunner.query(`ALTER TABLE "oauth_clients" ADD COLUMN "branding" jsonb NULL`);

    // audit_logs action enum에 외부 인증 값 추가
    await queryRunner.query(`ALTER TYPE "public"."audit_logs_action_enum" ADD VALUE IF NOT EXISTS 'EXTERNAL_AUTH.ERROR'`);

    // external_auth_providers 테이블 생성
    await queryRunner.query(`
      CREATE TABLE "external_auth_providers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "client_id" character varying NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "provider_url" text NOT NULL,
        "credential_header" character varying NULL,
        "credential_value" character varying NULL,
        "jit_provision" boolean NOT NULL DEFAULT true,
        "sync_on_login" boolean NOT NULL DEFAULT false,
        "field_mapping" jsonb NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_external_auth_providers" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_ext_auth_tenant" ON "external_auth_providers" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_ext_auth_tenant_client" ON "external_auth_providers" ("tenant_id", "client_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_ext_auth_tenant_client"`);
    await queryRunner.query(`DROP INDEX "IDX_ext_auth_tenant"`);
    await queryRunner.query(`DROP TABLE "external_auth_providers"`);
    await queryRunner.query(`ALTER TABLE "oauth_clients" DROP COLUMN "branding"`);
  }
}
