import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateExternalAuthProviderSyncOnLoginDefault1774790381981 implements MigrationInterface {
    name = 'UpdateExternalAuthProviderSyncOnLoginDefault1774790381981'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."audit_logs_action_enum" RENAME TO "audit_logs_action_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."audit_logs_action_enum" AS ENUM('LOGIN.SUCCESS', 'LOGIN.FAILURE', 'LOGOUT', 'TOKEN.ISSUED', 'TOKEN.REFRESHED', 'TOKEN.REVOKED', 'CODE.ISSUED', 'CONSENT.GRANTED', 'CONSENT.REVOKED', 'USER.CREATED', 'USER.UPDATED', 'USER.ACTIVATED', 'USER.DEACTIVATED', 'USER.LOCKED', 'TENANT.CREATED', 'TENANT.UPDATED', 'CLIENT.CREATED', 'CLIENT.SECRET_ROTATED', 'SCHEMA.PUBLISHED', 'EXTERNAL_AUTH.ERROR')`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "action" TYPE "public"."audit_logs_action_enum" USING "action"::"text"::"public"."audit_logs_action_enum"`);
        await queryRunner.query(`DROP TYPE "public"."audit_logs_action_enum_old"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."audit_logs_action_enum_old" AS ENUM('LOGIN.SUCCESS', 'LOGIN.FAILURE', 'LOGOUT', 'TOKEN.ISSUED', 'TOKEN.REFRESHED', 'TOKEN.REVOKED', 'CODE.ISSUED', 'CONSENT.GRANTED', 'CONSENT.REVOKED', 'USER.CREATED', 'USER.UPDATED', 'USER.DEACTIVATED', 'USER.LOCKED', 'TENANT.CREATED', 'TENANT.UPDATED', 'CLIENT.CREATED', 'CLIENT.SECRET_ROTATED', 'SCHEMA.PUBLISHED', 'EXTERNAL_AUTH.ERROR')`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "action" TYPE "public"."audit_logs_action_enum_old" USING "action"::"text"::"public"."audit_logs_action_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."audit_logs_action_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."audit_logs_action_enum_old" RENAME TO "audit_logs_action_enum"`);
    }

}
