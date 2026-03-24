# OAuth2/OIDC 멀티테넌트 인증 플랫폼 개발 계획

## 1. 프로젝트 목표

- 여러 외부 서비스/조직이 하나의 인증 플랫폼을 공유할 수 있는 멀티테넌트 OAuth2 Provider를 구축한다.
- 공통 인증/인가 로직은 표준화하면서, tenant별 사용자 프로필 모델 차이를 유연하게 수용한다.
- PostgreSQL 기반으로 운영 가능한 데이터 모델, 보안 전략, 개발 단계, 운영 기준을 수립한다.
- 초기에는 빠르게 MVP를 출시하고, 이후 OIDC/고급 보안/운영 자동화로 확장 가능한 구조를 채택한다.

## 2. 배경 및 문제 정의

여러 서비스가 자체 로그인 시스템을 각각 구현하면 다음 문제가 반복된다.

- 서비스마다 로그인/토큰/동의(consent)/클라이언트 관리 로직을 중복 구현해야 한다.
- 서비스별 사용자 데이터 모델이 달라 공통 인증 플랫폼으로 통합하기 어렵다.
- 운영 주체가 다를 경우 tenant 간 데이터 격리, 감사, 보안 정책 적용이 복잡해진다.
- OAuth2를 단순 토큰 발급 수준으로만 구현하면 장기적으로 client 관리, 권한 범위, key rotation, 감사 추적이 부족해진다.

이 프로젝트는 위 문제를 해결하기 위해 **공통 인증 코어 + tenant별 확장 가능한 프로필 스키마** 구조를 목표로 한다.

## 3. 가정(Assumptions)

- 백엔드는 NestJS + TypeScript 기반으로 개발한다.
- DB는 PostgreSQL 단일 클러스터를 기본으로 사용한다.
- 1차 릴리스는 **shared database / shared schema + tenant_id 격리 모델**을 채택한다.
- 사용자 인증 방식은 기본적으로 ID/PW 기반을 제공하며, 이후 소셜 로그인/외부 IdP 연동 확장을 고려한다.
- 1차 범위에서는 OAuth2 Authorization Server 역할이 핵심이며, 필요 기능에 한해 OIDC 일부를 포함한다.
- tenant별 사용자 프로필은 완전 자유형이 아니라, **tenant가 정의한 schema metadata에 따라 검증되는 가변 구조**를 사용한다.

## 4. 요구사항

### 4.1 기능 요구사항

- tenant 생성/수정/비활성화/조회 기능
- tenant별 OAuth client 등록 및 관리 기능
- tenant별 사용자 생성/조회/수정/비활성화 기능
- tenant별 사용자 프로필 schema 정의/버전 관리 기능
- Authorization Code + PKCE 지원
- Client Credentials 지원
- Refresh Token 발급 및 rotation 지원
- 토큰 폐기(revocation) 지원
- 사용자 동의(consent) 기록 및 scope 관리
- `userinfo`, discovery, JWKS 등 OIDC 확장 가능 구조 확보
- 감사 로그 및 관리자 활동 추적

### 4.2 비기능 요구사항

- tenant 간 강한 논리적 격리
- tenant별 정책(토큰 TTL, PKCE 강제 여부, 허용 grant 등) 독립 설정
- 확장 가능한 프로필 모델과 검증 체계
- 감사 가능성(auditability)
- 고가용성 및 운영 자동화 고려
- 보안 기본값 우선(secure by default)
- 대용량 tenant 증가 시에도 관리 가능한 인덱스/조회 전략 확보

## 5. 범위 정의

### 5.1 MVP 범위

- 멀티테넌트 tenant 관리
- tenant별 사용자 및 프로필 schema 관리
- OAuth2 Authorization Code + PKCE
- Client Credentials
- Refresh Token rotation
- 관리자 API 및 기본 관리 UI
- 감사 로그 기초 기능
- JWT access token + opaque refresh token

### 5.2 이후 확장 범위

