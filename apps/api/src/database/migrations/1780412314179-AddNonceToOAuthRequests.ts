import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNonceToOAuthRequests1780412314179 implements MigrationInterface {
  name = 'AddNonceToOAuthRequests1780412314179';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "authorization_codes" ADD "nonce" character varying`);
    await queryRunner.query(`ALTER TABLE "pending_oauth_requests" ADD "nonce" character varying`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "pending_oauth_requests" DROP COLUMN "nonce"`);
    await queryRunner.query(`ALTER TABLE "authorization_codes" DROP COLUMN "nonce"`);
  }
}
