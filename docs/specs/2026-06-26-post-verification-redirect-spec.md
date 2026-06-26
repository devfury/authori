# 이메일 인증 완료 후 리다이렉트 정책 — 개발설계서

> **Status:** Draft
> **Owner:** Jinho Lee
> **Created:** 2026-06-26
> **Updated:** 2026-06-26
> **Related:** `docs/requirements/2026-06-26-post-verification-redirect-requirements.md`, `docs/plans/2026-06-26-post-verification-redirect-plan.md`

## 1. 범위와 비범위

### 범위
- 인증 메일 토큰에 OAuth 컨텍스트(`clientId`, `continueUri`) 영속화.
- 인증 확정 시점의 **목적지 해석 체인** 구현.
- `verify-email` confirm 응답에 `continueUrl` 추가, 프론트 자동 이동.
- 클라이언트별 `postVerificationRedirectUri` 컬럼 + 관리 UI.
- Open redirect 방지(allowlist = 등록 redirect_uri origin).

### 비범위
- 원래 `requestId` 재생 / 동일 OAuth 트랜잭션 재개.
- 서버 측 302 리다이렉트 엔드포인트.
- 소셜/외부 IdP 인증 후 처리.

## 2. 아키텍처 개요

```
[register] ──(clientId, continueUri 검증)──▶ EmailVerificationService.issueAndSend
                                                 │ 토큰에 {clientId, continueUri} 저장
                                                 ▼
                                          메일 발송 (token + tenantSlug 링크)
                                                 │
        (며칠 뒤, 다른 기기 가능) 사용자 클릭     ▼
[GET /verify-email?token&tenantSlug] (SPA) ──▶ POST confirm
                                                 │ 토큰검증 + 활성화
                                                 │ resolveContinueUrl(우선순위 체인)
                                                 ▼
                                   { message:'verified', email, continueUrl }
                                                 │
                          SPA: continueUrl 있으면 window.location 자동 이동
                               없으면 기존 안내 페이지 + 로그인 링크
```

## 3. 목적지 해석 체인 (핵심 로직)

`EmailVerificationService.resolveContinueUrl(tenantId, token, tenantSlug)` 가 다음 순서로 평가하고 **첫 유효 값**을 반환한다.

1. **요청별 동적 `continueUri`** — 토큰에 저장된 `continueUri`가 있고 allowlist 검증 통과 시 사용. (C3)
2. **클라이언트 기본 `postVerificationRedirectUri`** — 토큰의 `clientId`로 클라이언트 조회, 컬럼 값이 있고 allowlist 검증 통과 시 사용. (C1 BFF, C2 Public)
3. **null 반환** — 폴백. 프론트가 기존 안내 페이지 표시. (C4)

> 1·2 모두 allowlist 미통과 시 그 후보를 건너뛰고 다음 순위로 진행(최종 null → 폴백). 검증 실패는 에러가 아니라 **안전한 폴백**으로 처리한다.

### Allowlist 검증 규칙 (open redirect 방지)

`RedirectUriValidator.isAllowed(clientId, candidateUrl): Promise<boolean>`

- 후보 URL을 파싱(실패 시 false).
- 해당 `clientId`의 `oauth_client_redirect_uris` 목록을 조회.
- 후보 URL의 **origin(scheme+host+port)이 등록된 redirect_uri 중 하나의 origin과 일치**하면 허용.
- (경로까지 정확히 일치하도록 강제하지 않음 — BFF 로그인 경로/SPA 진입 경로가 callback 경로와 다를 수 있으므로 origin 단위 허용. 요구사항 FR-5와 일치.)

## 4. 데이터 모델

### 4.1 `oauth_clients` (컬럼 추가)

| 컬럼 | 타입 | Null | 설명 |
| --- | --- | --- | --- |
| `post_verification_redirect_uri` | varchar | Y | 인증 완료 후 기본 목적지 URL |

엔티티(`oauth-client.entity.ts`):
```ts
@Column({ name: 'post_verification_redirect_uri', type: 'varchar', nullable: true })
postVerificationRedirectUri: string | null;
```

### 4.2 `email_verification_tokens` (컬럼 추가)

| 컬럼 | 타입 | Null | 설명 |
| --- | --- | --- | --- |
| `client_id` | varchar | Y | 가입을 트리거한 클라이언트 |
| `continue_uri` | varchar | Y | 요청별 동적 목적지(검증된 값만 저장) |

엔티티(`email-verification-token.entity.ts`):
```ts
@Column({ name: 'client_id', type: 'varchar', nullable: true })
clientId: string | null;

@Column({ name: 'continue_uri', type: 'varchar', nullable: true })
continueUri: string | null;
```

### 4.3 마이그레이션
- `bun run migration:generate -- src/database/migrations/PostVerificationRedirect` 로 생성.
- 두 테이블에 nullable 컬럼 추가 → 기존 데이터 영향 없음(회귀 안전).