- OIDC 완전 지원 (`id_token`, `userinfo`, discovery, JWKS)
- 외부 IdP federation (Google, Microsoft, SAML bridge 등)
- 조직/그룹/역할 기반 권한 관리(RBAC/ABAC)
- SCIM 프로비저닝
- tenant별 브랜딩/커스텀 로그인 화면
- region 분리, read replica, sharding 전략

## 6. 핵심 설계 원칙

- **공통 인증 코어와 tenant별 확장 데이터 모델을 분리**한다.
- **인증에 필요한 필수 데이터는 정형 컬럼**으로 유지한다.
- **tenant별 차이점은 schema metadata + JSONB profile**로 흡수한다.
- **tenant 경계는 모든 도메인 모델과 쿼리의 1급 제약조건**으로 취급한다.
- **표준 OAuth2/OIDC 계약은 안정적으로 유지**하고, tenant별 데이터 모델 변화가 인증 플로우를 깨지 않게 한다.

## 7. 전체 아키텍처 개요

### 7.1 상위 구성

- **Admin/API Layer**: tenant, client, schema, user 관리 API
- **Authorization Layer**: authorize, token, revoke, introspect, consent 처리
- **Identity/Profile Layer**: 사용자 인증, 프로필 검증, claims 매핑
- **Policy Layer**: tenant 설정, scope 정책, grant 허용 정책
- **Audit/Security Layer**: 감사 로그, rate limiting, secret/key 관리
- **Persistence Layer**: PostgreSQL, Redis(선택), object storage(향후 선택)

### 7.2 권장 배포 구조

- API 서버: stateless NestJS 애플리케이션 다중 인스턴스
- PostgreSQL: primary + backup/replica 고려
- Redis: authorization code, rate limiting, 세션/캐시 최적화에 선택적으로 사용
- Key 관리: KMS/Vault 또는 최소한 분리된 secret storage 사용

## 8. 멀티테넌시 전략

### 8.1 격리 모델 선택

1차 릴리스는 **shared schema + tenant_id 기반 논리적 격리**를 권장한다.

이유:

- 운영 복잡도가 schema-per-tenant, database-per-tenant보다 낮다.
- tenant 수가 많아도 배포/마이그레이션/백업 전략이 단순하다.
- 공통 리포트, 운영 도구, 감사 쿼리 작성이 상대적으로 쉽다.
- tenant별 프로필 차이는 JSONB와 schema metadata로 흡수할 수 있다.

단, 다음 조건을 강제해야 한다.

- 거의 모든 핵심 테이블에 `tenant_id` 포함
- 애플리케이션 서비스 레이어에서 tenant context 강제 주입
- repository/query layer에서 tenant 조건 누락 방지 패턴 적용
- 관리자 권한도 tenant 범위 기반으로 제한
- 감사로그/캐시/비동기 이벤트에도 tenant_id 포함

### 8.2 tenant 식별 방식

권장 우선순위:

- 외부 OAuth 엔드포인트: `/t/:tenantSlug/oauth/...` 또는 `tenantSlug.auth.example.com`
- 내부 관리 API: JWT 내 `tenant_id` 또는 platform-admin scope 기반 식별
- OAuth client는 반드시 특정 tenant에 귀속되며, client lookup 시 tenant 경계를 함께 확인

### 8.3 tenant 격리 수준 정책

- **Application isolation**: 모든 command/query에 tenant context 필수
- **Data isolation**: unique key, foreign key, composite index에 tenant 기준 포함
- **Operational isolation**: 로그, 감사, rate limit, alerting에 tenant 태그 포함
- **Security isolation**: tenant admin은 자기 tenant 데이터만 접근 가능

## 9. OAuth2 / OIDC 범위 및 핵심 플로우

### 9.1 MVP에서 지원할 OAuth2 플로우

- Authorization Code + PKCE
- Client Credentials
- Refresh Token
- Token Revocation

### 9.2 OIDC 범위 결정

MVP는 **OAuth2 중심**으로 시작하되, 아래 항목은 조기 포함을 권장한다.

