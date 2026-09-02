# 개발설계서 — 프로필 null 값 저장·노출 차단

- 작성일: 2026-09-02
- 작성자: Jinho Lee
- 관련 요구사항: [요구사항정의서](../requirements/2026-09-02-profile-null-value-requirements.md)

## 1. 범위

`profile_jsonb` 에 대한 **하나의 불변식**을 세우고, 그 불변식을 읽기 경계와 쓰기 경계 양쪽에서 강제한다.

> **불변식**: `user_profiles.profile_jsonb` 는 값이 `null` 인 키를 보관하지 않는다. 값이 없는 항목은 **키가 존재하지 않는 것**으로 표현한다.

비범위는 요구사항정의서 §5 를 따른다.

## 2. 설계 결정

| ID | 결정 | 근거 |
|---|---|---|
| DEC-1 | 값 없음의 표현을 **키 부재**로 단일화한다. `null` 과 키 부재가 같은 뜻을 두 가지로 표현하던 것이 이번 장애의 뿌리다. | 두 표현이 공존하면 모든 소비자가 두 경우를 다 처리해야 한다. 소비자를 고치는 대신 표현을 하나로 줄인다. |
| DEC-2 | 읽기(UserInfo)와 쓰기(저장 경로) **양쪽 모두** 막는다. 읽기 한쪽만 고치면 DB 에는 계속 `null` 이 쌓이고, 쓰기만 고치면 기존 데이터가 계속 새어 나간다. | 이미 저장된 값과 앞으로 들어올 값이 서로 다른 경로를 타므로 한쪽 방어로는 불변식이 성립하지 않는다. |
| DEC-3 | 외부 인증 동기화에서 상류의 `null` 은 **무시**한다(기존 저장값 보존). 관리자·본인 수정에서의 `null` 은 **키 삭제**로 처리한다. | 상류 응답은 기계가 만든 것이라 필드 누락과 "값을 지웠음"을 구분할 수 없다. 매 로그인마다 로컬에서 보정한 값이 지워지는 편이 더 나쁘다. 반면 관리 API 의 `null` 은 사람이 명시적으로 보낸 것이므로 지움 의도로 읽는다. |
| DEC-4 | 두 semantics 를 **동일한 순수 함수 `omitNullValues()`** 로 구현하고, 호출 위치만 다르게 둔다. | 규칙이 하나라는 것을 코드로 드러낸다. 병합 **전**(패치에만) 적용하면 무시, 병합 **후**(결과 전체) 적용하면 삭제가 된다. |
| DEC-5 | 기존 데이터 정리는 **마이그레이션 1회 실행**으로 한다. 애플리케이션 기동 시 지연 보정은 하지 않는다. | 상태를 한 시점에 확정한다. 지연 보정은 언제 끝나는지 알 수 없고 읽기 경로에 분기를 남긴다. |
| DEC-6 | 마이그레이션 `down()` 은 no-op 으로 둔다. | `null` 값 키는 정보를 담고 있지 않아 복원할 대상이 없다. 되돌릴 수 없는 것을 되돌리는 척하지 않는다. |

## 3. 구현 설계

### 3.1 공용 유틸 (신규)

`apps/api/src/common/profile/profile-value.util.ts`

```ts
/**
 * 값이 null·undefined 인 키를 제거한 새 객체를 돌려준다.
 *
 * profile_jsonb 는 "값 없음"을 키 부재로만 표현한다(불변식). false·0·''
 * 는 유효한 값이므로 남긴다 — falsy 전체를 지우면 사용자가 입력한 값이
 * 사라진다.
 */
export function omitNullValues(source: Record<string, unknown>): Record<string, unknown>;
```

호출 위치에 따라 두 가지 의미가 나온다.

| 호출 형태 | 의미 | 사용처 |
|---|---|---|
| `{ ...기존, ...omitNullValues(패치) }` | 패치의 `null` 을 **무시**(기존 값 보존) | 외부 인증 동기화 |
| `omitNullValues({ ...기존, ...패치 })` | 패치의 `null` 로 해당 키 **삭제** | 관리자·본인 수정 |

### 3.2 읽기 경계 — UserInfo

`apps/api/src/oauth/userinfo/userinfo-claims.ts`

```ts
for (const [key, value] of Object.entries(profile?.profileJsonb ?? {})) {
  if (RESERVED.has(key)) continue;
  if (value === null || value === undefined) continue;   // 추가
  claims[key] = value;
}
```

OIDC Core 5.3.2 는 값이 없는 클레임을 생략하도록 권고한다. 마이그레이션 이후에도 이 방어를 남기는 이유는, 스키마 검증을 거치지 않는 저장 경로가 앞으로 다시 생길 수 있고 UserInfo 는 모든 외부 연동의 공통 출구이기 때문이다.

