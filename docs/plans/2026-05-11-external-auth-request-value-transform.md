# 외부 인증 요청 파라미터 값 변환 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 외부 인증 호출 시 email, password 등 credential 값을 전송 전에 변환(transform)할 수 있게 한다. 예: `email`에서 `@` 앞 부분만 추출하거나, `password`를 base64 인코딩하여 전송.

**Architecture:** 기존 `ExternalAuthRequestMapping` JSONB 컬럼을 그대로 활용하고, `transforms` 서브 필드를 추가하여 소스별 변환 파이프라인을 정의한다. DB 마이그레이션 불필요. `ExternalAuthService`에 `applyValueTransforms()` 메서드를 추가하고, `buildProviderRequestBody()`에서 각 값을 세팅하기 전에 변환을 적용한다.

**Tech Stack:** NestJS, TypeScript, Node.js crypto, Jest, Vue 3

---

## 현재 상태

- `ExternalAuthRequestMapping`은 필드명 매핑만 담당한다(`email`, `password`, `tenantId`, `clientId`, `staticParams`).
- `buildProviderRequestBody()`는 각 값을 변환 없이 매핑된 경로에 그대로 세팅한다.
- `2026-05-11-external-auth-request-parameter-mapping.md` 계획에서 "request body value transform은 이번 범위에서 제외"로 명시했다. 이 계획이 해당 후속 구현이다.

## 지원 변환 목록

| 변환 식별자 | 형태 | 설명 | 입력 예 → 출력 예 |
|---|---|---|---|
| `base64` | 문자열 | Base64 인코딩 | `"1234"` → `"MTIzNA=="` |
| `base64url` | 문자열 | URL-safe Base64 인코딩 (padding 제거) | `"a+b/c"` → `"YStiL2M"` |
| `md5` | 문자열 | MD5 해시(hex) — 레거시 시스템 호환 | `"pass"` → `"1a1dc91c..."` |
| `sha256` | 문자열 | SHA-256 해시(hex) | `"pass"` → `"d74ff0ee..."` |
| `uppercase` | 문자열 | 대문자 변환 | `"hello"` → `"HELLO"` |
| `lowercase` | 문자열 | 소문자 변환 | `"HELLO"` → `"hello"` |
| `trim` | 문자열 | 앞뒤 공백 제거 | `" hi "` → `"hi"` |
| `email_prefix` | 문자열 | `@` 앞 부분(local-part) 추출 | `"test1@ezcaretech.com"` → `"test1"` |
| `email_domain` | 문자열 | `@` 뒷 부분(domain) 추출 | `"test1@ezcaretech.com"` → `"ezcaretech.com"` |
| `{ type: 'prefix', value }` | 객체 | 앞에 고정 문자열 추가 | `"id"` → `"user_id"` |
| `{ type: 'suffix', value }` | 객체 | 뒤에 고정 문자열 추가 | `"id"` → `"id@co.kr"` |
| `{ type: 'template', pattern }` | 객체 | `{value}` 자리에 값 삽입 | `"Bearer {value}"` → `"Bearer token"` |
| `{ type: 'regex_extract', pattern, group? }` | 객체 | 정규식 캡처 그룹 추출. group 기본값 1 | `"([^@]+)@"` → email 앞 부분 |
| `{ type: 'substring', start, end? }` | 객체 | 부분 문자열 | start=0, end=8 |

변환은 배열로 선언하며 순서대로 파이프라인으로 적용된다.

## 목표 동작

### 예시 1 — email에서 loginId 추출

```json
{
  "email": "loginId",
  "password": "passwd",
  "transforms": {
    "email": ["email_prefix"]
  }
}
```

입력 `email = "test1@ezcaretech.com"` → 변환 후 `"test1"` → 필드명 `loginId`로 전송:

```json
{
  "loginId": "test1",
  "passwd": "plain_password"
}
```

### 예시 2 — password base64 인코딩

```json
{
  "transforms": {
    "password": ["base64"]
  }
}
```

