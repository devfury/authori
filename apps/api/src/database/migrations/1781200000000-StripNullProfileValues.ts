import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * user_profiles.profile_jsonb 에 남아 있는 null 값 항목을 제거한다.
 *
 * profile_jsonb 는 값 없음을 키 부재로만 표현한다는 불변식을 세웠으나
 * (omitNullValues), 외부 인증 동기화 경로가 상류의 null 을 그대로 저장해 온
 * 기간이 있다. 저장된 null 은 UserInfo 를 통해 그대로 흘러 나가 클레임을
 * 문자열로 기대한 소비자를 깨뜨렸다(2026-09-02 ezDesk 로그인 장애).
 *
 * WHERE EXISTS 로 대상 행만 갱신하므로 재실행 시 0건이 되어 멱등하다.
 * 모든 키가 null 인 행은 jsonb_object_agg 가 NULL 을 반환하므로 '{}' 로 채운다.
 */
export class StripNullProfileValues1781200000000 implements MigrationInterface {
  name = 'StripNullProfileValues1781200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "user_profiles"
      SET "profile_jsonb" = COALESCE(
        (
          SELECT jsonb_object_agg(e.key, e.value)
          FROM jsonb_each("profile_jsonb") AS e
          WHERE e.value <> 'null'::jsonb
        ),
        '{}'::jsonb
      )
      WHERE jsonb_typeof("profile_jsonb") = 'object'
        AND EXISTS (
          SELECT 1 FROM jsonb_each("profile_jsonb") AS e WHERE e.value = 'null'::jsonb
        )
    `);
  }

  public async down(): Promise<void> {
    // 되돌리지 않는다. null 값 키는 정보를 담고 있지 않아 복원할 대상이 없고,
    // 어떤 키가 있었는지도 기록해 두지 않았다.
  }
}
