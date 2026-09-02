# 요구사항정의서 — 프로필 null 값 저장·노출 차단 (UserInfo null 클레임 장애)

- 작성일: 2026-09-02
- 작성자: Jinho Lee
- 상태: 확정
- 유형: 결함 수정 (운영 장애)

## 1. 문제 정의

운영 환경에서 **특정 사용자만** ezDesk 로그인에 실패한다. 다른 사용자는 정상이다.

```
[Nest] ERROR [AuthController] OIDC callback error
TypeError: Cannot read properties of null (reading 'trim')
    at AuthService.normalizeProfileField (/app/apps/api/dist/auth/auth.service.js:130:27)
    at AuthService.upsertUser (/app/apps/api/dist/auth/auth.service.js:153:32)
```

### 1.1 장애 경로

| 단계 | 위치 | 동작 |
|---|---|---|
| 1 | Authori `user_profiles.profile_jsonb` | 해당 사용자의 프로필에 `"telephone": null` 이 저장돼 있다. |
| 2 | Authori `oauth/userinfo/userinfo-claims.ts:66` | `profileJsonb` 의 항목을 **값 검사 없이** 클레임으로 복사한다(`claims[key] = value`). UserInfo 응답에 `"telephone": null` 이 그대로 실린다. |
| 3 | ezDesk `auth.controller.ts:187` | 그 클레임을 `profile.telephone` 으로 전달한다. |
| 4 | ezDesk `auth.service.ts:normalizeProfileField` | 인자 타입을 `string \| undefined` 로 가정해 `undefined` 만 걸러내므로 `null.trim()` 에서 예외가 난다. |

컴파일 산출물 라인 번호(`auth.service.js:153`)는 `telephone` 필드에 정확히 대응한다. 바로 앞 줄(152, `department`)은 통과했으므로 **해당 사용자는 부서 값은 있고 전화번호만 `null`** 이다. 다른 사용자는 전화번호가 문자열이거나 키 자체가 없어(`undefined` → 조기 반환) 영향이 없다. 이것이 "특정 사용자만" 실패하는 이유다.

### 1.2 `null` 이 저장된 경로

Authori 의 웹 경로(관리자 사용자 편집, 셀프 프로필, 회원가입)는 모두 `if (v === '' || v === null || v === undefined) continue` 로 빈 값을 제외하므로 `null` 을 쓰지 않는다. `null` 이 들어올 수 있는 경로는 다음 두 곳이다.

| ID | 경로 | 근거 |
|---|---|---|
| C-1 | **외부 인증 프로바이더 동기화 (`syncOnLogin`) 및 JIT 프로비저닝** | `external-auth.service.ts:443` 은 `if (val !== undefined)` 로 **`undefined` 만** 걸러내고 `null` 은 그대로 담는다. 매핑이 없을 때의 `Object.assign(profile, externalProfile)` 경로도 동일하다. 상류 인증 서버가 전화번호 미등록 사용자에게 `telePhoneNumber: null` 을 주면 그대로 저장된다. |
| C-2 | **관리자 사용자 편집 화면의 JSON 직접 편집 모드 / API 직접 호출** | 임의의 JSON 을 그대로 보낼 수 있다. |

또한 C-1 경로(`authorize.service.ts:447`, `jitProvisionUser`)에는 **프로필 스키마 검증(`profileSchemaService.validate()`) 호출이 없다.** 스키마가 `type: "string"` 으로 선언한 필드라도 이 경로로는 `null` 이 통과한다.

### 1.3 버전 관계 정정

접수 시 "1.3.8 에서는 문제 없었다"는 진술이 있었으나, **1.3.8 → 1.3.10 사이 UserInfo 변경(`4bcf335`, `a9077a0`)은 null 통과 동작을 바꾸지 않았다.** 1.3.8 의 `Object.assign(claims, profile.profileJsonb)` 역시 `null` 을 그대로 내보냈다. 실제 노출 계기는 소비자 측 변경(ezDesk `95c3233`, 2026-08-27, "Authori 프로필 전화번호 동기화")으로, 그 전까지 ezDesk 는 `organization`/`department` 만 읽었다. 저장된 `null` 은 그 이전부터 존재했을 가능성이 크다.

