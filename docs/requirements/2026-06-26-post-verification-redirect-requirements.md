# 이메일 인증 완료 후 리다이렉트 정책 — 요구사항정의서

> **Status:** Draft
> **Owner:** Jinho Lee
> **Created:** 2026-06-26
> **Updated:** 2026-06-26
> **Related:** (후속) `docs/specs/2026-06-26-post-verification-redirect-spec.md`, `docs/plans/2026-06-26-post-verification-redirect-plan.md`

## 1. 문제 정의

공개 회원가입 시 `emailVerificationRequired`가 켜진 테넌트에서는 사용자가 INACTIVE 상태로 생성되고, 가입 메일의 인증 링크(`/verify-email?token=&tenantSlug=`)를 클릭하면 활성화된다. 그러나 인증 완료 후 사용자는 `/login?tenantSlug=<slug>`로만 이동하며, 이 페이지는 OAuth 컨텍스트(`requestId`, `clientId`, `scopes`)가 없어 **"잘못된 접근입니다" 에러를 띄우고 실제 로그인을 진행할 수 없다.**

현재 동작(`apps/web/src/views/oauth/VerifyEmailView.vue:42`):

```ts
const loginRoute = { name: 'oauth-login', query: tenantSlug ? { tenantSlug } : {} }
```

인증 링크에 `tenantSlug`만 실려 있고(`apps/api/src/oauth/authorize/email-verification.service.ts:136` `buildVerifyUrl`), 인증 토큰 발급 시 원래 OAuth 요청 컨텍스트를 저장하지 않기 때문에, 인증 후 사용자를 적절한 다음 화면으로 보낼 수 없다.

### 근본 제약

1. **인증 메일은 비동기·out-of-band다.** 사용자는 메일을 몇 분~몇 시간 뒤, 다른 기기/브라우저에서 클릭할 수 있다. 반면 `PendingRequestStore`는 인메모리 + 짧은 TTL이므로, 클릭 시점에는 원래 `requestId`가 이미 만료되어 있을 가능성이 높다. → **원래 `requestId`를 되살려 OAuth 흐름을 잇는 방식은 신뢰할 수 없다.**
2. **Public 클라이언트의 PKCE `code_verifier`는 클라이언트(SPA)만 보유한다.** authori가 사용자를 대신해 유효한 `/authorize` URL을 재구성해줄 수 없으므로, SPA가 자기 진입점에서 PKCE를 새로 생성해 로그인을 다시 시작해야 한다.

이 두 제약 때문에 "원래 흐름 복귀"든 "BFF 자체 로그인"이든 결국 **"클라이언트가 등록해둔 진입 URL로 브라우저를 돌려보내고, 거기서 그 클라이언트의 정상 로그인 흐름이 다시 시작되게 한다"** 는 동일한 모양으로 수렴한다.

## 2. 목표

- 이메일 인증 완료 후, 클라이언트 유형(BFF / Public SPA / 모바일 / 관리자 생성 등)에 관계없이 사용자를 **정상적인 다음 단계로 이동**시킨다.
- 목적지 결정을 하나의 추상화("continue URL")와 **우선순위 해석 체인**으로 통일하여 다양한 케이스를 단일 메커니즘으로 처리한다.
- Open redirect 등 보안 위험 없이 안전하게 외부 URL로 리다이렉트한다.

## 3. 사용자/역할/권한 범위

| 역할 | 관련 |
| --- | --- |
| 엔드유저 (가입자) | 인증 메일 클릭 후 올바른 로그인 진입점으로 이동 |
| Platform/Tenant Admin | 클라이언트별 인증 후 목적지(`postVerificationRedirectUri`) 설정 |
| 연동 서비스 (BFF/SPA) | 인증 후 자기 로그인/진입 흐름을 이어받음 |

## 4. 케이스 정의

| 케이스 | 클라이언트 유형 | 기대 동작 |
| --- | --- | --- |
| C1. BFF 서비스 | CONFIDENTIAL (BFF) | 서비스 **자체 로그인 화면**으로 리다이렉트. BFF가 자기 OAuth authorize를 시작 |
| C2. Public SPA/모바일 | PUBLIC | 앱 **진입 URL**로 리다이렉트 → SPA가 "미로그인 → /authorize"를 새 PKCE로 재실행 (= "원래 oauth 흐름 복귀") |
| C3. 딥링크 복귀 | 모두 | 가입 시 전달된 요청별 동적 목적지(사용자가 있던 페이지)로 복귀 |
| C4. 관리자 생성 / 컨텍스트 없음 | 없음 | authori 호스팅 안내 페이지("인증 완료, 로그인하세요") |