- `/.well-known/openid-configuration`
- `/jwks.json`
- `/userinfo`

단, `id_token` 발급까지 MVP에 포함할지는 명시적으로 결정해야 한다.

- **보수적 MVP**: discovery + JWKS + userinfo만 준비, `id_token`은 차기 단계
- **확장형 MVP**: OIDC 기본 지원까지 포함

### 9.3 핵심 도메인 컴포넌트

- Authorization Endpoint
- Token Endpoint
- Revocation Endpoint
- Consent Service
- Client Authentication Service
- Scope Policy Service
- Claims Mapping Service
- Signing Key Service

## 10. PostgreSQL 데이터 모델 전략

### 10.1 설계 원칙

- 인증/인가 핵심 개체는 정형 테이블로 설계한다.
- tenant별 확장 프로필은 JSONB로 저장한다.
- 프로필 구조 정의는 별도 schema metadata 테이블로 관리한다.
- schema 자체도 버전 관리하여 tenant별 데이터 진화를 추적한다.

### 10.2 권장 핵심 테이블

#### 테넌트 및 운영

- `tenants`
  - 기본 tenant 정보
  - slug, status, issuer, branding, security settings
- `tenant_domains`
  - tenant별 사용자 접근 도메인/서브도메인 매핑
- `tenant_settings`
  - 토큰 TTL, PKCE 강제 여부, 허용 grant, password policy 등

#### 사용자 및 프로필

- `users`
  - `id`, `tenant_id`, `login_id`, `email`, `password_hash`, `status`, `created_at`
  - 인증 및 계정 상태 관리에 필요한 안정적 필드만 포함
- `user_profiles`
  - `user_id`, `tenant_id`, `schema_version_id`, `profile_jsonb`, `profile_search_vector(optional)`, `updated_at`
- `profile_schema_versions`
  - `id`, `tenant_id`, `version`, `schema_jsonb`, `status`, `created_at`, `published_by`

#### OAuth2/OIDC

- `oauth_clients`
- `oauth_client_redirect_uris`
- `oauth_client_scopes`
- `authorization_codes`
- `access_tokens`
- `refresh_tokens`
- `consents`
- `signing_keys`

#### 운영/보안

- `audit_logs`
- `admin_users`
- `admin_roles`
- `admin_role_bindings`
- `failed_login_attempts`
- `refresh_token_families`

### 10.3 왜 relational core + JSONB 조합이 적절한가

- 로그인, 식별, 상태, tenant 관계는 자주 조회되므로 정형 컬럼이 유리하다.
- tenant별 프로필은 변경 빈도와 구조 편차가 크므로 JSONB가 적합하다.
- PostgreSQL JSONB는 인덱싱, containment query, 부분 업데이트 지원이 가능하다.
- schema metadata를 별도로 두면 검증, 버전 관리, UI 폼 생성, claims 매핑에 재사용 가능하다.

## 11. 가변 사용자 프로필 데이터 처리 전략

### 11.1 권장 모델

- `users` 테이블: 공통 인증 필드만 저장
- `user_profiles.profile_jsonb`: tenant별 확장 프로필 저장
- `profile_schema_versions.schema_jsonb`: tenant가 정의한 프로필 구조/제약 조건 저장

### 11.2 스키마 정의 방식

tenant는 프로필 구조를 JSON Schema 유사 포맷으로 정의한다.

포함해야 할 메타데이터 예시:

- 필드명
- 데이터 타입
- required 여부
- enum/format/pattern 제약
- 민감도(sensitivity)
- 검색 가능 여부(searchable)
- claims 노출 여부
- 관리자 UI 표시 순서/레이블

### 11.3 검증 방식

- profile 저장 시 tenant의 활성 schema version을 조회한다.
- AJV 등 JSON Schema validator로 요청 payload를 검증한다.
- 필수 필드/포맷 검증 실패 시 명확한 validation error 반환
- tenant 설정에 따라 strict mode / permissive mode 선택 가능

### 11.4 버전 관리 전략

