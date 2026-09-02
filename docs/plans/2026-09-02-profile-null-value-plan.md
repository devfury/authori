# 개발계획서 — 프로필 null 값 저장·노출 차단

- 작성일: 2026-09-02
- 작성자: Jinho Lee
- 관련 요구사항: [요구사항정의서](../requirements/2026-09-02-profile-null-value-requirements.md)
- 관련 설계: [개발설계서](../specs/2026-09-02-profile-null-value-spec.md)

## Goal

`user_profiles.profile_jsonb` 가 `null` 값을 보관하지 않게 하고, UserInfo 가 `null` 클레임을 내보내지 않게 한다. 기존에 저장된 `null` 항목은 마이그레이션으로 정리한다.

## 변경 파일

| 파일 | 구분 | 내용 |
|---|---|---|
| `apps/api/src/common/profile/profile-value.util.ts` | 신규 | `omitNullValues()` 순수 함수 |
| `apps/api/src/common/profile/profile-value.util.spec.ts` | 신규 | 유틸 단위 테스트 |
| `apps/api/src/oauth/userinfo/userinfo-claims.ts` | 수정 | `null`/`undefined` 프로필 항목 생략 |
| `apps/api/src/oauth/userinfo/userinfo-claims.spec.ts` | 수정 | null 생략 계약 테스트 추가 |
| `apps/api/src/external-auth/external-auth.service.ts` | 수정 | `applyFieldMapping` 이 `null` 을 담지 않음 |
| `apps/api/src/external-auth/external-auth.service.spec.ts` | 수정 | null 제외 테스트 추가 |
| `apps/api/src/users/users.service.ts` | 수정 | `create`/`update`/`updateSelf` 에 `omitNullValues` 적용 |
| `apps/api/src/users/users.service.spec.ts` | 수정 | null 삭제 semantics 테스트 추가 |
| `apps/api/src/database/migrations/1781200000000-StripNullProfileValues.ts` | 신규 | 기존 `null` 항목 제거 |
| `CLAUDE.md` | 수정 | 프로필 값 불변식 한 줄 기술 |

## 작업 단계

- [x] T1 — `omitNullValues()` 유틸 및 단위 테스트 추가 (FR-2)
- [x] T2 — `buildUserInfoClaims()` 에서 `null`/`undefined` 항목 생략 + 테스트 (FR-1, FR-2)
- [x] T3 — `applyFieldMapping()` 두 경로에서 `null` 제외 + 테스트 (FR-3, FR-4)
- [x] T4 — `users.service` 세 경로에 `omitNullValues` 적용 + 테스트 (FR-5)
- [x] T5 — 기존 데이터 정리 마이그레이션 추가 (FR-6, NFR-1)
- [x] T6 — CLAUDE.md 불변식 반영
- [x] T7 — 4단계 검증 (lint → typecheck → test → build)
- [ ] T8 — 개발완료보고서 작성 · develop 병합 · 알림

## 검증 명령과 기대 결과

```bash
bun run lint       # 기대: 신규 오류 0 (기존 baseline 경고는 그대로)
bun run typecheck  # 기대: 오류 0
bun run test       # 기대: 전체 통과, 신규 테스트 포함
bun run build      # 기대: api·web 빌드 성공
```

마이그레이션은 운영 배포 시 `bun run migration:run` 으로 실행한다. 실행 후 확인 질의:

```sql
SELECT count(*) FROM user_profiles p, jsonb_each(p.profile_jsonb) e
WHERE jsonb_typeof(p.profile_jsonb) = 'object' AND e.value = 'null'::jsonb;
-- 기대: 0
```

## 리스크

| 리스크 | 대응 |
|---|---|
| 마이그레이션이 되돌릴 수 없다 | `null` 값 키는 정보를 담지 않아 복원 대상이 없다(DEC-6). 값이 있는 항목은 질의에서 제외되므로 손실 경로가 없다. 배포 전 확인 질의로 대상 건수를 먼저 확인한다. |
| 관리 API 의 `null` semantics 변경(저장 → 키 삭제) | 기존 동작이 "불변식을 깨는 값을 저장"이었으므로 유지할 가치가 없다. 웹 UI 는 `null` 을 전송하지 않아 내부 영향이 없다. |
| 외부 인증 상류가 실제로 값을 지운 경우 반영되지 않음 | 알려진 트레이드오프(DEC-3). 매 로그인마다 로컬 값이 지워지는 위험보다 낫다고 판단했다. 필요해지면 프로바이더 설정 플래그로 분기한다. |
| 스키마 필수 필드를 `null` 로 보내면 검증 실패 | 의도한 동작. 필수 필드는 지울 수 없다. |

## 관련 문서

- 선행: [요구사항정의서](../requirements/2026-09-02-profile-null-value-requirements.md), [개발설계서](../specs/2026-09-02-profile-null-value-spec.md)
- 후속: 개발완료보고서 `docs/reviews/2026-09-02-profile-null-value-review.md`
