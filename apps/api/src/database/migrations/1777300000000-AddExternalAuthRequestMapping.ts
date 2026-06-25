import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExternalAuthRequestMapping1777300000000 implements MigrationInterface {
  name = 'AddExternalAuthRequestMapping1777300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "external_auth_providers" ADD "request_mapping" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "external_auth_providers" DROP COLUMN "request_mapping"`);
  }
}
