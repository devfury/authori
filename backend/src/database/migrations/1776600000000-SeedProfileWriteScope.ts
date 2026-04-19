import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedProfileWriteScope1776600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO tenant_scopes (tenant_id, name, display_name, description, is_default)
      SELECT t.id, 'profile:write', 'Profile (Write)',
             'Update the authenticated user profile.', false
      FROM tenants t
      WHERE NOT EXISTS (
        SELECT 1 FROM tenant_scopes s
        WHERE s.tenant_id = t.id AND s.name = 'profile:write'
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM tenant_scopes WHERE name = 'profile:write'`,
    );
  }
}
