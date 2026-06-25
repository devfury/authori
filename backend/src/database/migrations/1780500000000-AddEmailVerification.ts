import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmailVerification1780500000000 implements MigrationInterface {
  name = 'AddEmailVerification1780500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_settings"
      ADD "email_verification_required" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      CREATE TABLE "email_verification_tokens" (
        "id"         uuid              NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id"  uuid              NOT NULL,
        "user_id"    uuid              NOT NULL,
        "token_hash" character varying NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "used_at"    TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_email_verification_tokens" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_email_verification_tokens_token_hash"
        ON "email_verification_tokens" ("token_hash")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_email_verification_tokens_user_id"
        ON "email_verification_tokens" ("user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_email_verification_tokens_user_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_email_verification_tokens_token_hash"`,
    );
    await queryRunner.query(`DROP TABLE "email_verification_tokens"`);
    await queryRunner.query(
      `ALTER TABLE "tenant_settings" DROP COLUMN "email_verification_required"`,
    );
  }
}
