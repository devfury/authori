import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 한 관리자가 여러 테넌트를 관리할 수 있게 한다.
 *
 * admin_users.tenant_id 단일 컬럼을 admin_user_tenants N:M 매핑으로 대체한다.
 *
 * ⚠️ 순서가 중요하다. 기존 배정을 매핑 테이블로 옮긴 **뒤에** 컬럼을 제거한다.
 *    순서가 뒤바뀌면 기존 TENANT_ADMIN 의 배정이 전량 소실된다.
 *
 * ⚠️ 배포 제약: 컬럼이 사라지므로 구버전 API 와 신버전 스키마는 공존할 수 없다.
 *    구버전 코드는 admin_users.tenant_id 를 SELECT 하다 실패한다. 마이그레이션과
 *    API 배포를 같은 창에서 수행한다. 무중단이 필요하면 (1) 테이블 생성·이관,
 *    (2) 신버전 API 배포, (3) 컬럼 제거 — 세 단계로 쪼개야 한다.
 */
export class AddAdminUserTenants1781300000000 implements MigrationInterface {
  name = 'AddAdminUserTenants1781300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "admin_user_tenants" (
        "admin_user_id" uuid NOT NULL,
        "tenant_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_admin_user_tenants" PRIMARY KEY ("admin_user_id", "tenant_id")
      )
    `);

    // 복합 PK 의 선두가 admin_user_id 라 테넌트 기준 역방향 조회는 타지 못한다.
    await queryRunner.query(
      `CREATE INDEX "IDX_admin_user_tenants_tenant" ON "admin_user_tenants" ("tenant_id")`,
    );

    await queryRunner.query(`
      ALTER TABLE "admin_user_tenants"
      ADD CONSTRAINT "FK_admin_user_tenants_admin"
      FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "admin_user_tenants"
      ADD CONSTRAINT "FK_admin_user_tenants_tenant"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
    `);

    // 기존 배정 이관. 반드시 DROP COLUMN 보다 먼저.
    await queryRunner.query(`
      INSERT INTO "admin_user_tenants" ("admin_user_id", "tenant_id")
      SELECT "id", "tenant_id" FROM "admin_users" WHERE "tenant_id" IS NOT NULL
    `);

    await queryRunner.query(`ALTER TABLE "admin_users" DROP COLUMN "tenant_id"`);
  }

  /**
   * ⚠️ 정보 손실이 있다. 단일 컬럼으로 되돌리므로 2개 이상 배정된 관리자는
   *    가장 먼저 배정된 하나만 남고 나머지는 사라진다. 롤백 전에
   *    admin_user_tenants 를 백업해야 한다.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "admin_users" ADD "tenant_id" uuid`);

    // created_at 동률에 대비해 tenant_id 로 2차 정렬해 결과를 결정적으로 만든다.
    await queryRunner.query(`
      UPDATE "admin_users" a SET "tenant_id" = (
        SELECT t."tenant_id" FROM "admin_user_tenants" t
        WHERE t."admin_user_id" = a."id"
        ORDER BY t."created_at", t."tenant_id"
        LIMIT 1
      )
    `);

    await queryRunner.query(`DROP TABLE "admin_user_tenants"`);
  }
}
