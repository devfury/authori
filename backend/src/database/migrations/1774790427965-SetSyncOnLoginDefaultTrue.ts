import { MigrationInterface, QueryRunner } from 'typeorm';

export class SetSyncOnLoginDefaultTrue1774790427965 implements MigrationInterface {
  name = 'SetSyncOnLoginDefaultTrue1774790427965';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 컬럼 기본값을 true로 변경 (신규 등록 프로바이더에 적용)
    await queryRunner.query(
      `ALTER TABLE "external_auth_providers" ALTER COLUMN "sync_on_login" SET DEFAULT true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "external_auth_providers" ALTER COLUMN "sync_on_login" SET DEFAULT false`,
    );
  }
}
