# 이메일 인증 완료 후 리다이렉트 정책 — 개발완료보고서

> **Status:** Review
> **Owner:** Jinho Lee
> **Created:** 2026-06-26
> **Updated:** 2026-06-26
> **Related:** `docs/requirements/2026-06-26-post-verification-redirect-requirements.md`, `docs/specs/2026-06-26-post-verification-redirect-spec.md`, `docs/plans/2026-06-26-post-verification-redirect-plan.md`
> **Branch:** `feat/post-verify-redirect` · **Commits:** `769434b`(요구사항), `b90c0b7`(설계·계획), `52a5418`(구현)

## 1. 구현 요약

이메일 인증 완료 후 목적지를 **continue URL 단일 추상화 + 우선순위 해석 체인**으로 통일하여 BFF·Public·딥링크·관리자 생성 케이스를 하나의 메커니즘으로 처리한다. 인증 메일은 비동기·out-of-band이고 PKCE `code_verifier`는 SPA 전용이라는 제약 때문에 원래 OAuth 요청 재생 대신 "클라이언트 등록 진입 URL로 복귀" 모델을 채택했다.

해석 체인(`EmailVerificationService.resolveContinueUrl`):
1. 토큰의 동적 `continueUri` (allowlist 통과 시) — 딥링크 복귀
2. 클라이언트 `postVerificationRedirectUri` (allowlist 통과 시) — BFF 자체 로그인 / Public 앱 진입
3. `undefined` → 프론트 기본 안내 페이지 폴백 — 관리자 생성/컨텍스트 없음

Open redirect는 후보 URL의 origin이 해당 클라이언트의 등록 `oauth_client_redirect_uris` origin과 일치할 때만 허용(`RedirectUriValidator`). 미통과는 에러가 아니라 다음 순위로 넘어가는 안전한 폴백.

## 2. 완료된 작업 목록

### 데이터 모델
- `oauth_clients.post_verification_redirect_uri` (nullable) 컬럼
- `email_verification_tokens.client_id`, `continue_uri` (nullable) 컬럼
- 마이그레이션 `1780600000000-PostVerificationRedirect.ts` (nullable 컬럼 추가 → 회귀 안전)

### Backend
- `RedirectUriValidator` 신규 (origin allowlist, 파싱 실패/opaque origin 안전 처리)
- `EmailVerificationService`: `issueAndSend`에 `clientId`/`continueUri` 저장, `resolveContinueUrl` 추가, `confirm`이 `continueUrl` 반환
- `AuthorizeService.register`: `continueUri` allowlist 검증 후 통과분만 토큰에 전달, `clientId` 전달
- `RegisterDto.continueUri`, `Create/UpdateClientDto.postVerificationRedirectUri`
- `ClientsService` create/update 컬럼 매핑
- `AuthorizeModule`에 `RedirectUriValidator` provider 등록

### Frontend
- `oauth.ts`: `RegisterPayload.continueUri`, `verifyEmail` 응답 `continueUrl`
- `VerifyEmailView.vue`: 성공 시 `continueUrl` 자동 이동(1.2s) + "지금 이동하기" 수동 폴백, 없으면 기존 안내
- `OAuthRegisterView.vue`: 쿼리의 `continueUri`를 register 페이로드로 전달
- `clients.ts` 타입 + `ClientCreateView`/`ClientDetailView` 입력·표시 필드

### 테스트
- `redirect-uri.validator.spec.ts` (7) — origin 일치/불일치/스킴·포트/잘못된 URL/누락/미등록
- `email-verification.service.spec.ts` (5) — 해석 체인 1·2·3순위/allowlist 미통과/clientId 없음

## 3. 빌드/테스트 실행 결과

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| `bun run typecheck` | ✅ 통과 | api + web |
| `bun run test` (api) | ✅ 92/92 | 신규 spec 2종 포함 |
| `bun run test` (web) | ⚠️ 8/8 실제 테스트 통과 | `App.spec.ts`·`AppSidebar.spec.ts` 2개 스위트는 **기존 결함**(`file:///brand/authori-admin-icon.png` 에셋 경로 오류, 테스트 0건). 본 변경과 무관 |
| `bun run build` | ✅ 통과 | api + web |
| `bun run lint` | ⚠️ 기존 red | `develop`에서 이미 실패(62 errors, 미수정 test/e2e 파일). 본 변경 파일은 신규 오류 없음(검출된 2건은 기존 `emptyToNull` 헬퍼/`issueAuthCode` enum 비교) |

## 4. 남은 리스크 / 후속 작업

- **마이그레이션 미실행**: `migration:run`은 운영/로컬 DB 적용 시 수행 필요. nullable 컬럼만 추가하므로 기존 데이터 영향 없음.
- **기존 lint/web test red**: 본 작업 범위 밖의 선행 결함. 별도 정리 작업 권장.
- **수동 검증(E2E)**: C1~C4 시나리오의 실제 브라우저 흐름 확인은 SMTP/클라이언트 설정이 갖춰진 환경에서 후속 수행 권장.
- **NFR-2 문서화**: `verified` 힌트는 인증 증명이 아니며 클라이언트가 실제 OAuth 로그인을 재수행해야 한다는 점은 설계서 §7에 명시. 연동 가이드(외부 문서)에도 반영 권장.

## 5. 발견 사항

- 발견 사항(신규 결함) 없음. 검증 범위는 typecheck/단위테스트/build와 정적 분석. 실제 메일 발송·브라우저 리다이렉트의 수동 검증은 미수행(후속).
