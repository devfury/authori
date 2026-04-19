# 외부 인증 프로바이더 연동 설계 (JIT Provisioning)

## 개요

로컬 사용자 DB에 계정이 없을 때, 외부 서비스(사내 LDAP 브릿지, 레거시 회원 시스템 등)에 자격증명 검증을 위임하고, 인증 성공 시 로컬 사용자를 자동 생성(JIT: Just-In-Time Provisioning)한다. 이후 로그인부터는 로컬 사용자 기준으로 처리되며, 선택적으로 매 로그인마다 외부 서비스에서 프로필 데이터를 동기화할 수 있다.

---

## 배경

기존 Authori는 자체 생성된 사용자만 인증할 수 있다. 이미 다른 시스템에 회원 DB가 존재하는 테넌트 입장에서는 사용자를 직접 마이그레이션하거나 이중 관리해야 하는 불편함이 있다. 외부 인증 프로바이더 연동을 통해 기존 회원 시스템과 점진적으로 통합할 수 있다.

---

## 데이터 모델

### 새 엔티티: `external_auth_providers`

```typescript
@Entity('external_auth_providers')
export class ExternalAuthProvider {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  /**
   * null이면 테넌트 전체 클라이언트에 적용.
   * 값이 있으면 해당 clientId 인증 시에만 적용.
   */
  @Column({ name: 'client_id', nullable: true })
  clientId: string | null;

  @Column({ default: true })
  enabled: boolean;

  /** 외부 인증 API 엔드포인트 URL */
  @Column({ name: 'provider_url' })
  providerUrl: string;

  /** 요청에 실을 인증 헤더 이름 (예: 'X-Api-Key', 'Authorization') */
  @Column({ name: 'credential_header', nullable: true })
  credentialHeader: string | null;

  /**
   * 헤더 값 (API 키, "Bearer {token}" 등).
   * 저장 시 AES 암호화 권장 (현재는 평문).
   */
  @Column({ name: 'credential_value', nullable: true })
  credentialValue: string | null;

  /** 최초 인증 성공 시 로컬 User 자동 생성 여부 */
  @Column({ name: 'jit_provision', default: true })
  jitProvision: boolean;

  /**
   * 로그인마다 외부 서비스에서 프로필 데이터를 가져와 동기화 여부.
   * true이면 매 로그인 시 외부 API 재호출 (latency 증가 감수).
   */
  @Column({ name: 'sync_on_login', default: false })
  syncOnLogin: boolean;

  /**
   * 외부 응답 필드 → 로컬 User 필드 매핑.
   * 지정하지 않으면 동일 이름 필드를 그대로 사용.
   */
  @Column({ name: 'field_mapping', type: 'jsonb', nullable: true })
  fieldMapping: ExternalAuthFieldMapping | null;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}

export interface ExternalAuthFieldMapping {
  /** 외부 응답에서 이메일에 해당하는 필드 경로. 기본: 'email' */
  email?: string;
  /** 외부 응답에서 이름에 해당하는 필드 경로. 기본: 'name' */
  name?: string;
  /** loginId 매핑 */
  loginId?: string;
  /**
   * 외부 응답 필드 → UserProfile.profileJsonb 키 매핑.
   * 예: { "dept": "department", "empNo": "employeeNumber" }
   *     외부.dept → profile.department
   */
  profile?: Record<string, string>;
}
```

### 마이그레이션

```sql
CREATE TABLE external_auth_providers (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL,
  client_id         VARCHAR     NULL,
  enabled           BOOLEAN     NOT NULL DEFAULT true,
  provider_url      TEXT        NOT NULL,
  credential_header VARCHAR     NULL,
  credential_value  TEXT        NULL,
  jit_provision     BOOLEAN     NOT NULL DEFAULT true,
  sync_on_login     BOOLEAN     NOT NULL DEFAULT false,
  field_mapping     JSONB       NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ext_auth_tenant ON external_auth_providers (tenant_id);
CREATE INDEX idx_ext_auth_client ON external_auth_providers (tenant_id, client_id);
```

---

## 외부 서비스 API 계약

Authori가 외부 서비스에 보내는 요청 스펙. 외부 서비스 구현자는 이 계약을 따라야 한다.

### Request

```http
POST <providerUrl>
<credentialHeader>: <credentialValue>
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "plain_password",
  "tenantId": "550e8400-...",
  "clientId": "abc123"
}
```

- `password`는 평문으로 전달된다. HTTPS 필수.
- 외부 서비스는 인증 성공 시 200, 실패 시 401 또는 `authenticated: false`를 반환해야 한다.
- 타임아웃: 5초. 초과 시 `invalid_credentials`로 처리.

