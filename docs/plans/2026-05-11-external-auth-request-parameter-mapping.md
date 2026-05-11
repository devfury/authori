# 외부 인증 호출 파라미터 매핑 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 외부 인증 서비스 연계 시 Authori가 외부 서비스로 보내는 request body 필드도 테넌트/클라이언트별로 매핑할 수 있게 한다.

**Architecture:** `ExternalAuthProvider`에 `request_mapping` JSONB 설정을 추가하고, `ExternalAuthService.callProvider()`가 고정 `{ email, password }` 대신 매핑 설정으로 request body를 조립한다. 관리자 API와 프론트엔드 폼은 `fieldMapping`(응답 매핑)과 별도로 `requestMapping`(호출 파라미터 매핑)을 입력하고 저장한다.

**Tech Stack:** NestJS, TypeORM, PostgreSQL JSONB, class-validator, Vue 3 Composition API, TypeScript, Vitest/Jest

---

## 현재 상태

- 외부 인증 프로바이더 설정은 `backend/src/database/entities/external-auth-provider.entity.ts`의 `fieldMapping`만 가진다.
- `fieldMapping`은 외부 응답 user 데이터에서 로컬 `loginId`, `profile`로 값을 가져오는 응답 매핑이다.
- 외부 인증 호출 본문은 `backend/src/external-auth/external-auth.service.ts`에서 `JSON.stringify({ email, password })`로 고정되어 있다.
- `docs/plans/2026-04-06-external-auth-provider-design.md`의 초기 설계에는 `tenantId`, `clientId` 전달이 언급되어 있으나 실제 구현은 `email`, `password`만 전달한다.

## 목표 동작

기본 설정이 없으면 기존 동작과 호환되도록 아래 요청을 보낸다.

```json
{
  "email": "user@example.com",
  "password": "plain_password"
}
```

관리자가 request mapping을 설정하면 외부 서비스가 요구하는 필드명으로 요청한다.

```json
{
  "login_id": "user@example.com",
  "passwd": "plain_password",
  "tenant": "tenant-uuid",
  "client": "oauth-client-id"
}
```

`tenantId`와 `clientId`는 설정한 경우에만 포함한다. 기존 외부 인증 서버와의 호환성을 위해 기본값에는 포함하지 않는다.

## 파일 구조

| 파일 | 책임 |
|---|---|
| `backend/src/database/entities/external-auth-provider.entity.ts` | `ExternalAuthRequestMapping` 타입과 `requestMapping` JSONB 컬럼 정의 |
| `backend/src/database/entities/index.ts` | 새 타입 export |
| `backend/src/database/migrations/1777300000000-AddExternalAuthRequestMapping.ts` | `external_auth_providers.request_mapping` 컬럼 추가/제거 |
| `backend/src/external-auth/dto/create-provider.dto.ts` | 관리자 API 입력 DTO에 `requestMapping` 검증 추가 |
| `backend/src/external-auth/external-auth.service.ts` | 저장/수정 반영, request body 빌더, `callProvider()` 시 `tenantId`, `clientId` 컨텍스트 사용 |
| `backend/src/oauth/authorize/authorize.service.ts` | `callProvider()` 호출 시 `tenantId`, `clientId` 전달 |
| `backend/src/external-auth/external-auth.service.spec.ts` | request mapping 단위 테스트 추가 |
| `frontend/src/api/external-auth.ts` | API 타입에 `RequestMapping` 추가 |
| `frontend/src/views/tenant/external-auth/ExternalAuthFormView.vue` | request mapping 입력/수정 UI 추가 |
| `docs/guide/authori-integration-guide.md` | 외부 인증 요청 매핑 사용법 문서화 |

---

## 데이터 모델

새 타입은 외부 서비스로 보내는 request body의 목적 필드명을 정의한다.

```typescript
export interface ExternalAuthRequestMapping {
  /** 입력 email 값을 담을 외부 요청 필드명. 기본: 'email' */
  email?: string;
  /** 입력 password 값을 담을 외부 요청 필드명. 기본: 'password' */
  password?: string;
  /** tenantId 값을 담을 외부 요청 필드명. 지정한 경우에만 포함 */
  tenantId?: string;
  /** clientId 값을 담을 외부 요청 필드명. 지정한 경우에만 포함 */
  clientId?: string;
  /** 고정 문자열 파라미터. 예: { source: 'authori' } */
  staticParams?: Record<string, string>;
}
```