입력 `password = "1234"` → 변환 후 `"MTIzNA=="` → 필드명 `password`로 전송:

```json
{
  "email": "test1@ezcaretech.com",
  "password": "MTIzNA=="
}
```

### 예시 3 — 변환 파이프라인 조합

```json
{
  "transforms": {
    "email": ["email_prefix", "uppercase"],
    "password": ["trim", "md5"]
  }
}
```

`"test1@ezcaretech.com"` → `"test1"` → `"TEST1"` / `" 1234 "` → `"1234"` → MD5 해시

### 예시 4 — 파라미터화된 변환

```json
{
  "transforms": {
    "password": [{ "type": "prefix", "value": "ENC:" }, "base64"]
  }
}
```

`"1234"` → `"ENC:1234"` → `"RU5DOjEyMzQ="`

---

## 데이터 모델 확장

`ExternalAuthRequestMapping`에 `transforms` 필드를 추가한다. 기존 JSONB 컬럼의 스키마를 확장하는 것이므로 DB 마이그레이션이 필요 없다.

```typescript
export type SimpleTransform =
  | 'base64'
  | 'base64url'
  | 'md5'
  | 'sha256'
  | 'uppercase'
  | 'lowercase'
  | 'trim'
  | 'email_prefix'
  | 'email_domain';

export type ParameterizedTransform =
  | { type: 'prefix'; value: string }
  | { type: 'suffix'; value: string }
  | { type: 'template'; pattern: string }
  | { type: 'regex_extract'; pattern: string; group?: number }
  | { type: 'substring'; start: number; end?: number };

export type TransformSpec = SimpleTransform | ParameterizedTransform;

export interface ExternalAuthRequestMapping {
  email?: string;
  password?: string;
  tenantId?: string;
  clientId?: string;
  staticParams?: Record<string, string>;
  /** 각 소스 값에 적용할 변환 파이프라인. 배열 순서대로 적용됨 */
  transforms?: {
    email?: TransformSpec[];
    password?: TransformSpec[];
    tenantId?: TransformSpec[];
    clientId?: TransformSpec[];
  };
}
```

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `backend/src/database/entities/external-auth-provider.entity.ts` | `SimpleTransform`, `ParameterizedTransform`, `TransformSpec` 타입 추가. `ExternalAuthRequestMapping.transforms` 필드 추가 |
| `backend/src/database/entities/index.ts` | 새 타입 export 추가 |
| `backend/src/external-auth/dto/create-provider.dto.ts` | 변환 DTO 클래스 추가, `RequestMappingDto.transforms` 검증 |
| `backend/src/external-auth/external-auth.service.ts` | `applyValueTransforms()` 퍼블릭 메서드 추가, `buildProviderRequestBody()` 확장 |
| `backend/src/external-auth/external-auth.service.spec.ts` | 값 변환 단위 테스트 추가 |
| `frontend/src/api/external-auth.ts` | `TransformSpec` 타입 추가, `RequestMapping.transforms` 필드 추가 |
| `frontend/src/views/tenant/external-auth/ExternalAuthFormView.vue` | email/password 변환 선택 UI 추가 |
| `docs/guide/authori-integration-guide.md` | 값 변환 사용 예시 추가 |

---

## Task 1: 타입 확장과 DTO 추가

**Files:**
- Modify: `backend/src/database/entities/external-auth-provider.entity.ts`
- Modify: `backend/src/database/entities/index.ts`
- Modify: `backend/src/external-auth/dto/create-provider.dto.ts`

- [ ] **Step 1: 엔티티 파일에 transform 타입을 추가한다**

`backend/src/database/entities/external-auth-provider.entity.ts`의 `ExternalAuthRequestMapping` 위에 추가한다.

