# 개발계획서 — 테넌트 관리자 로그인 실패(401 강제 로그아웃) 수정

- 작성일: 2026-09-23
- 관련 요구사항: [2026-09-23-tenant-admin-login-401-requirements.md](../requirements/2026-09-23-tenant-admin-login-401-requirements.md)
- 관련 설계: [2026-09-23-tenant-admin-login-401-spec.md](../specs/2026-09-23-tenant-admin-login-401-spec.md)
- 브랜치: `fix/tenant-admin-login-401`

## Goal

TENANT_ADMIN 로그인 직후 레이아웃의 `GET /admin/tenants/:id` 가 401 을 받아 세션이 파기되는 문제를 없앤다. 테넌트 관리자가 자기 테넌트를 조회·설정할 수 있게 인가를 바로잡고, 권한 부족을 403 으로 분리해 동일 패턴의 재발을 막는다.

## 변경 파일 목록

| 파일 | 변경 |
|---|---|
| `apps/api/src/admin/guards/platform-admin.guard.ts` | 권한 부족 → `ForbiddenException` |
| `apps/api/src/admin/guards/tenant-admin.guard.ts` | 권한 부족 → `ForbiddenException` |
| `apps/api/src/tenants/tenants.controller.ts` | 클래스 가드 제거 → 메서드별 가드, `:id` → `:tenantId`, TENANT_ADMIN 수정 필드 제한 |
| `apps/api/src/admin/guards/admin-guards.spec.ts` | 신규 — 가드 단위 테스트 |
| `apps/api/src/tenants/tenants.controller.spec.ts` | 신규 — 필드 제한 단위 테스트 |

변경 없음이 확인된 항목:

- `apps/api/src/tenants/tenants.module.ts` — `AdminAuthModule` 이 이미 `TenantAdminGuard` 를 export 하고 `TenantsModule` 이 이를 import 한다. 배선 추가 불필요.
- `apps/web/**` — API 경로·요청 형태가 그대로이고, 403 은 기존 401 인터셉터를 발동시키지 않는다.
- DB 스키마 / 마이그레이션 — 없음.

## 작업 단계

- [x] 1. 가드 2종의 권한 부족 예외를 `ForbiddenException` 으로 변경 (FR-7)
- [x] 2. 가드 단위 테스트 작성 — 역할별 통과/거부, 테넌트 경계, 인증 실패 401 전파 (FR-6, FR-7)
- [ ] 3. `tenants.controller.ts` 클래스 레벨 가드 제거 후 메서드별 가드 부여 (FR-1·2·4·5)
- [ ] 4. 경로 파라미터 `:id` → `:tenantId` 통일 (가드의 테넌트 경계 검사 기준)
- [ ] 5. `update()` 에 TENANT_ADMIN 금지 필드(`status`, `issuer`) 검사 추가 (FR-3)
- [ ] 6. 컨트롤러 단위 테스트 작성 — 역할별 수정 필드 허용/거부, `mailDevRedirectEditable` 회귀 (FR-3)
- [ ] 7. 4단계 검증 명령 전체 실행 및 통과

## 검증 명령과 기대 결과

```bash
bun run lint        # 경고·오류 없음
bun run typecheck   # 타입 오류 없음
bun run test        # 신규 2개 스펙 포함 전체 통과
bun run build       # api·web 빌드 성공
```

추가 확인:

- 신규 테스트가 **수정 전 코드에서는 실패**함을 먼저 확인한다(가드 예외 타입, 필드 제한 부재).
- 기존 `tenants.service.spec.ts` 가 계속 통과하는지 확인한다(서비스 로직 미변경).

## 리스크

| 리스크 | 영향 | 대응 |
|---|---|---|
| 401 → 403 전환으로 기존 클라이언트 동작 변화 | 401 을 인가 실패로 처리하던 코드가 있으면 분기가 달라짐 | 프런트는 401 만 특별 취급(로그아웃)하며 403 은 각 화면의 일반 오류 처리로 흘러간다. 이 변화가 의도한 수정 자체다. |
| 클래스 가드 제거 시 메서드 누락 → 무방비 엔드포인트 | 인가 우회 | 컨트롤러의 모든 핸들러에 가드가 붙었는지 코드 리뷰로 1:1 대조. 설계서 3.2 표를 체크리스트로 사용. |
| `:id` → `:tenantId` 개명 누락 | `@Param('id')` 가 `undefined` 가 되어 런타임 오류 | 타입체크로는 잡히지 않으므로 컨트롤러 전체를 한 번에 치환하고 단위 테스트로 확인. |
| 테넌트 관리자에게 과도한 설정 권한 부여 | 권한 상승 | `status`·`issuer` 차단. 목록·생성·삭제는 플랫폼 전용 유지. |