- schema 수정은 덮어쓰기가 아니라 **새 version 발행**으로 처리한다.
- 사용자 프로필은 자신이 저장된 시점의 `schema_version_id`를 참조한다.
- 새 schema 배포 후 기존 사용자 데이터는 점진적 migration 또는 lazy migration 전략을 적용한다.
- schema 변경 이력은 감사 가능해야 한다.

### 11.5 조회 및 인덱싱 전략

- 공통 조회 조건은 정형 컬럼 인덱스 사용
- 특정 tenant에서 자주 검색되는 JSONB 필드는 expression index 또는 generated column 검토
- 무분별한 JSONB 범용 검색은 지양하고, 빈번한 검색 필드는 승격(promote) 대상인지 검토

### 11.6 EAV를 기본 선택으로 두지 않는 이유

- EAV는 유연하지만 조인 비용, 복잡한 검증, 통계/집계 난이도, 운영 복잡도가 크다.
- 본 시스템은 인증 플랫폼이므로 프로필 자유도보다 **일관된 인증 코어 유지와 운영 단순성**이 더 중요하다.
- 따라서 기본 전략은 **정형 코어 + JSONB + schema metadata + selective indexing**가 적절하다.

## 12. 공유 인증 로직과 tenant별 프로필 진화의 분리

다음 영역은 tenant별 프로필 변화와 분리되어야 한다.

- 사용자 식별자/로그인 정책
- 비밀번호 해시 및 계정 잠금 정책
- OAuth2 authorize/token/revoke 처리 로직
- client 인증 로직
- 토큰 서명/검증
- scope 및 consent 처리

반대로 tenant별로 달라질 수 있는 영역은 다음과 같다.

- 회원가입/프로필 입력 필드
- 프로필 검증 규칙
- claims 매핑 규칙
- UI 폼 구성과 필드 라벨
- 특정 scope 요청 시 필요한 프로필 필드

이 분리를 문서/코드 구조에 명확히 반영해야 장기 유지보수가 가능하다.

## 13. NestJS 기준 권장 모듈 분리

- `platform-admin` 모듈
  - platform 관리자 기능
- `tenant-admin` 모듈
  - tenant 생성, 설정, client 관리, schema 관리
- `identity` 모듈
  - 사용자 계정, 로그인, 비밀번호 정책
- `profile-schema` 모듈
  - profile schema version 발행, 검증, migration 지원
- `profile` 모듈
  - user profile 저장/조회/검색
- `oauth-authorize` 모듈
  - authorize/consent flow
- `oauth-token` 모듈
  - token 발급, refresh, revocation
- `oauth-client` 모듈
  - client 등록, secret rotation, redirect URI 검증
- `claims` 모듈
  - scope별 claims 매핑
- `keys` 모듈
  - signing key, JWKS, key rotation
- `audit` 모듈
  - 감사 로그 수집/조회
- `common/security` 모듈
  - crypto, hashing, throttling, guard, interceptor
- `database` 모듈
  - ORM 설정, migration, repository 공통 기능

## 14. API / 도메인 경계 제안

### 14.1 외부 OAuth API

- `GET /t/:tenantSlug/oauth/authorize`
- `POST /t/:tenantSlug/oauth/authorize/consent`
- `POST /t/:tenantSlug/oauth/token`
- `POST /t/:tenantSlug/oauth/revoke`
- `GET /t/:tenantSlug/oauth/userinfo`
- `GET /t/:tenantSlug/.well-known/openid-configuration`
- `GET /t/:tenantSlug/.well-known/jwks.json`

### 14.2 Tenant Admin API

- tenant 설정 관리
- client 등록/비활성화/secret rotation
- profile schema version 발행/조회
- 사용자 생성/수정/비활성화
- consent/audit 조회

### 14.3 Internal Domain Services

- TenantResolver
- TenantPolicyService
- ClientValidationService
- ProfileValidationService
- ConsentService
- TokenIssueService
- TokenRotationService
- ClaimsAssembler

## 15. 보안 전략

### 15.1 인증/토큰 보안