```typescript
export type SimpleTransform =
  | 'base64'
  | 'base64url'
  | 'md5'
  | 'sha256'
  | 'uppercase'
  | 'lowercase'
  | 'trim'
  | 'email_prefix'
  | 'email_domain';

export type ParameterizedTransform =
  | { type: 'prefix'; value: string }
  | { type: 'suffix'; value: string }
  | { type: 'template'; pattern: string }
  | { type: 'regex_extract'; pattern: string; group?: number }
  | { type: 'substring'; start: number; end?: number };

export type TransformSpec = SimpleTransform | ParameterizedTransform;
```

`ExternalAuthRequestMapping` 인터페이스에 `transforms` 필드를 추가한다.

```typescript
  /** 각 소스 값에 적용할 변환 파이프라인. 배열 순서대로 적용됨 */
  transforms?: {
    email?: TransformSpec[];
    password?: TransformSpec[];
    tenantId?: TransformSpec[];
    clientId?: TransformSpec[];
  };
```

- [ ] **Step 2: index.ts에 새 타입을 export한다**

`backend/src/database/entities/index.ts`의 external-auth-provider export를 아래처럼 확장한다.

```typescript
export { ExternalAuthProvider } from './external-auth-provider.entity';
export type {
  ExternalAuthFieldMapping,
  ExternalAuthRequestMapping,
  SimpleTransform,
  ParameterizedTransform,
  TransformSpec,
} from './external-auth-provider.entity';
```

- [ ] **Step 3: DTO에 변환 검증 클래스를 추가한다**

`backend/src/external-auth/dto/create-provider.dto.ts`에서 `RequestMappingDto` 안에 `transforms` 필드를 추가한다.

```typescript
export class ParameterizedTransformDto {
  @ApiProperty({
    enum: ['prefix', 'suffix', 'template', 'regex_extract', 'substring'],
  })
  @IsString()
  type: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  value?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pattern?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  group?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  start?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  end?: number;
}
```

`RequestMappingDto`에 추가한다.

```typescript
  @ApiPropertyOptional({
    description: '각 소스 값에 적용할 변환 파이프라인',
    example: { email: ['email_prefix'], password: ['base64'] },
  })
  @IsOptional()
  @IsObject()
  transforms?: {
    email?: Array<string | ParameterizedTransformDto>;
    password?: Array<string | ParameterizedTransformDto>;
    tenantId?: Array<string | ParameterizedTransformDto>;
    clientId?: Array<string | ParameterizedTransformDto>;
  };
```

- [ ] **Step 4: 타입 체크를 실행한다**

Run:

```bash
cd backend
bun run build
```

Expected: `Found 0 errors.`

---

## Task 2: 서비스 구현 (TDD)

**Files:**
- Modify: `backend/src/external-auth/external-auth.service.spec.ts`
- Modify: `backend/src/external-auth/external-auth.service.ts`

- [ ] **Step 1: 단순 변환 테스트를 추가한다 (RED)**

`backend/src/external-auth/external-auth.service.spec.ts`에 아래 describe 블록을 추가한다.