### 3.3 쓰기 경계 — 외부 인증

`apps/api/src/external-auth/external-auth.service.ts` · `applyFieldMapping()`

- 매핑 지정 경로: `if (val !== undefined)` → **`if (val !== undefined && val !== null)`**
- 매핑 미지정 경로: `Object.assign(profile, externalProfile)` → **`Object.assign(profile, omitNullValues(externalProfile))`**

`applyFieldMapping()` 반환값은 `authorize.service.ts` 의 두 곳(동기화 병합, JIT 프로비저닝)에서 쓰이므로, 함수 하나를 고치면 두 경로가 함께 막힌다. 병합 지점(`authorize.service.ts:447`)은 이미 `{ ...기존, ...mapped.profile }` 형태여서 DEC-3 의 "무시" semantics 가 그대로 성립한다 — 추가 변경이 필요 없다.

### 3.4 쓰기 경계 — 사용자 API

`apps/api/src/users/users.service.ts`

| 메서드 | 변경 |
|---|---|
| `create()` | `const profileData = omitNullValues(dto.profile ?? {})` |
| `update()` | `const merged = omitNullValues({ ...user.profile.profileJsonb, ...dto.profile })` |
| `updateSelf()` | `update()` 와 동일 |

`update()`/`updateSelf()` 는 병합 결과 전체에 적용하므로, 이번 요청과 무관하게 이미 저장돼 있던 `null` 항목도 그 사용자를 수정할 때 함께 정리된다.

스키마 검증(`profileSchemaService.validate()`)은 정리된 결과를 대상으로 실행한다. 필수 필드를 `null` 로 지우려는 요청은 검증에서 거부되며, 이는 의도한 동작이다.

### 3.5 데이터 정리 마이그레이션

`apps/api/src/database/migrations/1781200000000-StripNullProfileValues.ts`

```sql
UPDATE user_profiles
SET profile_jsonb = COALESCE(
  (SELECT jsonb_object_agg(key, value)
     FROM jsonb_each(profile_jsonb)
    WHERE value <> 'null'::jsonb),
  '{}'::jsonb
)
WHERE jsonb_typeof(profile_jsonb) = 'object'
  AND EXISTS (SELECT 1 FROM jsonb_each(profile_jsonb) WHERE value = 'null'::jsonb);
```

- `WHERE EXISTS` 로 대상 행만 갱신한다 — 재실행 시 두 번째부터는 0건이므로 멱등이다(NFR-1).
- 모든 키가 `null` 인 행은 `jsonb_object_agg` 가 `NULL` 을 반환하므로 `COALESCE` 로 `'{}'` 를 넣는다.
- `jsonb_typeof` 가드로 객체가 아닌 행에서 `jsonb_each` 가 오류를 내지 않게 한다.

## 4. 영향 범위

| 대상 | 영향 |
|---|---|
| UserInfo 소비자(ezDesk 등) | `null` 클레임이 사라진다. 값이 있던 클레임은 그대로다. ezDesk 는 키 부재를 `undefined` → "건드리지 않음"으로 처리하므로 이 변경만으로 장애가 해소된다. |
| 외부 인증 사용 테넌트 | 상류가 `null` 을 주던 필드는 이제 저장되지 않는다. 이미 저장된 값은 보존된다. |
| 관리 UI | 변경 없음. 웹은 이미 빈 값을 전송에서 제외한다. |
| 기존 DB | 마이그레이션 1회로 `null` 항목 제거. 값이 있는 항목은 불변. |

## 5. 테스트 설계

| 대상 | 케이스 |
|---|---|
| `omitNullValues` | `null`·`undefined` 제거 / `false`·`0`·`''` 보존 / 원본 불변 / 빈 객체 |
| `buildUserInfoClaims` | `null` 값 프로필 항목 생략 / `false`·`0`·`''` 는 반환 / 모든 값이 `null` 이면 프로필 클레임 없음 |
| `applyFieldMapping` | 매핑 지정 경로에서 `null` 필드 제외 / 매핑 미지정 경로에서 `null` 제외 / 값 있는 필드는 그대로 |
| `users.service` | `create` 가 `null` 을 저장하지 않음 / `update` 가 `null` 로 기존 키를 삭제 / 병합 결과에 `null` 없음 |

## 6. 관련 문서

- 선행: [요구사항정의서](../requirements/2026-09-02-profile-null-value-requirements.md)
- 후속: [개발계획서](../plans/2026-09-02-profile-null-value-plan.md)