## 5. API 설계

### 5.1 `POST /t/:tenantSlug/oauth/register` (요청 확장)
`RegisterDto`에 `continueUri?` 추가. 컨트롤러는 검증을 서비스에 위임.

```ts
// register.dto.ts
@ApiPropertyOptional({ description: '인증 후 복귀할 동적 목적지 URL (allowlist 검증됨)' })
@IsOptional()
@IsUrl({ require_tld: false })
continueUri?: string;
```

`AuthorizeService.register`:
- 기존 `dto.clientId`와 함께 `dto.continueUri`를 처리.
- `continueUri`가 있으면 `RedirectUriValidator.isAllowed(dto.clientId, dto.continueUri)`로 검증 → 통과 시에만 `issueAndSend`에 전달(미통과는 무시).
- `clientId`도 함께 `issueAndSend`로 전달.

### 5.2 `EmailVerificationService.issueAndSend` (시그니처 확장)
```ts
async issueAndSend(
  tenantId, tenantSlug, user,
  opts: { serviceName?, brandColor?, clientId?: string | null, continueUri?: string | null } = {},
): Promise<void>
```
- 토큰 저장 시 `clientId`, `continueUri`를 함께 저장.

### 5.3 `POST /t/:tenantSlug/oauth/verify-email` (응답 확장)
- 응답: `{ message: 'verified', email, continueUrl?: string }`
- `confirm`이 활성화 후 `resolveContinueUrl`을 호출하여 `continueUrl`을 채운다(없으면 생략/`undefined`).

### 5.4 `PATCH /admin .../clients/:id` (요청 확장)
`UpdateClientDto`에 `postVerificationRedirectUri?` 추가. `CreateClientDto`에도 선택 필드로 추가.
```ts
@ApiPropertyOptional({ description: '인증 완료 후 기본 리다이렉트 URL' })
@emptyToNull()
@IsOptional()
@IsUrl({ require_tld: false })
postVerificationRedirectUri?: string | null;
```

## 6. 프론트엔드 설계

### 6.1 `apps/web/src/api/oauth.ts`
- `RegisterPayload`에 `continueUri?: string` 추가.
- `verifyEmail` 응답 타입에 `continueUrl?: string` 추가.

### 6.2 `VerifyEmailView.vue`
- 성공 시 응답의 `continueUrl`이 있으면:
  - 짧은 안내("인증 완료, 이동 중...") 후 `window.location.href = continueUrl` 자동 이동.
  - 자동 이동 폴백으로 "지금 이동하기" 수동 링크 노출.
- `continueUrl`이 없으면 기존 동작 유지(테넌트 로그인/안내).

### 6.3 클라이언트 관리 UI
- `ClientCreateView.vue` / `ClientDetailView.vue`에 `postVerificationRedirectUri` 입력 필드 추가.
- `apps/web/src/api/clients.ts` 타입에 필드 반영.

## 7. 보안 설계

- **Open redirect**: 모든 외부 리다이렉트는 §3 allowlist(등록 redirect_uri origin 일치) 통과 필수. 미통과는 폴백.
- **인증 힌트 비신뢰**: 목적지에 부가 가능한 `verified=1`은 UX 힌트일 뿐 인증 증명 아님. 클라이언트는 실제 OAuth 로그인 재수행 필요(README/스펙 명시). (이번 구현에서 `verified` 파라미터 부가는 선택 — 기본은 순수 목적지 URL로 이동.)
- **멱등성**: 이미 활성화된 사용자 재클릭 시에도 `resolveContinueUrl` 동일 평가하여 동일 목적지 반환.
- **PII**: continueUrl 쿼리에 이메일 등 PII를 붙이지 않는다.

## 8. 대안과 채택 근거

| 대안 | 평가 | 채택 |
| --- | --- | --- |
| 원래 requestId 재생 | 인메모리·TTL·기기 변경으로 신뢰 불가 | ✕ |
| authori가 PKCE authorize URL 대행 생성 | code_verifier는 SPA 전용이라 불가 | ✕ |
| 서버 302 엔드포인트 | 견고하나 링크 형식/흐름 변경, 브랜딩/에러 UX 약화 | ✕ (후속 검토) |
| **continue URL + 우선순위 체인 + SPA 자동이동** | 모든 케이스 단일 메커니즘, 변경 최소 | **✓** |
| 전용 allowlist 테이블 | 관리 포인트 증가 | ✕ (등록 redirect_uri 재사용) |

## 9. 관련 요구사항

- FR-1 → §3 / FR-2 → §4.2,§5.2 / FR-3 → §5.3,§6 / FR-4 → §5.4,§6.3 / FR-5 → §3 allowlist
- NFR-1 → §3,§7 / NFR-3 → §7 / NFR-5 → §4.3 (nullable, 폴백)