제약:

- `email`, `password`, `tenantId`, `clientId` 값은 점 경로를 허용한다. 예: `credentials.email`, `context.tenantId`
- 점 경로는 request body에 중첩 객체를 만든다.
- `staticParams`도 점 경로 키를 허용한다.
- 동일 경로가 여러 값으로 지정되면 우선순위는 `staticParams` → `clientId` → `tenantId` → `password` → `email` 순서로 뒤쪽 값이 앞쪽 값을 덮는다.
- 빈 문자열은 설정하지 않은 값으로 취급한다.

---

## Task 1: Backend 데이터 모델과 마이그레이션

**Files:**
- Modify: `backend/src/database/entities/external-auth-provider.entity.ts`
- Modify: `backend/src/database/entities/index.ts`
- Create: `backend/src/database/migrations/1777300000000-AddExternalAuthRequestMapping.ts`

- [ ] **Step 1: 엔티티 타입과 컬럼을 추가한다**

`backend/src/database/entities/external-auth-provider.entity.ts`에서 `ExternalAuthFieldMapping` 아래에 타입을 추가한다.

```typescript
export interface ExternalAuthRequestMapping {
  email?: string;
  password?: string;
  tenantId?: string;
  clientId?: string;
  staticParams?: Record<string, string>;
}
```

`fieldMapping` 컬럼 아래에 새 컬럼을 추가한다.

```typescript
  @Column({ name: 'request_mapping', type: 'jsonb', nullable: true })
  requestMapping: ExternalAuthRequestMapping | null;
```

- [ ] **Step 2: 엔티티 index export를 추가한다**

`backend/src/database/entities/index.ts`의 external auth export를 아래처럼 확장한다.

```typescript
export { ExternalAuthProvider } from './external-auth-provider.entity';
export type {
  ExternalAuthFieldMapping,
  ExternalAuthRequestMapping,
} from './external-auth-provider.entity';
```

- [ ] **Step 3: 마이그레이션 파일을 생성한다**

`backend/src/database/migrations/1777300000000-AddExternalAuthRequestMapping.ts`:

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExternalAuthRequestMapping1777300000000 implements MigrationInterface {
  name = 'AddExternalAuthRequestMapping1777300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "external_auth_providers" ADD "request_mapping" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "external_auth_providers" DROP COLUMN "request_mapping"`,
    );
  }
}
```

- [ ] **Step 4: 타입 체크를 실행한다**

Run:

```bash
cd backend
bun run build
```

Expected: `Found 0 errors.`

- [ ] **Step 5: 커밋한다**

```bash
git add backend/src/database/entities/external-auth-provider.entity.ts \
        backend/src/database/entities/index.ts \
        backend/src/database/migrations/1777300000000-AddExternalAuthRequestMapping.ts