- Access Token은 기본적으로 JWT(RS256 또는 ES256) 사용
- Refresh Token은 opaque token으로 저장하고 해시 또는 안전 저장 정책 적용
- refresh token rotation 및 재사용 감지(reuse detection) 구현
- public client에는 PKCE 강제
- redirect URI exact match 검증
- client secret은 평문 저장 금지, rotation 기능 제공

### 15.2 키 및 비밀정보 관리

- signing key는 versioned keyset으로 관리
- JWKS endpoint 제공
- key rotation 정책(정기/긴급) 문서화
- tenant 설정과 비밀정보는 분리 저장
- 운영 환경에서는 KMS/Vault 사용 권장

### 15.3 관리자 보안

- platform admin과 tenant admin 역할 분리
- RBAC 기반 접근 제어
- 관리자 MFA는 차기 우선순위가 높음
- 관리자 활동은 모두 audit log 기록

### 15.4 애플리케이션 보안

- rate limiting 및 IP/tenant 기반 abuse 제어
- brute-force / credential stuffing 방지
- CSRF 보호(관리자 콘솔 및 consent 처리)
- CSP, secure cookie, same-site 정책 적용
- 민감정보 마스킹 및 최소 조회 원칙 적용

### 15.5 개인정보 및 규제 대응

- PII 분류 기준 수립
- 필요 시 profile JSONB 일부 필드 암호화 고려
- 로그에 민감정보 직접 기록 금지
- 데이터 보존/삭제 정책 정의

## 16. 감사 및 운영 고려사항

- 모든 주요 이벤트에 `tenant_id`, `actor_id`, `target_type`, `target_id`, `action`, `result` 기록
- 로그인 실패, 토큰 발급, consent 승인, schema 변경, client secret rotation은 필수 감사 대상
- 헬스체크, readiness, metrics endpoint 제공
- 장애 분석을 위한 correlation id / request id 도입
- tenant별 사용량/에러율 모니터링 가능 구조 확보

## 17. 테스트 전략

### 17.1 단위 테스트

- tenant policy 검증
- profile schema validation
- token issue / refresh / revoke 로직
- redirect URI 검증
- claims mapping 로직

### 17.2 통합 테스트

- tenant 생성 → schema 발행 → 사용자 등록 → authorize → token 발급 흐름
- 잘못된 tenant/client 조합 차단
- schema version 변경 후 사용자 프로필 저장/조회 검증
- refresh token rotation 및 reuse detection 검증

### 17.3 E2E 테스트

- browser 기반 authorize/consent 플로우
- client credentials 토큰 발급
- tenant admin API 권한 경계 테스트
- multi-tenant 데이터 격리 테스트

### 17.4 보안 테스트

- redirect URI 변조 시도
- authorization code 재사용 시도
- refresh token 재사용 시도
- tenant 경계 우회 시도
- rate limiting 동작 검증

## 18. 개발 단계별 로드맵

### Phase 0 — 상세 설계 확정

- 도메인 모델, 용어, issuer 정책 확정
- OAuth2-only vs OIDC MVP 범위 확정
- tenant 식별 방식(path vs subdomain) 확정
- profile schema metadata 포맷 확정

### Phase 1 — 기반 시스템 구축

- NestJS 프로젝트 구조 확정
- PostgreSQL 스키마 및 migration 초기화
- 공통 보안 모듈, config 모듈, audit skeleton 구성
- tenant context 처리 공통 미들웨어/가드 설계

### Phase 2 — Tenant/Admin 기능

- tenant CRUD 및 설정 관리
- OAuth client 관리
- profile schema version 관리
- 사용자 및 프로필 관리 API

### Phase 3 — OAuth2 코어 구현

- authorize endpoint
- consent 처리
- token endpoint
- refresh token rotation
- revoke endpoint
- JWKS 및 key 관리 기초

### Phase 4 — 운영/보안 강화

- audit log 완성
- rate limiting 및 abuse protection
- failed login tracking
- 관리자 RBAC 강화

