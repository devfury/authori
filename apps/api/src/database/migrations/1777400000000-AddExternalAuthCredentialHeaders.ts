import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExternalAuthCredentialHeaders1777400000000 implements MigrationInterface {
  name = 'AddExternalAuthCredentialHeaders1777400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "external_auth_providers" ADD "credential_headers" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "external_auth_providers" DROP COLUMN "credential_headers"`,
    );
  }
}