git commit -m "feat: add external auth request mapping model"
```

---

## Task 2: DTO와 저장 로직

**Files:**
- Modify: `backend/src/external-auth/dto/create-provider.dto.ts`
- Modify: `backend/src/external-auth/external-auth.service.ts`

- [ ] **Step 1: DTO를 확장한다**

`backend/src/external-auth/dto/create-provider.dto.ts`에서 `FieldMappingDto` 아래에 추가한다.

```typescript
export class RequestMappingDto {
  @ApiPropertyOptional({ example: 'login_id' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ example: 'passwd' })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({ example: 'tenant' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ example: 'client' })
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiPropertyOptional({
    description: '외부 인증 요청에 항상 포함할 고정 문자열 파라미터',
    example: { source: 'authori', grant_type: 'password' },
  })
  @IsOptional()
  @IsObject()
  staticParams?: Record<string, string>;
}
```

`CreateProviderDto`의 `fieldMapping` 아래에 추가한다.

```typescript
  @ApiPropertyOptional({ type: RequestMappingDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RequestMappingDto)
  requestMapping?: RequestMappingDto | null;
```

- [ ] **Step 2: create 저장 로직에 `requestMapping`을 추가한다**

`ExternalAuthService.create()`의 `providerRepo.create()` 객체에 추가한다.

```typescript
      requestMapping: dto.requestMapping ?? null,
```

- [ ] **Step 3: update 저장 로직에 `requestMapping`을 추가한다**

`ExternalAuthService.update()`의 `Object.assign(provider, { ... })`에 추가한다.

```typescript
      ...(dto.requestMapping !== undefined && { requestMapping: dto.requestMapping ?? null }),
```

- [ ] **Step 4: 저장 로직 테스트를 추가한다**

`backend/src/external-auth/external-auth.service.spec.ts`를 생성하거나 기존 파일이 생긴 경우 아래 테스트를 포함한다.

```typescript
import { ConflictException } from '@nestjs/common';
import { ExternalAuthProvider } from '../database/entities';
import { ExternalAuthService } from './external-auth.service';

describe('ExternalAuthService provider persistence', () => {
  const repo = {
    create: jest.fn((value: Partial<ExternalAuthProvider>) => value),
    save: jest.fn(async (value: Partial<ExternalAuthProvider>) => ({
      id: 'provider-1',
      ...value,
    })),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repo.findOne.mockResolvedValue(null);
    repo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    });
  });

  it('stores requestMapping when creating a provider', async () => {
    const service = new ExternalAuthService(repo as never);

    await service.create('tenant-1', {
      providerUrl: 'https://legacy.example.com/auth',
      requestMapping: {
        email: 'login_id',
        password: 'passwd',
        tenantId: 'tenant',
        clientId: 'client',
        staticParams: { source: 'authori' },
      },
    });

    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
      requestMapping: {
        email: 'login_id',
        password: 'passwd',
        tenantId: 'tenant',
        clientId: 'client',
        staticParams: { source: 'authori' },
      },
    }));
  });

  it('rejects duplicate default providers before saving requestMapping', async () => {
    repo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({ id: 'existing-provider' }),
    });
    const service = new ExternalAuthService(repo as never);

    await expect(service.create('tenant-1', {
      providerUrl: 'https://legacy.example.com/auth',
      requestMapping: { email: 'login_id' },
    })).rejects.toBeInstanceOf(ConflictException);
  });
});
```

- [ ] **Step 5: 테스트를 실행한다**

Run:

```bash
cd backend
bun run test -- external-auth.service.spec.ts
```

Expected: `PASS src/external-auth/external-auth.service.spec.ts`

- [ ] **Step 6: 커밋한다**

```bash
git add backend/src/external-auth/dto/create-provider.dto.ts \
        backend/src/external-auth/external-auth.service.ts \
        backend/src/external-auth/external-auth.service.spec.ts
