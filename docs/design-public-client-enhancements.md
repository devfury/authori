# PUBLIC 클라이언트 인증 개선 — 설계 인덱스

## 범위

PUBLIC 타입 OAuth 클라이언트의 웹 로그인 흐름을 개선하는 두 가지 기능을 포함한다.

| # | 기능 | 문서 |
|---|---|---|
| 1 | 로그인 화면 커스터마이징 (브랜딩) | [design-login-branding.md](./design-login-branding.md) |
| 2 | 외부 인증 프로바이더 연동 (JIT Provisioning) | [design-external-auth-provider.md](./design-external-auth-provider.md) |

---

## 기능 1 요약: 로그인 화면 커스터마이징

클라이언트별로 로고, 색상, 타이틀을 설정하여 `/login` 페이지를 브랜드에 맞게 표현한다.

**핵심 변경**:
- `OAuthClient.branding` JSONB 컬럼 추가
- `GET /t/:tenantSlug/oauth/login-config?client_id=` 엔드포인트 신규
- `OAuthLoginView.vue`에서 브랜딩 데이터 조회 후 동적 스타일 적용

---

## 기능 2 요약: 외부 인증 프로바이더 연동

로컬 사용자 DB에 계정이 없을 때 외부 서비스에 인증을 위임하고, 성공 시 사용자를 자동 생성(JIT Provisioning)한다.

**핵심 변경**:
- `ExternalAuthProvider` 엔티티 신규
- `ExternalAuthModule` 신규 (관리자 CRUD API)
- `AuthorizeService.loginAndAuthorize()` — 사용자 미존재 시 외부 프로바이더 호출 분기
- 관리자 화면 신규 (프로바이더 관리)

---

## 구현 순서 권장

```
1. DB 마이그레이션 (branding 컬럼, external_auth_providers 테이블)
2. 엔티티 수정/추가
3. ExternalAuthModule (백엔드) 구현
4. AuthorizeService JIT 로직 추가
5. login-config 엔드포인트 추가
6. OAuthLoginView 브랜딩 적용
7. ClientDetailView 브랜딩 편집 UI
8. 관리자 외부 인증 프로바이더 관리 화면
```

---

## 의존 관계

```
ExternalAuthProvider
  └─ AuthorizeService (JIT 로직에서 ExternalAuthService 주입)

OAuthClient.branding
  └─ AuthorizeController (login-config 엔드포인트에서 조회)
  └─ OAuthLoginView.vue (브랜딩 적용)
```
