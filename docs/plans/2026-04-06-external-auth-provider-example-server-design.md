# 외부 인증 프로바이더 예제 서버 계획

## 개요

`example/ext-auth-provider/`에 Authori의 외부 인증 프로바이더 연동을 검증하기 위한 독립적인 NestJS 예제 서버를 둔다. 이 서버는 실제 외부 회원 시스템 대신 동작하는 Mock Provider 역할을 하며, Authori가 보내는 인증 요청을 받아 성공/실패/장애/타임아웃 케이스를 재현할 수 있어야 한다.

기본 실행 포트는 `3002`이며, Swagger UI는 `/docs`에 노출한다. 현재 저장소에 이미 존재하는 `example/ext-auth-provider/src/main.ts`의 부트스트랩 패턴(`ValidationPipe`, Swagger, `PORT`)을 기준으로 문서를 정리한다.

---

## 위치

```text
example/ext-auth-provider/
```

- 독립적인 NestJS 앱
- 기본 포트: `3002`
- Swagger UI: `http://localhost:3002/docs`

---

## 목표

1. Authori의 `ExternalAuthService.callProvider()` 연동을 손쉽게 수동/자동 테스트할 수 있어야 한다.
2. 정상 인증, 명시적 인증 거부, 서버 오류, 타임아웃 케이스를 일관되게 재현할 수 있어야 한다.
3. 별도 DB 없이 메모리 기반 사용자 목록으로 동작하여 예제 서버를 가볍게 유지한다.
4. `CREDENTIAL_HEADER` / `CREDENTIAL_VALUE`를 통해 Authori → Provider 호출 시 헤더 검증 시나리오를 테스트할 수 있어야 한다.

---

## API 계약

Authori 백엔드가 외부 인증 프로바이더에 보내는 요청 계약은 기존 [design-external-auth-provider.md](./design-external-auth-provider.md)의 외부 서비스 API 계약을 따른다. 예제 서버는 그 계약을 구현하는 테스트용 서버다.

### Authori → 예제 서버 요청

```http
POST {providerUrl}
Content-Type: application/json
{credential_header}: {credential_value}

{
  "email": "user@example.com",
  "password": "plain_password",
  "tenantId": "550e8400-e29b-41d4-a716-446655440000",
  "clientId": "example-client"
}
```

- `{credential_header}` / `{credential_value}`는 설정된 경우에만 포함된다.
- 예제 서버는 헤더가 설정되어 있으면 요청 헤더 검증을 수행한다.
- 요청 본문은 DTO 검증 대상이며, 전역 `ValidationPipe({ whitelist: true })`를 적용한다.

### 예제 서버 → Authori 응답 (성공)

```json
{
  "authenticated": true,
  "user": {
    "email": "alice@example.com",
    "name": "Alice Kim",
    "loginId": "alice@example.com",
    "profile": {
      "department": "engineering"
    }
  }
}
```

### 예제 서버 → Authori 응답 (명시적 거부)

```json
{
  "authenticated": false,
  "reason": "invalid_password"
}
```

- 이 케이스는 외부 시스템이 의도적으로 인증을 거부한 경우다.
- Authori는 로컬 폴백 없이 로그인 실패로 처리해야 한다.

### 예제 서버 → Authori 응답 (서버 오류)

- 예제 서버가 `HTTP 500`을 반환하면 Authori는 이를 `server_error`로 간주한다.
- 이 경우 Authori는 로컬 폴백을 시도할 수 있어야 한다.

---

## 모듈 구조

```text
src/
  main.ts
  app.module.ts
  users/
    users.service.ts
    users.controller.ts
    users.module.ts
  auth/
    auth.controller.ts
    auth.service.ts
    auth.module.ts
    dto/
      auth-request.dto.ts
```

### `main.ts`

- `PORT` 환경변수로 포트를 결정하고 기본값은 `3002`
- 전역 `ValidationPipe` 적용
- Swagger/OpenAPI 설정
- `/docs` 경로에 Swagger UI 노출

### `app.module.ts`

- `ConfigModule.forRoot({ isGlobal: true })` 사용
- `UsersModule`, `AuthModule` 조립

### `users/`

- 메모리 내 사용자 목록을 관리
- `USERS_JSON` 환경변수로 기본 사용자 목록 오버라이드 가능
- 테스트 편의를 위한 관리용 API 제공

### `auth/`

- Authori가 호출하는 핵심 엔드포인트 `POST /auth`
- 헤더 검증, 특수 비밀번호 시나리오 처리, 사용자 인증 응답 생성 담당

---

## 엔드포인트 계획

### `POST /auth`

Authori가 호출하는 핵심 인증 엔드포인트.

#### 요청 DTO

```typescript
export class AuthRequestDto {
  email: string;
  password: string;
  tenantId: string;
  clientId: string;
}
```

#### 동작 규칙

