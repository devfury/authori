import { MigrationInterface, QueryRunner } from 'typeorm';

export class PostVerificationRedirect1780600000000 implements MigrationInterface {
  name = 'PostVerificationRedirect1780600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "oauth_clients"
      ADD "post_verification_redirect_uri" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "email_verification_tokens"
      ADD "client_id" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "email_verification_tokens"
      ADD "continue_uri" character varying
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "email_verification_tokens" DROP COLUMN "continue_uri"`);
    await queryRunner.query(`ALTER TABLE "email_verification_tokens" DROP COLUMN "client_id"`);
    await queryRunner.query(
      `ALTER TABLE "oauth_clients" DROP COLUMN "post_verification_redirect_uri"`,
    );
  }
}
