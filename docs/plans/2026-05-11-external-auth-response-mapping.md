# 외부 인증 응답 전체 경로 매핑 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 외부 인증 응답이 `user.profile` 없이 root와 `user` 객체에 업무 필드를 직접 내려줘도 Authori profile로 매핑할 수 있게 한다.

**Architecture:** 기존 `fieldMapping` 저장 구조는 유지하고, `ExternalAuthService.applyFieldMapping()`의 입력을 전체 `ExternalAuthResult`로 확장한다. 기존 `profile` 내부 키 매핑은 호환하고, 새 매핑은 점 경로(`user.employeeNo`, `tenantCode`)로 전체 응답에서 값을 읽는다.

**Tech Stack:** NestJS, TypeScript, Jest

---

## 현재 한계

현재 `applyFieldMapping()`은 `result.user`만 입력으로 받고, `fieldMapping.profile`도 `externalUser.profile` 내부에서만 값을 찾는다. 아래 응답처럼 `user.employeeNo` 또는 root의 `tenantCode`에 값이 있는 경우 profile로 매핑할 수 없다.

```json
{
  "authenticated": true,
  "tenantCode": "demo",
  "user": {
    "loginId": "doctor001",
    "employeeNo": "12345",
    "departmentName": "내과",
    "email": "doctor001@example.com"
  }
}
```

## 목표 동작

관리자는 기존 `fieldMapping`에 아래처럼 작성할 수 있다.

```json
{
  "loginId": "user.loginId",
  "profile": {
    "tenantCode": "tenantCode",
    "user.hospitalCode": "hospitalCode",
    "user.employeeNo": "employeeNo",
    "user.departmentCode": "departmentCode",
    "user.departmentName": "departmentName",
    "user.positionName": "positionName",
    "user.mobilePhoneNumber": "mobilePhoneNumber"
  }
}
```

결과:

```json
{
  "loginId": "doctor001",
  "profile": {
    "tenantCode": "demo",
    "hospitalCode": "EZCT1000",
    "employeeNo": "12345",
    "departmentCode": "IM",
    "departmentName": "내과",
    "positionName": "책임",
    "mobilePhoneNumber": "010-5678-1234"
  }
}
```

## 파일 구조

| 파일 | 책임 |
|---|---|
| `backend/src/external-auth/external-auth.service.spec.ts` | 전체 응답 경로 매핑과 기존 profile 매핑 호환 테스트 |
| `backend/src/external-auth/external-auth.service.ts` | `applyFieldMapping()`이 전체 응답 경로를 읽도록 확장 |
| `backend/src/oauth/authorize/authorize.service.ts` | JIT/sync 경로에서 전체 `result`를 매핑 함수에 전달 |
| `docs/guide/authori-integration-guide.md` | root/user 경로 응답 매핑 예시 추가 |

---

## Task 1: 응답 매핑 테스트 추가

**Files:**
- Modify: `backend/src/external-auth/external-auth.service.spec.ts`

- [ ] **Step 1: 전체 응답 경로 테스트를 추가한다**

`backend/src/external-auth/external-auth.service.spec.ts`에 `ExternalAuthService response field mapping` describe 블록을 추가한다.

```typescript
describe('ExternalAuthService response field mapping', () => {
  const repo = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    softDelete: jest.fn(),
  };

  it('maps loginId and profile fields from root and user response paths', () => {
    const service = new ExternalAuthService(repo as never);

    const mapped = service.applyFieldMapping(
      {
        authenticated: true,
        tenantCode: 'demo',
        hospitalCode: 'demo',
        solutionCode: 'mobile-emr',
        user: {
          id: 'doctor001',
          loginId: 'doctor001',
          loginIdType: 'EMPLOYEE_ID',
          name: '홍길동',
          hospitalCode: 'EZCT1000',
          employeeNo: '12345',
          departmentCode: 'IM',
          departmentName: '내과',
          pathName: '진료부문 > 내과',
          positionCode: 'P01',
          positionName: '책임',
          dutyCode: 'D01',
          dutyName: '진료',
          mainWork: 'EMR 연동',
          telePhoneNumber: '02-1234-5678',
          mobilePhoneNumber: '010-5678-1234',
          email: 'doctor001@example.com',
        },
      },
      {
        loginId: 'user.loginId',
        profile: {
          tenantCode: 'tenantCode',
          solutionCode: 'solutionCode',
          'user.hospitalCode': 'hospitalCode',
          'user.employeeNo': 'employeeNo',
          'user.departmentCode': 'departmentCode',
          'user.departmentName': 'departmentName',
          'user.pathName': 'pathName',
          'user.positionName': 'positionName',
          'user.dutyName': 'dutyName',
          'user.mainWork': 'mainWork',
          'user.telePhoneNumber': 'telePhoneNumber',
          'user.mobilePhoneNumber': 'mobilePhoneNumber',
        },
      },
    );

    expect(mapped).toEqual({
      loginId: 'doctor001',
      profile: {
        tenantCode: 'demo',
        solutionCode: 'mobile-emr',
        hospitalCode: 'EZCT1000',
        employeeNo: '12345',
        departmentCode: 'IM',
        departmentName: '내과',
        pathName: '진료부문 > 내과',
        positionName: '책임',
        dutyName: '진료',
        mainWork: 'EMR 연동',
        telePhoneNumber: '02-1234-5678',
        mobilePhoneNumber: '010-5678-1234',
      },
    });
  });

  it('keeps existing user.profile mapping behavior for unqualified profile keys', () => {
    const service = new ExternalAuthService(repo as never);

    const mapped = service.applyFieldMapping(
      {
        authenticated: true,
        user: {
          email: 'doctor001@example.com',
          loginId: 'doctor001',
          profile: {
            dept: 'IM',
            empNo: '12345',
          },
        },
      },
      {
        profile: {
          dept: 'departmentCode',
          empNo: 'employeeNo',
        },
      },
    );

    expect(mapped).toEqual({
      loginId: 'doctor001',
      profile: {
        departmentCode: 'IM',
        employeeNo: '12345',
      },
    });
  });
});
```