이 문서는 **Authori 측 결함**만 다룬다. ezDesk 의 입력 방어는 별도 저장소에서 처리한다.

## 2. 목표

- UserInfo 응답이 값이 없는 프로필 항목을 **`null` 로 내보내지 않는다.**
- `profile_jsonb` 에 **`null` 값이 저장되지 않는다** — 유입 경로를 모두 막는다.
- 이미 저장된 `null` 값을 정리한다.
- 동일 회귀가 재발하지 않도록 단위 테스트로 계약을 고정한다.

## 3. 기능 요구사항

| ID | 요구사항 |
|----|----------|
| FR-1 | `buildUserInfoClaims()` 는 값이 `null` 또는 `undefined` 인 프로필 항목을 응답에서 **생략**한다. 키 자체를 내보내지 않는다. |
| FR-2 | `false`, `0`, `''` 는 유효한 값이므로 그대로 반환한다. 생략 대상은 `null`/`undefined` 뿐이다. |
| FR-3 | 외부 인증 응답 매핑(`applyFieldMapping`)은 `null` 값을 프로필에 담지 않는다. 매핑 지정 경로와 미지정(`Object.assign`) 경로 모두 동일하다. |
| FR-4 | 외부 인증 동기화가 프로필을 병합할 때 상류의 `null` 은 **"값 없음"으로 보고 기존 저장값을 보존**한다. 기존 값을 지우지 않는다. |
| FR-5 | 관리자 수정(`update`)·본인 수정(`updateSelf`)·생성(`create`) 경로에서 요청 본문의 `null` 은 **해당 키 삭제**로 처리한다. 병합 결과에 `null` 값이 남지 않는다. |
| FR-6 | 기존 데이터에 남은 `null` 값 항목을 마이그레이션으로 제거한다. 값이 있는 항목은 건드리지 않는다. |
| FR-7 | FR-1 ~ FR-5 를 단위 테스트로 고정한다. |

## 4. 비기능 요구사항

| ID | 요구사항 |
|----|----------|
| NFR-1 | 마이그레이션은 재실행해도 안전해야 한다(멱등). `profile_jsonb` 가 객체가 아닌 행은 건드리지 않는다. |
| NFR-2 | 기존 UserInfo 소비자에 대한 하위호환: 값이 있던 클레임의 형태·이름은 변하지 않는다. 사라지는 것은 `null` 값 클레임뿐이며, 이는 OIDC Core 5.3.2 의 "값이 없는 클레임은 생략한다" 권고에 부합한다. |
| NFR-3 | 로그인 경로의 추가 DB 왕복이나 성능 저하가 없어야 한다. |

## 5. 제외 범위

- ezDesk 측 `normalizeProfileField` 입력 방어 — 별도 저장소에서 진행.
- 외부 인증 동기화 경로에 프로필 스키마 전면 검증 도입 — 상류 응답이 스키마를 만족하지 못할 때 로그인 자체가 막히는 파급이 있어 이번 범위에서 제외한다. `null` 차단만 적용한다.
- `''`(빈 문자열) 저장 정책 변경 — 현재 동작(그대로 저장·반환)을 유지한다.
- ezDesk 의 `Code verifier cookie missing` 로그 — 본 장애 후 재시도에서 발생한 부수 증상으로 별개 사안이다.

## 6. 성공 기준

- `profile_jsonb` 에 `telephone: null` 이 있는 사용자로 UserInfo 를 조회했을 때 응답에 `telephone` 키가 없다.
- 외부 인증 프로바이더가 `null` 필드를 반환해도 `profile_jsonb` 에 `null` 이 저장되지 않고 기존 값이 유지된다.
- 마이그레이션 실행 후 `SELECT ... WHERE profile_jsonb->'<key>' = 'null'::jsonb` 결과가 0건이다.
- `bun run lint && bun run typecheck && bun run test && bun run build` 전부 통과.

## 7. 관련 문서

- 후속: [개발설계서](../specs/2026-09-02-profile-null-value-spec.md)
- 후속: [개발계획서](../plans/2026-09-02-profile-null-value-plan.md)
- 배경: [UserInfo 응답 계약 정합화 요구사항정의서](2026-08-23-userinfo-response-symmetry-requirements.md)