```typescript
describe('ExternalAuthService applyValueTransforms', () => {
  const repo = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    softDelete: jest.fn(),
  };

  it('returns original value when transforms is empty', () => {
    const service = new ExternalAuthService(repo as never);
    expect(service.applyValueTransforms('hello', [])).toBe('hello');
  });

  it('applies base64 encoding', () => {
    const service = new ExternalAuthService(repo as never);
    expect(service.applyValueTransforms('1234', ['base64'])).toBe('MTIzNA==');
  });

  it('applies base64url encoding without padding', () => {
    const service = new ExternalAuthService(repo as never);
    const result = service.applyValueTransforms('a+b/c', ['base64url']);
    expect(result).not.toContain('+');
    expect(result).not.toContain('/');
    expect(result).not.toContain('=');
  });

  it('applies email_prefix to extract local part', () => {
    const service = new ExternalAuthService(repo as never);
    expect(service.applyValueTransforms('test1@ezcaretech.com', ['email_prefix'])).toBe('test1');
  });

  it('returns original value when email has no @ for email_prefix', () => {
    const service = new ExternalAuthService(repo as never);
    expect(service.applyValueTransforms('noemail', ['email_prefix'])).toBe('noemail');
  });

  it('applies email_domain to extract domain part', () => {
    const service = new ExternalAuthService(repo as never);
    expect(service.applyValueTransforms('test1@ezcaretech.com', ['email_domain'])).toBe('ezcaretech.com');
  });

  it('applies md5 hash', () => {
    const service = new ExternalAuthService(repo as never);
    expect(service.applyValueTransforms('pass', ['md5'])).toBe('1a1dc91c907325c69271ddf0c944bc72');
  });

  it('applies sha256 hash', () => {
    const service = new ExternalAuthService(repo as never);
    expect(service.applyValueTransforms('pass', ['sha256'])).toHaveLength(64);
  });

  it('applies uppercase', () => {
    const service = new ExternalAuthService(repo as never);
    expect(service.applyValueTransforms('hello', ['uppercase'])).toBe('HELLO');
  });

  it('applies lowercase', () => {
    const service = new ExternalAuthService(repo as never);
    expect(service.applyValueTransforms('HELLO', ['lowercase'])).toBe('hello');
  });

  it('applies trim', () => {
    const service = new ExternalAuthService(repo as never);
    expect(service.applyValueTransforms('  hi  ', ['trim'])).toBe('hi');
  });

  it('applies pipeline in order', () => {
    const service = new ExternalAuthService(repo as never);
    // email_prefix → uppercase
    expect(service.applyValueTransforms('test1@example.com', ['email_prefix', 'uppercase'])).toBe('TEST1');
  });

  it('applies parameterized prefix transform', () => {
    const service = new ExternalAuthService(repo as never);
    expect(service.applyValueTransforms('1234', [{ type: 'prefix', value: 'ENC:' }])).toBe('ENC:1234');
  });

  it('applies parameterized suffix transform', () => {
    const service = new ExternalAuthService(repo as never);
    expect(service.applyValueTransforms('user', [{ type: 'suffix', value: '@corp.com' }])).toBe('user@corp.com');
  });

  it('applies template transform with {value} placeholder', () => {
    const service = new ExternalAuthService(repo as never);
    expect(service.applyValueTransforms('tok123', [{ type: 'template', pattern: 'Bearer {value}' }])).toBe('Bearer tok123');
  });

  it('applies regex_extract transform', () => {
    const service = new ExternalAuthService(repo as never);
    expect(service.applyValueTransforms('test1@ezcaretech.com', [
      { type: 'regex_extract', pattern: '([^@]+)@', group: 1 },
    ])).toBe('test1');
  });

  it('returns original value when regex_extract has no match', () => {
    const service = new ExternalAuthService(repo as never);
    expect(service.applyValueTransforms('noemail', [
      { type: 'regex_extract', pattern: '([^@]+)@', group: 1 },
    ])).toBe('noemail');
  });

  it('applies substring transform', () => {
    const service = new ExternalAuthService(repo as never);
    expect(service.applyValueTransforms('abcdefgh', [{ type: 'substring', start: 0, end: 4 }])).toBe('abcd');
  });

  it('applies transforms from pipeline: prefix then base64', () => {
    const service = new ExternalAuthService(repo as never);
    const result = service.applyValueTransforms('1234', [{ type: 'prefix', value: 'ENC:' }, 'base64']);
    expect(result).toBe(Buffer.from('ENC:1234').toString('base64'));
  });
});
```

- [ ] **Step 2: RED 확인**

Run:

```bash
cd backend
bun run test -- external-auth.service.spec.ts
```

Expected: `applyValueTransforms` 관련 테스트들이 실패한다.

- [ ] **Step 3: `applyValueTransforms()`를 구현한다**

`backend/src/external-auth/external-auth.service.ts` 상단에 crypto import를 추가한다.

```typescript
import { createHash } from 'crypto';
```

`buildProviderRequestBody()` 메서드 위에 `applyValueTransforms()` 메서드를 추가한다.