### Response — 성공

```json
{
  "authenticated": true,
  "user": {
    "email": "user@example.com",
    "name": "홍길동",
    "loginId": "hong",
    "profile": {
      "department": "engineering",
      "employeeNumber": "EMP-001"
    }
  }
}
```

### Response — 실패

```json
{
  "authenticated": false,
  "reason": "invalid_credentials"
}
```

`reason` 필드는 선택. Authori 감사 로그 `metadata`에 기록된다.

---

## 인증 흐름 변경

### `AuthorizeService.loginAndAuthorize()` 수정 흐름

```
[기존 흐름]
  1. email로 User 조회
  2. 없으면 → LOGIN_FAILURE (invalid_credentials)
  3. 있으면 password 검증
  4. 성공 → auth code 발급

[변경된 흐름]
  1. email로 User 조회
  2. tenant + clientId에 맞는 활성 ExternalAuthProvider 조회
     (clientId 일치 우선, 없으면 client_id IS NULL인 테넌트 기본 프로바이더)

  3. 프로바이더 있음 (외부 인증이 주 인증 수단):
     a. 잠금/비활성 확인 (user가 있는 경우)
     b. 외부 API 호출
        ── 호출 성공 + authenticated:true:
            * 외부 인증 통과 → 로컬 passwordHash를 bcrypt(입력 비밀번호)로 업데이트 (동기화)
            * user가 없으면 + jitProvision:true:
                - fieldMapping 적용하여 User 생성
                - AuditLog: USER_CREATED (metadata: { source: 'external_auth', providerId })
            * syncOnLogin=true이면 user.profile을 외부 응답으로 업데이트
            * 이하 정상 로그인 플로우 진행 (auth code 발급)
        ── 호출 성공 + authenticated:false:
            * 외부 시스템이 명시적으로 인증 거부 → LOGIN_FAILURE
            * 로컬 비밀번호로 폴백 없음 (외부 시스템의 의도적 거부를 존중)
        ── 호출 실패 (네트워크 오류 / 타임아웃 / 5xx):
            * AuditLog: EXTERNAL_AUTH_ERROR (metadata: { providerId, error })
            * 폴백: 로컬 사용자가 있으면 로컬 passwordHash로 검증
            * 로컬 사용자도 없으면 → LOGIN_FAILURE

  4. 프로바이더 없음 (로컬 전용):
     a. user 없으면 → LOGIN_FAILURE (기존 동일)
     b. 잠금/비활성 확인
     c. 로컬 password 검증

  5. auth code 발급 (기존 동일)
```

### 프로바이더 우선순위 조회

```sql
SELECT * FROM external_auth_providers
WHERE tenant_id = $1
  AND enabled = true
  AND (client_id = $2 OR client_id IS NULL)
ORDER BY client_id NULLS LAST  -- client_id 일치가 NULL보다 우선
LIMIT 1;
```

---

## Backend 새 모듈: `ExternalAuthModule`

```
backend/src/external-auth/
  external-auth.module.ts
  external-auth.service.ts        ← CRUD + callProvider()
  external-auth.controller.ts     ← 관리자 REST API
  dto/
    create-provider.dto.ts
    update-provider.dto.ts
```

### 관리자 API 엔드포인트

| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/admin/tenants/:tenantId/external-auth` | 프로바이더 목록 |
| `POST` | `/admin/tenants/:tenantId/external-auth` | 프로바이더 생성 |
| `GET` | `/admin/tenants/:tenantId/external-auth/:id` | 프로바이더 상세 |
| `PATCH` | `/admin/tenants/:tenantId/external-auth/:id` | 프로바이더 수정 |
| `DELETE` | `/admin/tenants/:tenantId/external-auth/:id` | 프로바이더 삭제 |

모든 엔드포인트는 `AdminJwtGuard` + `TenantAdminGuard` 적용.

### `ExternalAuthService.callProvider()` 인터페이스

```typescript
interface ExternalAuthResult {
  authenticated: boolean;
  /**
   * 외부 시스템의 명시적 거부 사유 (authenticated:false일 때).
   * error가 없으면 외부 시스템이 의도적으로 거부한 것 → 로컬 폴백 없음.
   */
  reason?: string;
  /**
   * 호출 자체의 기술적 오류 (authenticated:false일 때).
   * 값이 있으면 연동 장애 → 로컬 비밀번호 폴백 허용.
   */
  error?: 'timeout' | 'network' | 'server_error';
  user?: {
    email: string;
    name?: string;
    loginId?: string;
    profile?: Record<string, unknown>;
  };
}