- [ ] **Step 2: RED 테스트를 확인한다**

Run:

```bash
cd backend
bun run test -- external-auth.service.spec.ts
```

Expected: 전체 응답 경로 테스트가 실패한다.

---

## Task 2: 전체 응답 경로 매핑 구현

**Files:**
- Modify: `backend/src/external-auth/external-auth.service.ts`
- Modify: `backend/src/oauth/authorize/authorize.service.ts`

- [ ] **Step 1: `ExternalAuthResult.user` 타입을 느슨하게 확장한다**

`backend/src/external-auth/external-auth.service.ts`의 `ExternalAuthResult.user` 타입을 아래처럼 바꾼다.

```typescript
  user?: {
    email: string;
    loginId?: string;
    profile?: Record<string, unknown>;
  } & Record<string, unknown>;
```

- [ ] **Step 2: `applyFieldMapping()`을 전체 응답 기준으로 확장한다**

`applyFieldMapping()` 시그니처를 전체 응답 또는 기존 user 입력을 모두 받을 수 있게 바꾼다.

```typescript
  applyFieldMapping(
    externalAuth: ExternalAuthResult | NonNullable<ExternalAuthResult['user']>,
    mapping: ExternalAuthProvider['fieldMapping'],
  ): { loginId?: string; profile: Record<string, unknown> } {
```

내부 구현은 다음 규칙을 사용한다.

- `externalAuth`에 `authenticated` 또는 `user` 필드가 있으면 전체 응답으로 본다.
- 아니면 기존처럼 user 객체로 본다.
- `mapping.loginId`가 점 경로면 전체 응답에서 읽는다.
- `mapping.profile`의 source key가 기존 단순 키이고 `user.profile[sourceKey]`가 있으면 기존 방식으로 읽는다.
- 그 외에는 source key를 전체 응답 경로로 읽는다.

- [ ] **Step 3: 호출부가 전체 result를 전달하게 변경한다**

`backend/src/oauth/authorize/authorize.service.ts`의 두 호출부를 변경한다.

```typescript
const mapped = this.externalAuthService.applyFieldMapping(
  result,
  provider.fieldMapping,
);
```

`jitProvisionUser()`의 인자는 전체 `ExternalAuthResult` 대신 `result.user`를 받는 구조를 유지하되, JIT 호출 전에 매핑을 계산해 넘기거나 `jitProvisionUser()`가 `result` 전체를 받도록 바꾼다. 더 작은 변경은 `jitProvisionUser()`가 전체 `result`를 받는 방식이다.

- [ ] **Step 4: GREEN 테스트를 확인한다**

Run:

```bash
cd backend
bun run test -- external-auth.service.spec.ts
```

Expected: `PASS src/external-auth/external-auth.service.spec.ts`

---

## Task 3: 문서 갱신과 전체 검증

**Files:**
- Modify: `docs/guide/authori-integration-guide.md`

- [ ] **Step 1: 통합 가이드에 응답 매핑 예시를 추가한다**

`docs/guide/authori-integration-guide.md`의 외부 인증 섹션에 전체 응답 경로 매핑 예시를 추가한다.

````markdown
### 외부 인증 응답 매핑

외부 인증 응답이 `user.profile`을 쓰지 않고 root 또는 `user` 객체에 업무 필드를 직접 포함하는 경우, `fieldMapping.profile`의 source key에 전체 응답 경로를 지정한다.

```json
{
  "loginId": "user.loginId",
  "profile": {
    "tenantCode": "tenantCode",
    "user.hospitalCode": "hospitalCode",
    "user.employeeNo": "employeeNo",
    "user.departmentCode": "departmentCode",
    "user.departmentName": "departmentName"
  }
}
```

기존 `user.profile` 기반 매핑도 계속 지원한다.
````

- [ ] **Step 2: 검증을 실행한다**

Run:

```bash
cd backend
bun run test -- external-auth.service.spec.ts
bun run build
cd ..
graphify update .
```

Expected:

```text
PASS src/external-auth/external-auth.service.spec.ts
Found 0 errors.
```

## 완료 기준

- [ ] `fieldMapping.loginId: "user.loginId"`가 동작한다.
- [ ] `fieldMapping.profile` source key가 `tenantCode` 같은 root 경로를 읽는다.
- [ ] `fieldMapping.profile` source key가 `user.employeeNo` 같은 user 경로를 읽는다.
- [ ] 기존 `user.profile` 단순 키 매핑은 유지된다.
- [ ] JIT 생성과 syncOnLogin 모두 전체 응답 경로 매핑을 사용한다.
- [ ] backend test/build가 통과한다.
- [ ] 코드 변경 후 `graphify update .`가 실행된다.