```typescript
  applyValueTransforms(value: string, transforms: import('../database/entities').TransformSpec[]): string {
    return transforms.reduce((current, transform) => {
      if (typeof transform === 'string') {
        switch (transform) {
          case 'base64':
            return Buffer.from(current).toString('base64');
          case 'base64url':
            return Buffer.from(current).toString('base64url');
          case 'md5':
            return createHash('md5').update(current).digest('hex');
          case 'sha256':
            return createHash('sha256').update(current).digest('hex');
          case 'uppercase':
            return current.toUpperCase();
          case 'lowercase':
            return current.toLowerCase();
          case 'trim':
            return current.trim();
          case 'email_prefix': {
            const atIdx = current.indexOf('@');
            return atIdx >= 0 ? current.slice(0, atIdx) : current;
          }
          case 'email_domain': {
            const atIdx = current.indexOf('@');
            return atIdx >= 0 ? current.slice(atIdx + 1) : current;
          }
          default:
            return current;
        }
      }
      switch (transform.type) {
        case 'prefix':
          return `${transform.value}${current}`;
        case 'suffix':
          return `${current}${transform.value}`;
        case 'template':
          return transform.pattern.replace('{value}', current);
        case 'regex_extract': {
          const match = new RegExp(transform.pattern).exec(current);
          return match?.[transform.group ?? 1] ?? current;
        }
        case 'substring':
          return current.slice(transform.start, transform.end);
        default:
          return current;
      }
    }, value);
  }
```

- [ ] **Step 4: `buildProviderRequestBody()`에서 변환을 적용한다**

기존 `buildProviderRequestBody()` 내부에서 `setPath()` 호출 전에 각 값에 transform을 적용한다. 현재 코드:

```typescript
    setPath(mapping.clientId, clientId);
    setPath(mapping.tenantId, tenantId);
    setPath(mapping.password ?? 'password', password);
    setPath(mapping.email ?? 'email', email);
```

변경:

```typescript
    const t = mapping.transforms ?? {};
    const transformedEmail = t.email?.length ? this.applyValueTransforms(email, t.email) : email;
    const transformedPassword = t.password?.length ? this.applyValueTransforms(password, t.password) : password;
    const transformedTenantId = t.tenantId?.length ? this.applyValueTransforms(tenantId, t.tenantId) : tenantId;
    const transformedClientId = t.clientId?.length ? this.applyValueTransforms(clientId, t.clientId) : clientId;

    setPath(mapping.clientId, transformedClientId);
    setPath(mapping.tenantId, transformedTenantId);
    setPath(mapping.password ?? 'password', transformedPassword);
    setPath(mapping.email ?? 'email', transformedEmail);
```

- [ ] **Step 5: request body 빌더 통합 테스트를 추가한다**

`describe('ExternalAuthService request body mapping')` 블록에 변환 통합 테스트를 추가한다.

```typescript
  it('applies email_prefix transform before mapping field', () => {
    const service = new ExternalAuthService(repo as never);

    expect(service.buildProviderRequestBody(
      {
        email: 'loginId',
        transforms: { email: ['email_prefix'] },
      },
      'test1@ezcaretech.com',
      'secret',
      'tenant-1',
      'client-1',
    )).toEqual({
      loginId: 'test1',
      password: 'secret',
    });
  });

  it('applies base64 transform to password', () => {
    const service = new ExternalAuthService(repo as never);

    expect(service.buildProviderRequestBody(
      {
        transforms: { password: ['base64'] },
      },
      'user@example.com',
      '1234',
      'tenant-1',
      'client-1',
    )).toEqual({
      email: 'user@example.com',
      password: 'MTIzNA==',
    });
  });

  it('applies pipeline: email_prefix then uppercase, and base64 to password', () => {
    const service = new ExternalAuthService(repo as never);

    const result = service.buildProviderRequestBody(
      {
        email: 'loginId',
        password: 'passwd',
        transforms: {
          email: ['email_prefix', 'uppercase'],
          password: ['trim', 'base64'],
        },
      },
      'test1@ezcaretech.com',
      ' 1234 ',
      'tenant-1',
      'client-1',
    );

    expect(result).toEqual({
      loginId: 'TEST1',
      passwd: Buffer.from('1234').toString('base64'),
    });
  });

  it('does not transform when transforms field is absent', () => {
    const service = new ExternalAuthService(repo as never);

    expect(service.buildProviderRequestBody(
      { email: 'loginId' },
      'test1@ezcaretech.com',
      'secret',
      'tenant-1',
      'client-1',
    )).toEqual({
      loginId: 'test1@ezcaretech.com',
      password: 'secret',
    });
  });
```

