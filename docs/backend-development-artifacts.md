# Backend 개발 산출물 문서

## 목적

이 문서는 `backend/` 프로젝트의 개발 산출물을 빠르게 파악하고, 유지보수/확장 시 참고할 기준 정보를 제공한다.

## 기술 스택

- Framework: NestJS 11
- Language: TypeScript
- ORM: TypeORM
- DB: PostgreSQL
- 인증/보안: JWT, Passport, bcrypt, PKCE, Throttler
- API 문서: Swagger (`/docs`, non-production)

## 디렉터리 구조

```text
backend/
├─ src/
│  ├─ admin/               # 관리자 인증/권한
│  ├─ common/              # 공통 모듈 (audit, tenant, config, security)
│  ├─ database/            # data-source, 엔티티, 마이그레이션
│  ├─ external-auth/       # 외부 인증 프로바이더
│  ├─ oauth/               # authorize/token/revoke/keys/discovery/clients
│  ├─ profile-schema/      # 사용자 프로필 스키마 버전
│  ├─ tenants/             # 테넌트 관리
│  └─ users/               # 사용자 관리
├─ test/                   # e2e 테스트
└─ package.json
```

## 핵심 모듈 산출물

1. `AppModule` 조립
- `ConfigModule`, `DatabaseModule`, `AuditModule` 공통 인프라 구성
- OAuth/OIDC 흐름 모듈 (`authorize`, `token`, `revoke`, `keys`, `discovery`) 조립
- 관리자 인증(`admin/auth`), 외부 인증(`external-auth`) 조립

2. 멀티테넌트 처리
- `TenantMiddleware`: `/t/:tenantSlug/*` 경로에서 tenant 컨텍스트 주입
- 엔티티 전반에서 `tenant_id` 기반 논리 격리

3. 요청 추적/감사
- `RequestIdMiddleware`: 모든 요청에 request id 부여
- `AuditModule` + `AuditService`: 주요 변경 이벤트 기록

4. 데이터 모델
- 주요 엔티티: `Tenant`, `AdminUser`, `User`, `OauthClient`, `AuthorizationCode`, `AccessToken`, `RefreshToken`, `SigningKey`, `Consent`, `AuditLog`, `ExternalAuthProvider`
- 마이그레이션: `src/database/migrations/*`

## 런타임/명령 산출물

- 개발 실행: `bun run start:dev`
- 빌드: `bun run build`
- 테스트: `bun run test`, `bun run test:e2e`
- 마이그레이션:
  - 생성: `bun run migration:generate -- src/database/migrations/<Name>`
  - 적용: `bun run migration:run`
  - 롤백: `bun run migration:revert`

## 운영 체크리스트

- 새 엔드포인트 추가 시:
  - DTO 검증(class-validator) 적용
  - 인증/인가 Guard 적용
  - 감사 로그 필요 여부 점검
- 트랜잭션 필요한 쓰기 작업은 `dataSource.transaction(...)` 사용
- 스키마 변경은 엔티티 + 마이그레이션 동시 반영

## 관련 문서

- `docs/conventions.md`
- `docs/design-external-auth-provider.md`
- `docs/design-public-client-enhancements.md`
