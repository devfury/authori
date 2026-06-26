# 이메일 인증 완료 후 리다이렉트 정책 — 개발계획서

> **Status:** Draft
> **Owner:** Jinho Lee
> **Created:** 2026-06-26
> **Updated:** 2026-06-26
> **Related:** `docs/requirements/2026-06-26-post-verification-redirect-requirements.md`, `docs/specs/2026-06-26-post-verification-redirect-spec.md`

## Goal

이메일 인증 완료 후 클라이언트 유형(BFF/Public/관리자 생성/딥링크)에 관계없이 사용자를 올바른 진입점으로 안전하게 이동시킨다. 목적지 결정을 "continue URL + 우선순위 해석 체인"으로 통일하고, open redirect를 등록 redirect_uri origin allowlist로 방지한다.

## Tech Stack

- Backend: NestJS + TypeORM (PostgreSQL), class-validator
- Frontend: Vue 3 + axios
- 마이그레이션: TypeORM

## In scope / Out of scope

- **In**: 토큰 컨텍스트 영속화, 해석 체인, allowlist 검증기, confirm 응답 확장, 프론트 자동이동, 클라이언트 컬럼·관리 UI, 마이그레이션, 단위 테스트.
- **Out**: requestId 재생, 서버 302 엔드포인트, 외부 IdP 후처리.

## 사전 상태

- 인증 링크는 `token + tenantSlug`만 보유. 인증 후 `/login?tenantSlug=`로 이동하나 OAuth 컨텍스트 부재로 로그인 불가.
- `RegisterDto`에 `clientId`는 이미 존재하나 토큰에 영속화되지 않음.

## 변경 파일 목록

### Backend
- `apps/api/src/database/entities/oauth-client.entity.ts` — `postVerificationRedirectUri` 컬럼
- `apps/api/src/database/entities/email-verification-token.entity.ts` — `clientId`, `continueUri` 컬럼
- `apps/api/src/database/migrations/<gen>-PostVerificationRedirect.ts` — 컬럼 추가
- `apps/api/src/oauth/authorize/dto/register.dto.ts` — `continueUri` 필드
- `apps/api/src/common/redirect/redirect-uri.validator.ts` *(신규)* — allowlist 검증기
- `apps/api/src/oauth/authorize/email-verification.service.ts` — 토큰에 컨텍스트 저장, `resolveContinueUrl`, `confirm` 반환 확장
- `apps/api/src/oauth/authorize/authorize.service.ts` — `register`에서 continueUri 검증·전달, `verifyEmail` 반환 확장
- `apps/api/src/oauth/authorize/authorize.module.ts` — validator provider 등록(필요 시)
- `apps/api/src/oauth/clients/dto/create-client.dto.ts` / `update-client.dto.ts` — `postVerificationRedirectUri`
- `apps/api/src/oauth/clients/clients.service.ts` — 컬럼 매핑(필요 시)

### Frontend
- `apps/web/src/api/oauth.ts` — `RegisterPayload.continueUri`, `verifyEmail` 응답 `continueUrl`
- `apps/web/src/views/oauth/VerifyEmailView.vue` — 성공 시 자동 이동 + 수동 폴백
- `apps/web/src/api/clients.ts` — 타입 필드
- `apps/web/src/views/tenant/clients/ClientCreateView.vue` / `ClientDetailView.vue` — 입력 필드

### Tests
- `apps/api/src/common/redirect/redirect-uri.validator.spec.ts` *(신규)*
- `apps/api/src/oauth/authorize/email-verification.service.spec.ts` *(신규 또는 보강)* — 해석 체인 우선순위

## 작업 단계 체크리스트

### 데이터 모델
- [x] `oauth-client.entity.ts`에 `postVerificationRedirectUri` 컬럼 추가
- [x] `email-verification-token.entity.ts`에 `clientId`, `continueUri` 컬럼 추가
- [x] 마이그레이션 생성 및 검토 (`migration:generate`)

### Allowlist 검증기
- [x] `RedirectUriValidator` 구현 (origin 일치 검증, 파싱 실패 안전 처리)
- [x] `redirect-uri.validator.spec.ts` 단위 테스트 (등록 origin 일치/불일치/잘못된 URL)

### 인증 토큰 컨텍스트 영속화
- [x] `EmailVerificationService.issueAndSend` 시그니처에 `clientId`, `continueUri` 추가 및 저장
- [x] `AuthorizeService.register`: `continueUri` allowlist 검증 후 통과 시 전달, `clientId` 전달
- [x] `RegisterDto.continueUri` 필드 추가

### 목적지 해석 체인
- [x] `EmailVerificationService.resolveContinueUrl` 구현 (동적 → 클라이언트 기본 → null)
- [x] `confirm`이 `continueUrl` 포함하여 반환
- [x] `AuthorizeService.verifyEmail` 반환 타입 확장
- [x] `email-verification.service.spec.ts`: 우선순위/폴백/allowlist 미통과 테스트

### 클라이언트 설정 (API)
- [x] `CreateClientDto` / `UpdateClientDto`에 `postVerificationRedirectUri` 추가
- [x] `clients.service.ts` 저장/수정 매핑 확인

### Frontend
- [x] `oauth.ts` 타입 확장 (`continueUri`, `continueUrl`)
- [x] `VerifyEmailView.vue` 성공 시 자동 이동 + 수동 폴백 링크
- [x] `clients.ts` 타입 + 클라이언트 생성/상세 뷰 입력 필드

### 문서
- [x] README 또는 스펙에 "verified 힌트는 인증 증명 아님" 명시 (NFR-2)

## 검증 명령과 기대 결과

```bash
bun run lint        # 통과
bun run typecheck   # 통과
bun run test        # 신규 spec 포함 전체 통과
bun run build       # 통과
```

- 마이그레이션: 로컬 DB에서 `migration:run` 시 nullable 컬럼 2종 추가, 기존 행 영향 없음.
- 수동 검증(가능 시): C1/C2/C3/C4 시나리오를 §성공 기준대로 확인.

## 리스크와 주의사항

- **Open redirect**: origin 단위 허용이므로 등록 redirect_uri origin 자체가 신뢰 가능해야 함. 등록 URI 관리가 곧 보안 경계.
- **마이그레이션 머지**: 다른 migration과 타임스탬프 충돌 주의. 생성 후 파일명/순서 확인.
- **빈 문자열 처리**: 관리 UI에서 빈 문자열 입력 시 `emptyToNull` 변환으로 null 저장.
- **회귀**: `continueUrl` 없을 때 기존 `/login` 폴백 동작 유지 — 프론트 분기 테스트.
- **PII**: continueUrl 쿼리에 이메일 등 부가 금지.
