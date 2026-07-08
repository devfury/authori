import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserDeactivatedAt1780800100000 implements MigrationInterface {
  name = 'AddUserDeactivatedAt1780800100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "deactivated_at" timestamptz`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "deactivated_at"`);
  }
}