## 5. 기능 요구사항

- **FR-1 (목적지 해석 체인)**: 인증 확정 시점에 다음 우선순위로 목적지(continueUrl)를 결정한다.
  1. 회원가입 시 전달된 **요청별 동적 `continueUri`** (allowlist 검증 통과 시) — C3
  2. 클라이언트의 **기본 `postVerificationRedirectUri`** (신규 컬럼) — C1, C2
  3. **authori 호스팅 폴백 페이지** — C4
- **FR-2 (컨텍스트 영속화)**: 인증 토큰 발급 시 `clientId`와 (검증된) `continueUri`를 `EmailVerificationToken`에 저장하여, 비동기 클릭 시점에도 목적지를 복원할 수 있게 한다.
- **FR-3 (서버 결정형 응답)**: `verify-email` confirm API는 응답에 `continueUrl`을 포함하여 목적지를 서버가 결정한다. 프론트(`VerifyEmailView`)는 성공 시 `continueUrl`로 자동 이동하고, 수동 폴백 링크를 함께 제공한다. `continueUrl`이 없으면 현재의 안내 페이지를 유지한다.
- **FR-4 (클라이언트 설정 UI)**: 클라이언트 관리 화면에서 `postVerificationRedirectUri`를 설정할 수 있다.
- **FR-5 (allowlist 검증)**: 동적 `continueUri`와 `postVerificationRedirectUri`는 **기존 `oauth_client_redirect_uris`에 등록된 URI의 origin과 일치**할 때만 허용한다(open redirect 방지). 미통과 시 폴백 페이지로 처리한다.

## 6. 비기능 요구사항

- **NFR-1 (보안 — Open redirect 방지)**: 모든 외부 리다이렉트 URL은 allowlist(등록 redirect_uri origin 일치)로 검증한다.
- **NFR-2 (보안 — 인증 힌트 비신뢰)**: 목적지에 부가하는 `?verified=1` 등 힌트 파라미터는 인증 증명이 아니다. 클라이언트는 반드시 실제 OAuth 로그인을 다시 수행해야 한다(문서 명시).
- **NFR-3 (멱등성)**: 이미 활성화된 사용자가 링크를 재클릭해도 동일한 목적지로 멱등 처리한다.
- **NFR-4 (이메일 열거 방지)**: 응답 메시지는 기존처럼 일반화 유지.
- **NFR-5 (호환성)**: 기존 `tenantSlug`만 있는 링크(컨텍스트 없는 가입)도 폴백 경로로 정상 동작한다.

## 7. 제외 범위 (Out of scope)

- 원래 `requestId`를 되살려 동일 OAuth 트랜잭션을 그대로 재개하는 방식 (근본 제약으로 채택하지 않음).
- authori가 Public 클라이언트의 PKCE `/authorize` URL을 대신 생성하는 기능.
- 서버 측 `GET … → 302` 리다이렉트 엔드포인트 (이번엔 SPA 응답 기반 자동 이동으로 결정).
- 소셜 로그인, 외부 IdP 연동 흐름의 인증 후 처리.

## 8. 성공 기준

- C1: BFF 클라이언트 가입 → 인증 클릭 → BFF 자체 로그인 화면으로 이동, 정상 로그인 가능.
- C2: Public 클라이언트 가입 → 인증 클릭 → 앱 진입 URL로 이동 → 새 OAuth 흐름으로 로그인 가능.
- C3: 동적 `continueUri` 지정 시 해당 페이지로 복귀.
- C4: 관리자 생성/컨텍스트 없음 → 안내 페이지 정상 표시.
- 보안: allowlist 미등록 URL은 리다이렉트되지 않고 폴백 처리. 단위 테스트로 검증.
- 회귀: 기존 `tenantSlug`만 있는 링크 정상 동작.

## 9. 우선순위

| 항목 | 우선순위 |
| --- | --- |
| FR-1, FR-2, FR-3 (핵심 흐름) | High |
| FR-5, NFR-1 (보안) | High |
| FR-4 (관리 UI) | Medium |
| NFR-2 문서화 | Medium |

## 10. 확정된 설계 결정 (사용자 합의)

- **Allowlist 방식**: 기존 `oauth_client_redirect_uris` 재사용 (전용 컬럼 신설 안 함).
- **리다이렉트 위치**: SPA 응답 기반 자동 이동 (서버 302 엔드포인트 미도입).
