import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePendingOAuthRequests1777100000000
  implements MigrationInterface
{
  name = 'CreatePendingOAuthRequests1777100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "pending_oauth_requests" (
        "id"                    uuid          NOT NULL,
        "tenant_id"             character varying NOT NULL,
        "tenant_slug"           character varying NOT NULL,
        "client_id"             character varying NOT NULL,
        "redirect_uri"          character varying NOT NULL,
        "scopes"                text[]        NOT NULL,
        "state"                 character varying,
        "code_challenge"        character varying,
        "code_challenge_method" character varying,
        "expires_at"            TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_at"            TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pending_oauth_requests" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_pending_oauth_requests_expires_at"
        ON "pending_oauth_requests" ("expires_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_pending_oauth_requests_expires_at"`,
    );
    await queryRunner.query(`DROP TABLE "pending_oauth_requests"`);
  }
}