git commit -m "feat: persist external auth request mapping"
```

---

## Task 3: Request body 빌더와 외부 호출 연동

**Files:**
- Modify: `backend/src/external-auth/external-auth.service.ts`
- Modify: `backend/src/oauth/authorize/authorize.service.ts`
- Test: `backend/src/external-auth/external-auth.service.spec.ts`

- [ ] **Step 1: request body 빌더 테스트를 추가한다**

`backend/src/external-auth/external-auth.service.spec.ts`에 아래 describe 블록을 추가한다.

```typescript
describe('ExternalAuthService request body mapping', () => {
  const repo = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    softDelete: jest.fn(),
  };

  it('builds the default request body when requestMapping is missing', () => {
    const service = new ExternalAuthService(repo as never);

    expect(service.buildProviderRequestBody(
      null,
      'user@example.com',
      'secret',
      'tenant-1',
      'client-1',
    )).toEqual({
      email: 'user@example.com',
      password: 'secret',
    });
  });

  it('maps credentials and context into configured flat fields', () => {
    const service = new ExternalAuthService(repo as never);

    expect(service.buildProviderRequestBody(
      {
        email: 'login_id',
        password: 'passwd',
        tenantId: 'tenant',
        clientId: 'client',
        staticParams: { source: 'authori' },
      },
      'user@example.com',
      'secret',
      'tenant-1',
      'client-1',
    )).toEqual({
      login_id: 'user@example.com',
      passwd: 'secret',
      tenant: 'tenant-1',
      client: 'client-1',
      source: 'authori',
    });
  });

  it('supports dotted request paths', () => {
    const service = new ExternalAuthService(repo as never);

    expect(service.buildProviderRequestBody(
      {
        email: 'credentials.email',
        password: 'credentials.password',
        tenantId: 'context.tenantId',
        clientId: 'context.clientId',
        staticParams: { 'context.source': 'authori' },
      },
      'user@example.com',
      'secret',
      'tenant-1',
      'client-1',
    )).toEqual({
      credentials: {
        email: 'user@example.com',
        password: 'secret',
      },
      context: {
        tenantId: 'tenant-1',
        clientId: 'client-1',
        source: 'authori',
      },
    });
  });
});
```

- [ ] **Step 2: request body 빌더를 구현한다**

`ExternalAuthService` 클래스 안에 `callProvider()`보다 위쪽에 추가한다.

```typescript
  buildProviderRequestBody(
    mapping: ExternalAuthProvider['requestMapping'],
    email: string,
    password: string,
    tenantId: string,
    clientId: string,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {};

    const setPath = (path: string | undefined, value: unknown) => {
      const normalizedPath = path?.trim();
      if (!normalizedPath) return;

      const keys = normalizedPath.split('.').map((key) => key.trim()).filter(Boolean);
      if (keys.length === 0) return;

      let cursor: Record<string, unknown> = body;
      for (const key of keys.slice(0, -1)) {
        const next = cursor[key];
        if (!next || typeof next !== 'object' || Array.isArray(next)) {
          cursor[key] = {};
        }
        cursor = cursor[key] as Record<string, unknown>;
      }
      cursor[keys[keys.length - 1]] = value;
    };

    if (!mapping) {
      return { email, password };
    }

    for (const [path, value] of Object.entries(mapping.staticParams ?? {})) {
      setPath(path, value);
    }
    setPath(mapping.clientId, clientId);
    setPath(mapping.tenantId, tenantId);
    setPath(mapping.password ?? 'password', password);
    setPath(mapping.email ?? 'email', email);

    return body;
  }