### Phase 5 — Admin UI (Frontend)

- 플랫폼 관리자 콘솔 (테넌트 관리, 관리자 계정 관리)
- 테넌트 관리자 콘솔 (OAuth 클라이언트, 사용자, 프로필 스키마, 감사 로그)
- 로그인/부트스트랩 화면
- API 연동 레이어 구성

### Phase 6 — 확장 및 운영

- login/consent UI (사용자용)
- userinfo/discovery/OIDC 확장
- observability 개선

## 19. 프론트엔드 Admin UI 계획

### 19.1 기술 스택

기존 Vue 3 + Vite + TypeScript 기반 위에 다음을 추가한다.

| 역할 | 선택 | 이유 |
|---|---|---|
| 라우팅 | Vue Router 4 | Vue 공식 라우터, 중첩 라우트/가드 지원 |
| 상태 관리 | Pinia | Vue 3 공식 권장, 타입 안전, DevTools 지원 |
| UI 컴포넌트 | shadcn-vue (Radix Vue 기반) | headless + Tailwind, 커스터마이징 용이 |
| CSS 유틸리티 | Tailwind CSS v4 | 빠른 스타일링, 번들 크기 최소화 |
| HTTP 클라이언트 | axios | 인터셉터로 토큰 자동 첨부/갱신 처리 |
| 폼 검증 | Zod + vee-validate | 스키마 기반 검증, 백엔드 DTO와 일관성 |
| 아이콘 | Lucide Vue Next | 일관된 아이콘 세트 |

### 19.2 프로젝트 구조

```
frontend/src/
├── api/               # axios 인스턴스 + 도메인별 API 함수
│   ├── http.ts        # axios 인스턴스, 인터셉터
│   ├── auth.ts        # 로그인, 부트스트랩
│   ├── tenants.ts     # 테넌트 CRUD
│   ├── clients.ts     # OAuth 클라이언트 CRUD
│   ├── users.ts       # 사용자 CRUD
│   ├── schemas.ts     # 프로필 스키마 버전
│   └── audit.ts       # 감사 로그 조회
├── stores/            # Pinia 스토어
│   ├── auth.store.ts  # 관리자 인증 상태, JWT 보관
│   └── ui.store.ts    # 사이드바 open/close 등 UI 상태
├── router/            # Vue Router 설정
│   └── index.ts       # 라우트 정의 + 인증 가드
├── layouts/
│   ├── AuthLayout.vue  # 로그인 페이지용 레이아웃
│   └── AdminLayout.vue # 사이드바 + 헤더 포함 관리자 레이아웃
├── views/             # 페이지 단위 컴포넌트
│   ├── auth/
│   │   ├── LoginView.vue
│   │   └── BootstrapView.vue
│   ├── platform/
│   │   ├── DashboardView.vue
│   │   ├── tenants/
│   │   │   ├── TenantListView.vue
│   │   │   ├── TenantCreateView.vue
│   │   │   └── TenantDetailView.vue
│   │   └── admins/
│   │       ├── AdminListView.vue
│   │       └── AdminCreateView.vue
│   └── tenant/
│       ├── DashboardView.vue
│       ├── clients/
│       │   ├── ClientListView.vue
│       │   ├── ClientCreateView.vue
│       │   └── ClientDetailView.vue
│       ├── users/
│       │   ├── UserListView.vue
│       │   ├── UserCreateView.vue
│       │   └── UserDetailView.vue
│       ├── schemas/
│       │   ├── SchemaListView.vue
│       │   └── SchemaPublishView.vue
│       └── audit/
│           └── AuditLogView.vue
└── components/        # 재사용 가능한 UI 컴포넌트
    ├── ui/            # shadcn-vue 기본 컴포넌트
    ├── forms/         # 공통 폼 컴포넌트
    └── shared/        # DataTable, Pagination, StatusBadge 등
```

### 19.3 화면 목록 및 기능 명세

#### 인증

