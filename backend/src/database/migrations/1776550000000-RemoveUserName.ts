import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveUserName1776550000000 implements MigrationInterface {
  name = 'RemoveUserName1776550000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "name"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "name" character varying`);
  }
}
