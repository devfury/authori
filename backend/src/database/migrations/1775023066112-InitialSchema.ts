import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1775023066112 implements MigrationInterface {
    name = 'InitialSchema1775023066112'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "tenant_settings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "access_token_ttl" integer NOT NULL DEFAULT '3600', "refresh_token_ttl" integer NOT NULL DEFAULT '2592000', "require_pkce" boolean NOT NULL DEFAULT true, "allowed_grants" text array NOT NULL DEFAULT '{authorization_code,refresh_token}', "refresh_token_rotation" boolean NOT NULL DEFAULT true, "password_min_length" integer NOT NULL DEFAULT '8', "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "REL_a6abc1c3ed0df635955fc852f1" UNIQUE ("tenant_id"), CONSTRAINT "PK_69225c0ca64bcbbf9af8a217043" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."profile_schema_versions_status_enum" AS ENUM('DRAFT', 'PUBLISHED', 'DEPRECATED')`);
        await queryRunner.query(`CREATE TABLE "profile_schema_versions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "version" integer NOT NULL, "schema_jsonb" jsonb NOT NULL, "status" "public"."profile_schema_versions_status_enum" NOT NULL DEFAULT 'DRAFT', "published_by" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_09761f5cb9cd4652fcb0f9391b9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_cbabadf1007c2d23df258321f8" ON "profile_schema_versions" ("tenant_id", "version") `);
        await queryRunner.query(`CREATE TABLE "user_profiles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "tenant_id" character varying NOT NULL, "schema_version_id" uuid, "profile_jsonb" jsonb NOT NULL DEFAULT '{}', "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "REL_6ca9503d77ae39b4b5a6cc3ba8" UNIQUE ("user_id"), CONSTRAINT "PK_1ec6662219f4605723f1e41b6cb" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_0047a332edda010ae29c24d0c1" ON "user_profiles" ("tenant_id") `);
        await queryRunner.query(`CREATE TYPE "public"."users_status_enum" AS ENUM('ACTIVE', 'INACTIVE', 'LOCKED')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "login_id" character varying, "email" character varying NOT NULL, "name" character varying, "password_hash" character varying NOT NULL, "status" "public"."users_status_enum" NOT NULL DEFAULT 'ACTIVE', "failed_login_attempts" integer NOT NULL DEFAULT '0', "locked_until" TIMESTAMP WITH TIME ZONE, "last_login_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_e9f4c2efab52114c4e99e28efb" ON "users" ("tenant_id", "email") `);
        await queryRunner.query(`CREATE TABLE "oauth_client_redirect_uris" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "client_id" character varying NOT NULL, "uri" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_162e2f31eae5ca6e7e33dd7bdc6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."authorization_codes_code_challenge_method_enum" AS ENUM('S256', 'PLAIN')`);
        await queryRunner.query(`CREATE TABLE "authorization_codes" ("code" character varying NOT NULL, "tenant_id" character varying NOT NULL, "client_id" character varying NOT NULL, "user_id" uuid NOT NULL, "redirect_uri" character varying NOT NULL, "scopes" text array NOT NULL, "code_challenge" character varying, "code_challenge_method" "public"."authorization_codes_code_challenge_method_enum", "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_0dbddae21cb087717e5207a5bd1" PRIMARY KEY ("code"))`);
        await queryRunner.query(`CREATE TABLE "access_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" character varying NOT NULL, "client_id" character varying NOT NULL, "user_id" uuid, "jti" character varying NOT NULL, "scopes" text array NOT NULL, "revoked" boolean NOT NULL DEFAULT false, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_65140f59763ff994a0252488166" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_28772cc8c3cd0a9d22318e0780" ON "access_tokens" ("jti") `);
        await queryRunner.query(`CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" character varying NOT NULL, "client_id" character varying NOT NULL, "user_id" uuid NOT NULL, "token_hash" character varying NOT NULL, "family_id" character varying NOT NULL, "scopes" text array NOT NULL, "revoked" boolean NOT NULL DEFAULT false, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_a7838d2ba25be1342091b6695f" ON "refresh_tokens" ("token_hash") `);
        await queryRunner.query(`CREATE INDEX "IDX_d5e27da0cd39bc3bb2811fc8ba" ON "refresh_tokens" ("family_id") `);
        await queryRunner.query(`CREATE TABLE "consents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" character varying NOT NULL, "user_id" uuid NOT NULL, "client_id" character varying NOT NULL, "granted_scopes" text array NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_9efc68eb6aba7d638fb6ea034dd" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_04a891ecb30b4f5f16b2a36188" ON "consents" ("tenant_id", "user_id", "client_id") `);
        await queryRunner.query(`CREATE TYPE "public"."oauth_clients_type_enum" AS ENUM('CONFIDENTIAL', 'PUBLIC')`);
        await queryRunner.query(`CREATE TYPE "public"."oauth_clients_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`);
        await queryRunner.query(`CREATE TABLE "oauth_clients" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "client_id" character varying NOT NULL, "client_secret_hash" character varying, "name" character varying NOT NULL, "type" "public"."oauth_clients_type_enum" NOT NULL DEFAULT 'CONFIDENTIAL', "status" "public"."oauth_clients_status_enum" NOT NULL DEFAULT 'ACTIVE', "allowed_scopes" text array NOT NULL DEFAULT '{openid}', "allowed_grants" text array NOT NULL DEFAULT '{authorization_code}', "branding" jsonb, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_c5c4af500cc8bfc05500fff7f90" UNIQUE ("client_id"), CONSTRAINT "PK_c4759172d3431bae6f04e678e0d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_96f49bea5a6d6e6d40d900d718" ON "oauth_clients" ("tenant_id", "client_id") `);
        await queryRunner.query(`CREATE TYPE "public"."audit_logs_action_enum" AS ENUM('LOGIN.SUCCESS', 'LOGIN.FAILURE', 'LOGOUT', 'TOKEN.ISSUED', 'TOKEN.REFRESHED', 'TOKEN.REVOKED', 'CODE.ISSUED', 'CONSENT.GRANTED', 'CONSENT.REVOKED', 'USER.CREATED', 'USER.UPDATED', 'USER.ACTIVATED', 'USER.DEACTIVATED', 'USER.LOCKED', 'TENANT.CREATED', 'TENANT.UPDATED', 'CLIENT.CREATED', 'CLIENT.SECRET_ROTATED', 'SCHEMA.PUBLISHED', 'EXTERNAL_AUTH.ERROR')`);
        await queryRunner.query(`CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid, "actor_id" character varying, "actor_type" character varying, "action" "public"."audit_logs_action_enum" NOT NULL, "target_type" character varying, "target_id" character varying, "success" boolean NOT NULL DEFAULT true, "metadata" jsonb, "ip_address" character varying, "user_agent" character varying, "request_id" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_177183f29f438c488b5e8510cd" ON "audit_logs" ("actor_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_898d14750b88319b89b1ab66cd" ON "audit_logs" ("tenant_id", "created_at") `);
        await queryRunner.query(`CREATE TYPE "public"."signing_keys_algorithm_enum" AS ENUM('RS256', 'ES256')`);
        await queryRunner.query(`CREATE TYPE "public"."signing_keys_status_enum" AS ENUM('ACTIVE', 'RETIRED')`);
        await queryRunner.query(`CREATE TABLE "signing_keys" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid, "kid" character varying NOT NULL, "algorithm" "public"."signing_keys_algorithm_enum" NOT NULL DEFAULT 'RS256', "public_key" text NOT NULL, "private_key" text NOT NULL, "status" "public"."signing_keys_status_enum" NOT NULL DEFAULT 'ACTIVE', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "retired_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_ab7d78cf6e61dc3904133b4cd55" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."tenants_status_enum" AS ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED')`);
        await queryRunner.query(`CREATE TABLE "tenants" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "slug" character varying NOT NULL, "name" character varying NOT NULL, "issuer" character varying, "status" "public"."tenants_status_enum" NOT NULL DEFAULT 'ACTIVE', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_2310ecc5cb8be427097154b18fc" UNIQUE ("slug"), CONSTRAINT "PK_53be67a04681c66b87ee27c9321" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."admin_users_role_enum" AS ENUM('PLATFORM_ADMIN', 'TENANT_ADMIN')`);
        await queryRunner.query(`CREATE TYPE "public"."admin_users_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`);
        await queryRunner.query(`CREATE TABLE "admin_users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "name" character varying, "password_hash" character varying NOT NULL, "role" "public"."admin_users_role_enum" NOT NULL, "tenant_id" uuid, "status" "public"."admin_users_status_enum" NOT NULL DEFAULT 'ACTIVE', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_06744d221bb6145dc61e5dc441d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_dcd0c8a4b10af9c986e510b9ec" ON "admin_users" ("email") `);
        await queryRunner.query(`ALTER TABLE "tenant_settings" ADD CONSTRAINT "FK_a6abc1c3ed0df635955fc852f1c" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "profile_schema_versions" ADD CONSTRAINT "FK_ecf6de037a807c91243c03bf869" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_profiles" ADD CONSTRAINT "FK_6ca9503d77ae39b4b5a6cc3ba88" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_profiles" ADD CONSTRAINT "FK_df0ac090f9b68b8fd7ef0b775ba" FOREIGN KEY ("schema_version_id") REFERENCES "profile_schema_versions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_109638590074998bb72a2f2cf08" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "oauth_client_redirect_uris" ADD CONSTRAINT "FK_433d1e5d76dbb9a91f094828263" FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("client_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "authorization_codes" ADD CONSTRAINT "FK_9b6780f6c2ce73987f7cabb4ae3" FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("client_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "authorization_codes" ADD CONSTRAINT "FK_68f8ccfda6bb17fb159cc965cce" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "access_tokens" ADD CONSTRAINT "FK_45d8b3be92f43e7f01600443a19" FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("client_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "access_tokens" ADD CONSTRAINT "FK_09ee750a035b06e0c7f0704687e" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_795771f59bffe508b60827b01eb" FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("client_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "consents" ADD CONSTRAINT "FK_946390b9024aba22cd1c1621430" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "consents" ADD CONSTRAINT "FK_618e4fb7c4dc5b95a223cc9866c" FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("client_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "oauth_clients" ADD CONSTRAINT "FK_74abff294e8ab96ed7e41c058c9" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ADD CONSTRAINT "FK_6f18d459490bb48923b1f40bdb7" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "signing_keys" ADD CONSTRAINT "FK_4743a982b7bef0a8b4fa6c7003e" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "signing_keys" DROP CONSTRAINT "FK_4743a982b7bef0a8b4fa6c7003e"`);
        await queryRunner.query(`ALTER TABLE "audit_logs" DROP CONSTRAINT "FK_6f18d459490bb48923b1f40bdb7"`);
        await queryRunner.query(`ALTER TABLE "oauth_clients" DROP CONSTRAINT "FK_74abff294e8ab96ed7e41c058c9"`);
        await queryRunner.query(`ALTER TABLE "consents" DROP CONSTRAINT "FK_618e4fb7c4dc5b95a223cc9866c"`);
        await queryRunner.query(`ALTER TABLE "consents" DROP CONSTRAINT "FK_946390b9024aba22cd1c1621430"`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4"`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_795771f59bffe508b60827b01eb"`);
        await queryRunner.query(`ALTER TABLE "access_tokens" DROP CONSTRAINT "FK_09ee750a035b06e0c7f0704687e"`);
        await queryRunner.query(`ALTER TABLE "access_tokens" DROP CONSTRAINT "FK_45d8b3be92f43e7f01600443a19"`);
        await queryRunner.query(`ALTER TABLE "authorization_codes" DROP CONSTRAINT "FK_68f8ccfda6bb17fb159cc965cce"`);
        await queryRunner.query(`ALTER TABLE "authorization_codes" DROP CONSTRAINT "FK_9b6780f6c2ce73987f7cabb4ae3"`);
        await queryRunner.query(`ALTER TABLE "oauth_client_redirect_uris" DROP CONSTRAINT "FK_433d1e5d76dbb9a91f094828263"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_109638590074998bb72a2f2cf08"`);
        await queryRunner.query(`ALTER TABLE "user_profiles" DROP CONSTRAINT "FK_df0ac090f9b68b8fd7ef0b775ba"`);
        await queryRunner.query(`ALTER TABLE "user_profiles" DROP CONSTRAINT "FK_6ca9503d77ae39b4b5a6cc3ba88"`);
        await queryRunner.query(`ALTER TABLE "profile_schema_versions" DROP CONSTRAINT "FK_ecf6de037a807c91243c03bf869"`);
        await queryRunner.query(`ALTER TABLE "tenant_settings" DROP CONSTRAINT "FK_a6abc1c3ed0df635955fc852f1c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_dcd0c8a4b10af9c986e510b9ec"`);
        await queryRunner.query(`DROP TABLE "admin_users"`);
        await queryRunner.query(`DROP TYPE "public"."admin_users_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."admin_users_role_enum"`);
        await queryRunner.query(`DROP TABLE "tenants"`);
        await queryRunner.query(`DROP TYPE "public"."tenants_status_enum"`);
        await queryRunner.query(`DROP TABLE "signing_keys"`);
        await queryRunner.query(`DROP TYPE "public"."signing_keys_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."signing_keys_algorithm_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_898d14750b88319b89b1ab66cd"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_177183f29f438c488b5e8510cd"`);
        await queryRunner.query(`DROP TABLE "audit_logs"`);
        await queryRunner.query(`DROP TYPE "public"."audit_logs_action_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_96f49bea5a6d6e6d40d900d718"`);
        await queryRunner.query(`DROP TABLE "oauth_clients"`);
        await queryRunner.query(`DROP TYPE "public"."oauth_clients_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."oauth_clients_type_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_04a891ecb30b4f5f16b2a36188"`);
        await queryRunner.query(`DROP TABLE "consents"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d5e27da0cd39bc3bb2811fc8ba"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a7838d2ba25be1342091b6695f"`);
        await queryRunner.query(`DROP TABLE "refresh_tokens"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_28772cc8c3cd0a9d22318e0780"`);
        await queryRunner.query(`DROP TABLE "access_tokens"`);
        await queryRunner.query(`DROP TABLE "authorization_codes"`);
        await queryRunner.query(`DROP TYPE "public"."authorization_codes_code_challenge_method_enum"`);
        await queryRunner.query(`DROP TABLE "oauth_client_redirect_uris"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e9f4c2efab52114c4e99e28efb"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0047a332edda010ae29c24d0c1"`);
        await queryRunner.query(`DROP TABLE "user_profiles"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cbabadf1007c2d23df258321f8"`);
        await queryRunner.query(`DROP TABLE "profile_schema_versions"`);
        await queryRunner.query(`DROP TYPE "public"."profile_schema_versions_status_enum"`);
        await queryRunner.query(`DROP TABLE "tenant_settings"`);
    }

}