- [ ] **Step 6: GREEN 확인**

Run:

```bash
cd backend
bun run test -- external-auth.service.spec.ts
bun run build
```

Expected:

```text
PASS src/external-auth/external-auth.service.spec.ts
Found 0 errors.
```

---

## Task 3: Frontend 타입과 UI

**Files:**
- Modify: `frontend/src/api/external-auth.ts`
- Modify: `frontend/src/views/tenant/external-auth/ExternalAuthFormView.vue`

- [ ] **Step 1: API 타입에 TransformSpec을 추가한다**

`frontend/src/api/external-auth.ts`에 `RequestMapping` 타입 위에 추가한다.

```typescript
export type SimpleTransform =
  | 'base64'
  | 'base64url'
  | 'md5'
  | 'sha256'
  | 'uppercase'
  | 'lowercase'
  | 'trim'
  | 'email_prefix'
  | 'email_domain'

export type ParameterizedTransform =
  | { type: 'prefix'; value: string }
  | { type: 'suffix'; value: string }
  | { type: 'template'; pattern: string }
  | { type: 'regex_extract'; pattern: string; group?: number }
  | { type: 'substring'; start: number; end?: number }

export type TransformSpec = SimpleTransform | ParameterizedTransform
```

`RequestMapping`에 `transforms` 필드를 추가한다.

```typescript
export interface RequestMapping {
  email?: string
  password?: string
  tenantId?: string
  clientId?: string
  staticParams?: Record<string, string>
  transforms?: {
    email?: TransformSpec[]
    password?: TransformSpec[]
    tenantId?: TransformSpec[]
    clientId?: TransformSpec[]
  }
}
```

- [ ] **Step 2: 폼 상태를 추가한다**

`ExternalAuthFormView.vue`의 `requestClientId` ref 선언 아래에 추가한다.

```typescript
const emailTransforms = ref<string[]>([])
const passwordTransforms = ref<string[]>([])
```

단순 변환 목록 상수를 추가한다.

```typescript
const SIMPLE_TRANSFORMS = [
  { value: 'email_prefix', label: '이메일 앞 부분 (@앞)' },
  { value: 'email_domain', label: '이메일 도메인 (@뒤)' },
  { value: 'base64', label: 'Base64 인코딩' },
  { value: 'base64url', label: 'Base64URL 인코딩' },
  { value: 'md5', label: 'MD5 해시 (레거시)' },
  { value: 'sha256', label: 'SHA-256 해시' },
  { value: 'uppercase', label: '대문자 변환' },
  { value: 'lowercase', label: '소문자 변환' },
  { value: 'trim', label: '공백 제거' },
] as const
```

- [ ] **Step 3: payload 빌더에 transforms를 반영한다**

`buildPayload()`의 `requestMapping` 객체 생성 후에 추가한다.

```typescript
  const transforms: RequestMapping['transforms'] = {}
  if (emailTransforms.value.length > 0) transforms.email = emailTransforms.value as SimpleTransform[]
  if (passwordTransforms.value.length > 0) transforms.password = passwordTransforms.value as SimpleTransform[]
  if (Object.keys(transforms).length > 0) requestMapping.transforms = transforms
```

- [ ] **Step 4: edit fill 로직에 transforms를 추가한다**

`fillForm()`의 requestMapping 처리 안에 추가한다.