async callProvider(
  provider: ExternalAuthProvider,
  email: string,
  password: string,
  tenantId: string,
  clientId: string,
): Promise<ExternalAuthResult>
```

내부적으로 `HttpService` (axios) 사용, 타임아웃 5000ms.

반환 타입의 `error` 필드로 호출 결과를 구분한다:

| 상태 | `authenticated` | `error` | 의미 |
|---|---|---|---|
| 외부 인증 성공 | `true` | `undefined` | 정상 통과 |
| 외부 인증 거부 | `false` | `undefined` | 외부 시스템의 명시적 거부 → 폴백 없이 실패 |
| 호출 자체 실패 | `false` | `'timeout' \| 'network' \| 'server_error'` | 연동 장애 → 로컬 비밀번호로 폴백 허용 |

---

## 감사 로그 추가 항목

| 이벤트 | 설명 | metadata |
|---|---|---|
| `USER_CREATED` | JIT 프로비저닝으로 사용자 생성 시 | `{ source: 'external_auth', providerId }` |
| `LOGIN_FAILURE` | 외부 시스템의 명시적 인증 거부 | `{ reason: 'external_auth_rejected', providerId, externalReason }` |
| `LOGIN_FAILURE` | 연동 장애 시 로컬 폴백도 실패한 경우 | `{ reason: 'external_auth_error_local_fallback_failed', providerId, error }` |
| `EXTERNAL_AUTH_ERROR` | 외부 서비스 호출 장애, 로컬 폴백으로 진행 | `{ providerId, error: 'timeout'\|'network'\|'server_error', fallback: true }` |
| `LOGIN_SUCCESS` | 연동 장애로 로컬 폴백 인증 성공 | `{ source: 'local_fallback', providerId }` |

---

## Frontend

### 외부 인증 프로바이더 관리 화면 (신규)

라우트: `/admin/tenants/:tenantId/external-auth`

**목록 화면**: 프로바이더 이름/URL/활성 여부/적용 클라이언트 표시

**생성/수정 폼 필드**:
- 적용 클라이언트 (전체 적용 / 특정 클라이언트 선택)
- 활성화 여부 (토글)
- 프로바이더 URL (필수)
- 인증 헤더 이름 (예: `X-Api-Key`)
- 인증 헤더 값 (마스킹 표시)
- JIT 프로비저닝 (체크박스)
- 로그인마다 프로필 동기화 (체크박스)
- 필드 매핑 (키-값 테이블 편집기, profile 서브 매핑 포함)

---

## 보안 고려 사항

| 항목 | 내용 |
|---|---|
| 전송 보안 | `providerUrl`은 HTTPS만 허용 (프로덕션) |
| 비밀값 저장 | `credentialValue`는 향후 AES-256 암호화 저장 권장 |
| 평문 비밀번호 전달 | 외부 API로 평문 비밀번호가 전달됨 — HTTPS 강제 및 외부 서비스 신뢰 필수 |
| 타임아웃 | 5초 초과 시 외부 인증 실패로 처리, 로그인 흐름 차단 방지 |
| 실패 격리 | syncOnLogin 동기화 실패는 로그인 차단 안 함 (best-effort) |

---

## 전체 변경 파일 목록

| 파일 | 변경 유형 |
|---|---|
| `backend/src/database/entities/external-auth-provider.entity.ts` | 신규 엔티티 |
| `backend/src/database/entities/index.ts` | export 추가 |
| `backend/src/database/migrations/CreateExternalAuthProviders.ts` | 신규 마이그레이션 |
| `backend/src/external-auth/external-auth.module.ts` | 신규 모듈 |
| `backend/src/external-auth/external-auth.service.ts` | 신규 서비스 |
| `backend/src/external-auth/external-auth.controller.ts` | 신규 컨트롤러 |
| `backend/src/external-auth/dto/create-provider.dto.ts` | 신규 DTO |
| `backend/src/external-auth/dto/update-provider.dto.ts` | 신규 DTO |
| `backend/src/app.module.ts` | ExternalAuthModule 등록 |
| `backend/src/oauth/authorize/authorize.service.ts` | JIT 프로비저닝 로직 추가 |
| `backend/src/oauth/authorize/authorize.module.ts` | ExternalAuthService 주입 |
| `frontend/src/api/external-auth.ts` | 신규 API 클라이언트 |
| `frontend/src/views/tenant/external-auth/ExternalAuthListView.vue` | 신규 목록 화면 |
| `frontend/src/views/tenant/external-auth/ExternalAuthFormView.vue` | 신규 생성/수정 폼 |
| `frontend/src/router/index.ts` | 신규 라우트 추가 |
