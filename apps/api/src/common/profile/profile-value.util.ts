/**
 * 값이 `null`·`undefined` 인 키를 제거한 새 객체를 돌려준다.
 *
 * `profile_jsonb` 는 "값 없음"을 **키 부재로만** 표현한다. 같은 뜻을 `null` 과
 * 키 부재 두 가지로 표현하던 것이 UserInfo 소비자에서 `null.trim()` 예외를
 * 낸 원인이었다(2026-09-02 장애). 표현을 하나로 줄여 소비자가 두 경우를
 * 처리하지 않아도 되게 한다.
 *
 * `false`·`0`·`''` 는 유효한 값이므로 남긴다 — falsy 전체를 지우면 사용자가
 * 실제로 입력한 값이 사라진다.
 *
 * 호출 위치가 의미를 결정한다.
 * - `{ ...기존, ...omitNullValues(패치) }` → 패치의 `null` 을 무시(기존 값 보존)
 * - `omitNullValues({ ...기존, ...패치 })` → 패치의 `null` 로 해당 키 삭제
 */
export function omitNullValues(source: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === null || value === undefined) continue;
    result[key] = value;
  }
  return result;
}