```typescript
    const simpleKeys = new Set(SIMPLE_TRANSFORMS.map(t => t.value))
    if (data.requestMapping.transforms?.email) {
      emailTransforms.value = data.requestMapping.transforms.email.filter(
        (t): t is string => typeof t === 'string' && simpleKeys.has(t)
      )
    }
    if (data.requestMapping.transforms?.password) {
      passwordTransforms.value = data.requestMapping.transforms.password.filter(
        (t): t is string => typeof t === 'string' && simpleKeys.has(t)
      )
    }
```

- [ ] **Step 5: 변환 선택 UI를 추가한다**

호출 파라미터 매핑 카드 안, 이메일/비밀번호 입력 바로 아래에 추가한다.

```vue
        <div class="border-t border-gray-100 pt-3">
          <div class="text-xs text-gray-500 mb-2 font-medium">값 변환 <span class="text-gray-400 font-normal">(선택, 순서대로 적용)</span></div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs text-gray-500 mb-1">이메일 변환</label>
              <div class="space-y-1">
                <div v-for="(_, i) in emailTransforms" :key="i" class="flex gap-1 items-center">
                  <select v-model="emailTransforms[i]" class="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">선택</option>
                    <option v-for="t in SIMPLE_TRANSFORMS" :key="t.value" :value="t.value">{{ t.label }}</option>
                  </select>
                  <button type="button" class="text-red-400 hover:text-red-600 text-xs px-1" @click="emailTransforms.splice(i, 1)">✕</button>
                </div>
                <button type="button" class="text-xs text-indigo-600 hover:text-indigo-800" @click="emailTransforms.push('')">+ 변환 추가</button>
              </div>
            </div>
            <div>
              <label class="block text-xs text-gray-500 mb-1">비밀번호 변환</label>
              <div class="space-y-1">
                <div v-for="(_, i) in passwordTransforms" :key="i" class="flex gap-1 items-center">
                  <select v-model="passwordTransforms[i]" class="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">선택</option>
                    <option v-for="t in SIMPLE_TRANSFORMS" :key="t.value" :value="t.value">{{ t.label }}</option>
                  </select>
                  <button type="button" class="text-red-400 hover:text-red-600 text-xs px-1" @click="passwordTransforms.splice(i, 1)">✕</button>
                </div>
                <button type="button" class="text-xs text-indigo-600 hover:text-indigo-800" @click="passwordTransforms.push('')">+ 변환 추가</button>
              </div>
            </div>
          </div>
          <p class="text-xs text-gray-400 mt-2">파라미터가 필요한 변환(prefix, suffix, template, regex_extract 등)은 DB 직접 설정이 필요합니다. 관리자 가이드를 참고하세요.</p>
        </div>
```

- [ ] **Step 6: 프론트 빌드 검증**

Run:

```bash
cd frontend
bun run build
```

Expected: `vue-tsc -b`와 `vite build`가 성공한다.

---

## Task 4: 문서화와 최종 검증

**Files:**
- Modify: `docs/guide/authori-integration-guide.md`

- [ ] **Step 1: 통합 가이드에 값 변환 예시를 추가한다**

`docs/guide/authori-integration-guide.md`의 "외부 인증 호출 파라미터 매핑" 섹션 아래에 추가한다.

````markdown
### 외부 인증 요청 값 변환

필드명 매핑 외에, 값 자체를 변환해서 전송할 수 있다. `requestMapping.transforms`에 소스별 변환 파이프라인을 배열로 지정하며 순서대로 적용된다.

#### 예시 1 — 이메일에서 아이디 추출

외부 서비스가 `loginId`로 `@` 앞 부분만 받는 경우:

```json
{
  "email": "loginId",
  "transforms": {
    "email": ["email_prefix"]
  }
}
```

`"test1@ezcaretech.com"` → `"test1"` → `loginId: "test1"` 으로 전송

#### 예시 2 — 비밀번호 Base64 인코딩

```json
{
  "transforms": {
    "password": ["base64"]
  }
}
```

`"1234"` → `"MTIzNA=="` → `password: "MTIzNA=="` 으로 전송

#### 예시 3 — 파이프라인 조합