1. `CREDENTIAL_HEADER` / `CREDENTIAL_VALUE`가 설정된 경우 요청 헤더를 검증한다.
2. `password`가 특수 시뮬레이션 값인지 먼저 확인한다.
3. 일반 비밀번호인 경우 메모리 사용자 목록에서 `email` 기준으로 사용자를 찾는다.
4. 사용자가 존재하고 비밀번호가 일치하면 `authenticated: true`와 사용자 정보를 반환한다.
5. 사용자가 없거나 비밀번호가 틀리면 `authenticated: false`와 `reason`을 반환한다.

### `GET /users`

- 현재 메모리 사용자 목록 조회

### `POST /users`

- 테스트용 사용자 추가

### `DELETE /users/:email`

- 테스트용 사용자 삭제

---

## 테스트 시나리오

특수 비밀번호를 사용해 Authori의 외부 인증 처리 분기를 강제로 검증할 수 있어야 한다.

| 비밀번호 | 예제 서버 동작 | Authori 기대 반응 |
|---|---|---|
| 정상 비밀번호 | `{ authenticated: true, user: {...} }` | 로그인 성공 |
| 잘못된 비밀번호 | `{ authenticated: false, reason: "invalid_password" }` | 로컬 폴백 없이 거부 |
| `simulate:server_error` | HTTP 500 반환 | `server_error` 감지 → 로컬 폴백 시도 |
| `simulate:timeout` | 10초 지연 후 응답 | 5초 타임아웃 감지 → 로컬 폴백 시도 |

### 시뮬레이션 규칙

- `simulate:server_error`
  - 즉시 `500 Internal Server Error` 반환
- `simulate:timeout`
  - 10초 지연 후 응답하거나 지연 중 연결 유지
  - Authori의 외부 호출 타임아웃(5초) 검증 용도

---

## 환경변수

`.env.example`은 아래 값을 제공해야 한다.

```dotenv
PORT=3002
CREDENTIAL_HEADER=X-Provider-Secret
CREDENTIAL_VALUE=my-secret-token
USERS_JSON=[{"email":"alice@example.com","password":"alice123","name":"Alice Kim","profile":{"department":"engineering"}}]
```

### 설명

| 변수 | 설명 |
|---|---|
| `PORT` | 예제 서버 실행 포트 |
| `CREDENTIAL_HEADER` | Authori가 함께 보내야 하는 요청 헤더 이름 |
| `CREDENTIAL_VALUE` | 헤더에 기대하는 값 |
| `USERS_JSON` | 기본 사용자 목록을 JSON 배열로 오버라이드 |

---

## 기본 사용자

환경변수 오버라이드가 없을 때 아래 사용자를 기본값으로 제공한다.

| email | password | name | profile |
|---|---|---|---|
| `alice@example.com` | `alice123` | `Alice Kim` | `{ department: "engineering" }` |
| `bob@example.com` | `bob123` | `Bob Lee` | `{ department: "sales" }` |

### 반환 필드 규칙

- `email`: 요청 이메일과 동일
- `name`: 사용자 표시 이름
- `loginId`: 기본적으로 이메일과 동일하게 반환 가능
- `profile`: Authori의 JIT Provisioning / profile sync 테스트에 사용할 임의 프로필 객체

---

## 구현 메모

### 인증 헤더 검증

- `CREDENTIAL_HEADER`와 `CREDENTIAL_VALUE`가 모두 설정된 경우에만 검증한다.
- 헤더가 없거나 값이 다르면 `401 Unauthorized` 또는 `403 Forbidden`으로 거부할 수 있다.
- Swagger에서도 동일한 헤더를 입력해 수동 테스트할 수 있어야 한다.

### 메모리 기반 저장소

- 예제 서버는 DB를 사용하지 않는다.
- 프로세스 재시작 시 사용자 목록은 초기화된다.
- 데모/테스트 목적이므로 단순 배열 기반 구현으로 충분하다.

### 문서/운영 편의성

- Swagger 문서 제목은 `External Auth Provider (Example)`
- 설명은 `Authori 외부 인증 프로바이더 연동 테스트용 Mock 서버`
- 로컬 실행 시 `http://localhost:3002/docs`를 바로 확인할 수 있어야 한다.

---

## 검증 포인트

1. Authori의 외부 프로바이더 설정에서 `providerUrl`을 `http://localhost:3002/auth`로 지정할 수 있어야 한다.
2. `credentialHeader` / `credentialValue` 설정 시 예제 서버가 동일 헤더를 검증해야 한다.
3. 정상 로그인 시 `authenticated: true`와 `user` payload shape이 Authori의 `ExternalAuthResult` 기대값과 일치해야 한다.
4. 명시적 거부와 기술적 장애(`500`, `timeout`)가 서로 다른 의미로 처리되어야 한다.
5. `simulate:server_error`, `simulate:timeout` 시나리오로 Authori의 로컬 폴백 로직을 재현할 수 있어야 한다.

---

## 연관 문서

- [design-external-auth-provider.md](./design-external-auth-provider.md) — 외부 인증 프로바이더 연동 본 설계
- [design-public-client-enhancements.md](./design-public-client-enhancements.md) — PUBLIC 클라이언트 인증 개선 인덱스
