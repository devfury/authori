import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTenantScopes1775300000000 implements MigrationInterface {
  name = 'CreateTenantScopes1775300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "tenant_scopes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "name" character varying NOT NULL,
        "display_name" character varying NOT NULL,
        "description" text,
        "is_default" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tenant_scopes" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_tenant_scopes_tenant_name"
      ON "tenant_scopes" ("tenant_id", "name")
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_scopes"
      ADD CONSTRAINT "FK_tenant_scopes_tenant"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      INSERT INTO "tenant_scopes" ("tenant_id", "name", "display_name", "description", "is_default")
      SELECT t."id", s."name", s."display_name", s."description", true
      FROM "tenants" t
      CROSS JOIN (
        VALUES
          ('openid', 'OpenID', 'Authenticate the user and issue an OpenID Connect subject.'),
          ('profile', 'Profile', 'Read the user profile claims.'),
          ('email', 'Email', 'Read the user email address.')
      ) AS s("name", "display_name", "description")
    `);

    await queryRunner.query(`
      INSERT INTO "tenant_scopes" ("tenant_id", "name", "display_name", "description", "is_default")
      SELECT DISTINCT c."tenant_id", scope_name, scope_name, NULL, false
      FROM "oauth_clients" c
      CROSS JOIN LATERAL unnest(c."allowed_scopes") AS scope_name
      ON CONFLICT ("tenant_id", "name") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenant_scopes" DROP CONSTRAINT "FK_tenant_scopes_tenant"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_tenant_scopes_tenant_name"`,
    );
    await queryRunner.query(`DROP TABLE "tenant_scopes"`);
  }
}