```json
{
  "email": "loginId",
  "password": "passwd",
  "transforms": {
    "email": ["email_prefix", "uppercase"],
    "password": ["trim", "md5"]
  }
}
```

| 소스 | 원본 | 변환 결과 | 전송 필드 |
|---|---|---|---|
| email | `test1@ezcaretech.com` | `TEST1` | `loginId` |
| password | ` 1234 ` | MD5 해시 | `passwd` |

#### 지원 변환 목록

| 식별자 | 설명 |
|---|---|
| `email_prefix` | `@` 앞 부분(local-part) 추출 |
| `email_domain` | `@` 뒷 부분(domain) 추출 |
| `base64` | Base64 인코딩 |
| `base64url` | URL-safe Base64 인코딩 (padding 없음) |
| `md5` | MD5 해시 hex — 레거시 시스템 호환 |
| `sha256` | SHA-256 해시 hex |
| `uppercase` | 대문자 변환 |
| `lowercase` | 소문자 변환 |
| `trim` | 앞뒤 공백 제거 |

파라미터화된 변환(`prefix`, `suffix`, `template`, `regex_extract`, `substring`)은 JSON 직접 설정으로 사용한다:

```json
{
  "transforms": {
    "password": [{ "type": "prefix", "value": "ENC:" }, "base64"]
  }
}
```

`"1234"` → `"ENC:1234"` → `"RU5DOjEyMzQ="`
````

- [ ] **Step 2: 전체 검증을 실행한다**

Run:

```bash
cd backend
bun run test -- external-auth.service.spec.ts
bun run build
cd ../frontend
bun run build
```

Expected:

```text
PASS src/external-auth/external-auth.service.spec.ts
Found 0 errors.
vite build ... built
```

---

## 완료 기준

- [ ] `requestMapping.transforms` 없이도 기존 동작은 변경 없다.
- [ ] `email_prefix` 변환이 `@` 앞 부분을 추출하고 지정된 필드명으로 전송한다.
- [ ] `base64` 변환이 값을 Base64 인코딩하여 전송한다.
- [ ] 변환 파이프라인(배열)이 순서대로 적용된다.
- [ ] `md5`, `sha256`, `base64url`, `uppercase`, `lowercase`, `trim`, `email_domain` 변환이 동작한다.
- [ ] `prefix`, `suffix`, `template`, `regex_extract`, `substring` 파라미터 변환이 동작한다.
- [ ] `regex_extract`에서 매치 없으면 원본 값을 유지한다.
- [ ] Frontend에서 이메일/비밀번호 단순 변환을 드롭다운으로 선택할 수 있다.
- [ ] 수정 폼에서 저장된 transforms가 복원된다.
- [ ] backend 단위 테스트와 build가 성공한다.
- [ ] frontend build가 성공한다.

## 리스크와 제약

- **보안:** 이 기능은 관리자(Platform Admin 또는 Tenant Admin)만 설정할 수 있다. 최종 사용자는 변환 규칙을 변경할 수 없다.
- **ReDoS:** `regex_extract`에 사용자가 입력하는 패턴이 아닌 관리자 설정 패턴이므로 신뢰 경계 내에 있다. 하지만 관리자도 실수로 복잡한 패턴을 입력할 수 있으므로, 추후 Node.js의 `vm` 모듈을 활용한 타임아웃 실행이나 패턴 복잡도 제한을 고려할 수 있다.
- **평문 비밀번호:** base64, md5 등은 진정한 암호화가 아니다. 외부 서비스가 특정 인코딩 형식을 요구하는 경우에만 사용해야 하며, HTTPS 전송이 필수다.
- **파라미터 변환 UI:** `prefix`, `suffix`, `template`, `regex_extract`, `substring`은 이번 UI 범위에서는 드롭다운으로 노출하지 않는다. 해당 변환이 필요한 경우 DB 직접 수정 또는 관리자 가이드를 참고한다.
- **배열 경로의 변환:** `staticParams`의 값 변환은 이번 범위에서 제외한다.