```

- [ ] **Step 3: `callProvider()` 시그니처와 body 생성 로직을 변경한다**

기존 시그니처:

```typescript
  async callProvider(
    provider: ExternalAuthProvider,
    email: string,
    password: string,
  ): Promise<ExternalAuthResult> {
```

변경:

```typescript
  async callProvider(
    provider: ExternalAuthProvider,
    email: string,
    password: string,
    tenantId: string,
    clientId: string,
  ): Promise<ExternalAuthResult> {
```

기존 fetch body:

```typescript
        body: JSON.stringify({ email, password }),
```

변경:

```typescript
        body: JSON.stringify(this.buildProviderRequestBody(
          provider.requestMapping,
          email,
          password,
          tenantId,
          clientId,
        )),
```

- [ ] **Step 4: 호출부에 tenant/client 컨텍스트를 전달한다**

`backend/src/oauth/authorize/authorize.service.ts`에서 `callProvider()` 호출을 아래 형태로 바꾼다.

```typescript
      const result = await this.externalAuthService.callProvider(
        provider,
        dto.email,
        dto.password,
        tenantId,
        pending.clientId,
      );
```

- [ ] **Step 5: 테스트를 실행한다**

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

- [ ] **Step 6: 커밋한다**

```bash
git add backend/src/external-auth/external-auth.service.ts \
        backend/src/external-auth/external-auth.service.spec.ts \
        backend/src/oauth/authorize/authorize.service.ts
git commit -m "feat: map external auth request parameters"
```

---

## Task 4: Frontend API 타입과 폼

**Files:**
- Modify: `frontend/src/api/external-auth.ts`
- Modify: `frontend/src/views/tenant/external-auth/ExternalAuthFormView.vue`

- [ ] **Step 1: API 타입을 확장한다**

`frontend/src/api/external-auth.ts`에 `RequestMapping` 타입을 추가한다.

```typescript
export interface RequestMapping {
  email?: string
  password?: string
  tenantId?: string
  clientId?: string
  staticParams?: Record<string, string>
}
```

`ExternalAuthProvider`와 `CreateProviderPayload`에 추가한다.

```typescript
  requestMapping: RequestMapping | null
```

```typescript
  requestMapping?: RequestMapping | null
```

- [ ] **Step 2: 폼 상태를 추가한다**

`ExternalAuthFormView.vue` import를 변경한다.

```typescript
import { externalAuthApi, type CreateProviderPayload, type FieldMapping, type RequestMapping } from '@/api/external-auth'
```

프로비저닝 설정 상태 아래에 추가한다.

```typescript
const requestEmail = ref('')
const requestPassword = ref('')
const requestTenantId = ref('')
const requestClientId = ref('')
const staticParamRows = ref<{ key: string; value: string }[]>([])
```

helper를 추가한다.

```typescript
function addStaticParamRow() {
  staticParamRows.value.push({ key: '', value: '' })
}

function removeStaticParamRow(i: number) {
  staticParamRows.value.splice(i, 1)
}
```

- [ ] **Step 3: payload 빌더에 requestMapping을 추가한다**

`buildPayload()`의 field mapping 생성 후에 추가한다.

```typescript
  const staticParams: Record<string, string> = {}
  for (const row of staticParamRows.value) {
    if (row.key && row.value) staticParams[row.key] = row.value
  }

  const requestMapping: RequestMapping = {}
  if (requestEmail.value) requestMapping.email = requestEmail.value
  if (requestPassword.value) requestMapping.password = requestPassword.value
  if (requestTenantId.value) requestMapping.tenantId = requestTenantId.value
  if (requestClientId.value) requestMapping.clientId = requestClientId.value
  if (Object.keys(staticParams).length > 0) requestMapping.staticParams = staticParams
```

return 객체에 추가한다.

```typescript
    requestMapping: Object.keys(requestMapping).length > 0 ? requestMapping : null,
```

- [ ] **Step 4: edit fill 로직을 추가한다**

`fillForm()`의 `fieldMapping` 처리 아래에 추가한다.

```typescript
  if (data.requestMapping) {
    requestEmail.value = data.requestMapping.email ?? ''
    requestPassword.value = data.requestMapping.password ?? ''
    requestTenantId.value = data.requestMapping.tenantId ?? ''
    requestClientId.value = data.requestMapping.clientId ?? ''
    if (data.requestMapping.staticParams) {
      staticParamRows.value = Object.entries(data.requestMapping.staticParams)
        .map(([key, value]) => ({ key, value }))
    }
  }
```

- [ ] **Step 5: request mapping UI를 추가한다**

필드 매핑 카드보다 앞에 아래 카드 섹션을 추가한다.

```vue
      <div class="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div>
          <h2 class="text-sm font-semibold text-gray-900">호출 파라미터 매핑 <span class="text-xs font-normal text-gray-400">(선택, 기본값: email/password)</span></h2>
          <p class="text-xs text-gray-400 mt-1">외부 인증 서버가 요구하는 요청 필드명이 다를 경우 Authori 입력값을 해당 필드명으로 매핑합니다. 점 경로를 사용하면 중첩 객체로 전송됩니다.</p>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-gray-500 mb-1">이메일 요청 필드</label>
            <input v-model="requestEmail" type="text" placeholder="email 또는 credentials.email" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">비밀번호 요청 필드</label>
            <input v-model="requestPassword" type="text" placeholder="password 또는 credentials.password" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">테넌트 ID 요청 필드</label>
            <input v-model="requestTenantId" type="text" placeholder="tenantId 또는 context.tenantId" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">클라이언트 ID 요청 필드</label>
            <input v-model="requestClientId" type="text" placeholder="clientId 또는 context.clientId" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>

        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="text-xs text-gray-500">고정 파라미터</label>
            <button type="button" class="text-xs text-indigo-600 hover:text-indigo-800" @click="addStaticParamRow">+ 추가</button>
          </div>
          <div v-if="staticParamRows.length === 0" class="text-xs text-gray-400 py-2">고정 파라미터 없음</div>
          <div v-for="(row, i) in staticParamRows" :key="i" class="flex gap-2 items-center mb-2">
            <input v-model="row.key" type="text" placeholder="요청 필드" class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <span class="text-gray-400 text-xs">=</span>
            <input v-model="row.value" type="text" placeholder="고정 값" class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <button type="button" class="text-red-400 hover:text-red-600 text-xs px-1" @click="removeStaticParamRow(i)">✕</button>
          </div>
        </div>
      </div>
```

- [ ] **Step 6: 프론트 타입 체크를 실행한다**

Run:

```bash
cd frontend
bun run build
```

Expected: `vue-tsc -b`와 `vite build`가 성공한다.

- [ ] **Step 7: 커밋한다**

```bash
git add frontend/src/api/external-auth.ts \
        frontend/src/views/tenant/external-auth/ExternalAuthFormView.vue
git commit -m "feat: expose external auth request mapping UI"
```

---

## Task 5: 연동 문서와 최종 검증

**Files:**
- Modify: `docs/guide/authori-integration-guide.md`
- Modify: `docs/plans/2026-04-06-external-auth-provider-design.md`

- [ ] **Step 1: 통합 가이드에 request mapping 예시를 추가한다**

`docs/guide/authori-integration-guide.md`의 외부 인증 연동 섹션에 아래 내용을 추가한다.

````markdown
### 외부 인증 호출 파라미터 매핑

기본 요청 본문은 다음과 같다.

```json
{
  "email": "user@example.com",
  "password": "plain_password"
}
```

외부 인증 서버가 다른 필드명을 요구하면 관리자 화면의 "호출 파라미터 매핑"에서 request field를 지정한다.

| 설정 | 값 |
|---|---|
| 이메일 요청 필드 | `login_id` |
| 비밀번호 요청 필드 | `passwd` |
| 테넌트 ID 요청 필드 | `context.tenantId` |
| 클라이언트 ID 요청 필드 | `context.clientId` |
| 고정 파라미터 | `source=authori` |

위 설정은 다음 request body를 만든다.

```json
{
  "login_id": "user@example.com",
  "passwd": "plain_password",
  "context": {
    "tenantId": "tenant-uuid",
    "clientId": "oauth-client-id"
  },
  "source": "authori"
}
```
````

- [ ] **Step 2: 기존 설계 문서를 갱신한다**

`docs/plans/2026-04-06-external-auth-provider-design.md`의 `외부 서비스 API 계약` 아래에 request mapping이 없을 때는 기존 `{ email, password }`만 보내고, `requestMapping.tenantId`와 `requestMapping.clientId`가 설정된 경우에만 테넌트/클라이언트 컨텍스트를 포함한다고 명시한다.

- [ ] **Step 3: 전체 검증을 실행한다**

Run:

```bash
cd backend
bun run test -- external-auth.service.spec.ts
bun run build
cd ../frontend
bun run build
cd ..
graphify update .
```

Expected:

```text
PASS src/external-auth/external-auth.service.spec.ts
Found 0 errors.
vite build ... built
```

`graphify update .`는 코드 파일 변경 후 그래프 갱신용으로 실행한다.

- [ ] **Step 4: 커밋한다**

```bash
git add docs/guide/authori-integration-guide.md \
        docs/plans/2026-04-06-external-auth-provider-design.md
git commit -m "docs: document external auth request mapping"
```

---

## 완료 기준

- [ ] 기존 프로바이더는 `requestMapping = null`이어도 `{ email, password }` 요청을 계속 보낸다.
- [ ] 관리자가 이메일/비밀번호 요청 필드명을 바꾸면 외부 호출 request body에 변경된 필드명이 사용된다.
- [ ] 관리자가 `tenantId`, `clientId` 요청 필드를 지정하면 해당 값이 외부 호출 request body에 포함된다.
- [ ] 점 경로 매핑으로 중첩 request body를 만들 수 있다.
- [ ] 고정 문자열 파라미터를 외부 호출 request body에 포함할 수 있다.
- [ ] `fieldMapping`은 기존처럼 외부 응답 매핑으로만 동작한다.
- [ ] backend 단위 테스트와 build가 성공한다.
- [ ] frontend build가 성공한다.
- [ ] 코드 변경 후 `graphify update .`가 실행된다.

## 리스크와 후속 개선

- `credentialValue`는 현재 평문 저장이므로 이 계획에서는 다루지 않는다. 비밀값 암호화는 별도 보안 개선으로 분리한다.
- request body value transform, 예를 들어 base64 인코딩이나 문자열 템플릿은 이번 범위에서 제외한다. 외부 서비스마다 규칙이 달라 검증/보안 표면이 커진다.
- 배열 경로(`items[0].email`)는 지원하지 않는다. 필요한 경우 별도 DSL 설계가 필요하다.
- 중복 경로 충돌은 빌더 우선순위로 결정한다. 서버는 동일 입력에 대해 항상 같은 request body를 만든다.