| 화면 | 경로 | 설명 |
|---|---|---|
| 로그인 | `/admin/login` | 이메일/비밀번호 입력, JWT 발급 후 대시보드 이동 |
| 최초 설정 | `/admin/bootstrap` | PLATFORM_ADMIN_SECRET + 이메일 + 비밀번호로 최초 관리자 생성 |

#### 플랫폼 관리자 (PLATFORM_ADMIN)

| 화면 | 경로 | 기능 |
|---|---|---|
| 대시보드 | `/admin/` | 테넌트 수, 사용자 수 등 요약 통계 |
| 테넌트 목록 | `/admin/tenants` | 테이블 조회, 검색, 상태 필터, 신규 생성 버튼 |
| 테넌트 생성 | `/admin/tenants/new` | slug, name 입력 폼 |
| 테넌트 상세 | `/admin/tenants/:id` | 설정(토큰 TTL, PKCE 강제, grant 허용 등) 편집 |
| 관리자 목록 | `/admin/admins` | 관리자 계정 목록, 비활성화 |
| 관리자 생성 | `/admin/admins/new` | 이메일/비밀번호/역할/테넌트 지정 |

#### 테넌트 관리자 (TENANT_ADMIN, 테넌트 컨텍스트 내)

| 화면 | 경로 | 기능 |
|---|---|---|
| 테넌트 대시보드 | `/admin/tenants/:id/dashboard` | 사용자 수, 클라이언트 수, 최근 감사 로그 요약 |
| OAuth 클라이언트 목록 | `/admin/tenants/:id/clients` | 클라이언트 목록, 상태 배지 |
| OAuth 클라이언트 생성 | `/admin/tenants/:id/clients/new` | 이름, 타입, 허용 스코프, redirect URI 입력 |
| OAuth 클라이언트 상세 | `/admin/tenants/:id/clients/:clientId` | 상세 정보, 시크릿 rotation 버튼 |
| 사용자 목록 | `/admin/tenants/:id/users` | 목록, 검색, 상태 필터 |
| 사용자 생성 | `/admin/tenants/:id/users/new` | 이메일, 비밀번호, 프로필 JSONB 입력 |
| 사용자 상세 | `/admin/tenants/:id/users/:userId` | 정보 조회, 비활성화 |
| 프로필 스키마 목록 | `/admin/tenants/:id/schemas` | 버전 목록, 상태(draft/active) |
| 프로필 스키마 발행 | `/admin/tenants/:id/schemas/new` | JSON Schema 에디터, 발행 버튼 |
| 감사 로그 | `/admin/tenants/:id/audit` | 이벤트 목록, 액션/날짜 필터 |

### 19.4 인증 및 라우팅 전략

#### 인증 가드

```
beforeEach 훅:
  - 비인증 상태 + 보호된 라우트 → /admin/login 리다이렉트
  - PLATFORM_ADMIN 전용 라우트에 TENANT_ADMIN 접근 → 403 페이지
  - JWT 만료 시 자동 로그아웃 + /admin/login 리다이렉트
```

#### JWT 관리

- localStorage에 access_token 저장
- axios 요청 인터셉터에서 `Authorization: Bearer <token>` 자동 첨부
- 401 응답 수신 시 로그아웃 처리

#### 역할 기반 사이드바

- PLATFORM_ADMIN: 테넌트 관리, 관리자 관리 메뉴 표시
- TENANT_ADMIN: 담당 테넌트 내 메뉴만 표시

### 19.5 핵심 컴포넌트

| 컴포넌트 | 역할 |
|---|---|
| `DataTable.vue` | 정렬/페이지네이션 지원 범용 테이블 |
| `StatusBadge.vue` | ACTIVE/INACTIVE/LOCKED 상태 시각화 |
| `ConfirmDialog.vue` | 비활성화, 시크릿 rotation 등 파괴적 액션 확인 모달 |
| `JsonSchemaEditor.vue` | 프로필 스키마 작성용 Monaco 에디터 래퍼 |
| `CopyableField.vue` | client_id, plain secret 등 복사 버튼 포함 읽기 전용 필드 |
| `AuditLogTable.vue` | 감사 로그 전용 테이블 (액션 아이콘, 메타데이터 확장) |

