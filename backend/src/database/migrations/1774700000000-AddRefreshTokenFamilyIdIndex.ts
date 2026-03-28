import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRefreshTokenFamilyIdIndex1774700000000 implements MigrationInterface {
  name = 'AddRefreshTokenFamilyIdIndex1774700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_tokens_family_id" ON "refresh_tokens" ("family_id") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_refresh_tokens_family_id"`,
    );
  }
}
