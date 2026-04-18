import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRbacTables1775400000000 implements MigrationInterface {
  name = 'CreateRbacTables1775400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "tenant_roles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "name" character varying NOT NULL,
        "display_name" character varying NOT NULL,
        "description" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tenant_roles" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_tenant_roles_tenant_name"
      ON "tenant_roles" ("tenant_id", "name")
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_roles"
      ADD CONSTRAINT "FK_tenant_roles_tenant"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE TABLE "tenant_permissions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "name" character varying NOT NULL,
        "display_name" character varying NOT NULL,
        "description" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tenant_permissions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_tenant_permissions_tenant_name"
      ON "tenant_permissions" ("tenant_id", "name")
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_permissions"
      ADD CONSTRAINT "FK_tenant_permissions_tenant"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE TABLE "role_permissions" (
        "role_id" uuid NOT NULL,
        "permission_id" uuid NOT NULL,
        CONSTRAINT "PK_role_permissions" PRIMARY KEY ("role_id", "permission_id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "role_permissions"
      ADD CONSTRAINT "FK_role_permissions_role"
      FOREIGN KEY ("role_id") REFERENCES "tenant_roles"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "role_permissions"
      ADD CONSTRAINT "FK_role_permissions_permission"
      FOREIGN KEY ("permission_id") REFERENCES "tenant_permissions"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE TABLE "user_roles" (
        "user_id" uuid NOT NULL,
        "role_id" uuid NOT NULL,
        CONSTRAINT "PK_user_roles" PRIMARY KEY ("user_id", "role_id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "user_roles"
      ADD CONSTRAINT "FK_user_roles_user"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "user_roles"
      ADD CONSTRAINT "FK_user_roles_role"
      FOREIGN KEY ("role_id") REFERENCES "tenant_roles"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_roles" DROP CONSTRAINT "FK_user_roles_role"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_roles" DROP CONSTRAINT "FK_user_roles_user"`,
    );
    await queryRunner.query(`DROP TABLE "user_roles"`);

    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_role_permissions_permission"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_role_permissions_role"`,
    );
    await queryRunner.query(`DROP TABLE "role_permissions"`);

    await queryRunner.query(
      `ALTER TABLE "tenant_permissions" DROP CONSTRAINT "FK_tenant_permissions_tenant"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_tenant_permissions_tenant_name"`,
    );
    await queryRunner.query(`DROP TABLE "tenant_permissions"`);

    await queryRunner.query(
      `ALTER TABLE "tenant_roles" DROP CONSTRAINT "FK_tenant_roles_tenant"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_tenant_roles_tenant_name"`,
    );
    await queryRunner.query(`DROP TABLE "tenant_roles"`);
  }
}