### 19.6 개발 단계

#### Frontend Phase 1 — 기반 설정 및 인증

- Tailwind CSS, shadcn-vue, Vue Router, Pinia, axios, Zod 설치 및 설정
- AdminLayout, AuthLayout 구성
- 라우터 정의 및 인증 가드 구현
- Pinia auth store (JWT 저장, 로그인/로그아웃)
- 로그인 화면, 부트스트랩 화면 구현

#### Frontend Phase 2 — 플랫폼 관리자 화면

- 대시보드 (통계 카드)
- 테넌트 목록/생성/상세(설정 편집) 화면
- 관리자 계정 목록/생성 화면
- DataTable, StatusBadge, ConfirmDialog 공통 컴포넌트

#### Frontend Phase 3 — 테넌트 관리자 화면

- OAuth 클라이언트 목록/생성/상세 화면 (시크릿 rotation 포함)
- 사용자 목록/생성/상세 화면
- 프로필 스키마 목록/발행 화면 (JSON 에디터 포함)
- 감사 로그 화면 (필터링, 페이지네이션)

### 19.7 백엔드 연동 주의사항

- CORS: 백엔드에서 프론트엔드 origin 허용 설정 필요
- CSRF: JWT Bearer 방식이므로 별도 CSRF 토큰 불필요
- 환경변수: `VITE_API_BASE_URL`로 백엔드 주소 주입
- 에러 처리: axios 응답 인터셉터에서 공통 에러 메시지 토스트 표시

## 21. 위험요소와 대응책

| 위험요소 | 설명 | 대응책 |
|---|---|---|
| tenant 조건 누락 | 데이터 누수 가능성 | repository 패턴 표준화, 테스트로 tenant 경계 강제 |
| JSONB 남용 | 검색/성능 악화 | 공통 필드 정형화, 자주 검색되는 필드만 인덱싱 |
| schema 변경 충돌 | 기존 사용자 데이터와 불일치 | schema versioning, migration 전략, strict validation |
| OIDC 범위 과확장 | MVP 일정 지연 | OAuth2 core 우선, OIDC는 단계적 포함 |
| refresh token 탈취 | 계정 악용 가능 | rotation, reuse detection, 감사 로그 |
| key 관리 미흡 | 토큰 신뢰 붕괴 | key versioning, JWKS, rotation runbook |
| 관리자 권한 남용 | 내부 보안 사고 | RBAC, audit, MFA, least privilege |

## 22. MVP 승인 기준

다음 조건이 충족되면 MVP 출시 가능으로 본다.

- tenant 생성 및 설정 관리 가능
- tenant별 사용자/프로필 schema 관리 가능
- Authorization Code + PKCE 정상 동작
- Client Credentials 정상 동작
- Refresh Token rotation 정상 동작
- tenant 간 데이터 격리 테스트 통과
- 감사 로그 핵심 이벤트 기록 가능
- 운영자가 key 및 client secret을 rotation할 수 있음

## 23. 구현 우선순위 제안

1. tenant context와 데이터 모델 확정
2. profile schema versioning 구조 확정
3. OAuth2 core endpoint 구현
4. token/key/security hardening
5. admin tooling 및 운영성 강화

## 24. 최종 권장안 요약

- **멀티테넌시**: shared schema + tenant_id 논리 격리
- **사용자 모델**: 공통 인증 필드는 relational core, tenant별 확장 프로필은 JSONB
- **프로필 진화 전략**: schema metadata + versioning + validator 기반 운영
- **OAuth 전략**: OAuth2 코어를 우선 구현하고 OIDC는 단계적 확장
- **보안 전략**: PKCE, token rotation, key rotation, audit, RBAC를 기본 내장

이 계획을 기준으로 구현을 시작하면, 인증 코어의 안정성을 유지하면서도 tenant별 사용자 모델 다양성을 PostgreSQL 안에서 현실적으로 수용할 수 있다.
