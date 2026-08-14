# 개발설계서 — 외부 인증 프로바이더 이메일 도메인 적용 범위

- 작성일: 2026-08-14
- 작성자: Jinho Lee
- 관련 요구사항: [2026-08-14-external-auth-email-domain-scope-requirements.md](../requirements/2026-08-14-external-auth-email-domain-scope-requirements.md)

## 1. 개요

외부 인증 프로바이더(`ExternalAuthProvider`)의 적용 범위 조건에 **로그인 이메일의 도메인(호스트명)** 을 추가한다.
클라이언트 범위(`client_id`)와 도메인 범위(`email_domains`)를 조합한 4단계 우선순위로 프로바이더를 선택하며,
매칭 실패 시 기존 로컬 비밀번호 인증 경로로 폴백한다.

## 2. 데이터 모델

### 2.1 컬럼 추가

`external_auth_providers` 테이블에 컬럼 1개를 추가한다.

| 컬럼 | 타입 | Null | 기본값 | 설명 |
|---|---|---|---|---|
| `email_domains` | `jsonb` | Y | `NULL` | 적용 대상 이메일 도메인 배열. `NULL`/`[]`이면 도메인 무관 |

`jsonb`를 선택한 이유: 기존 `field_mapping`, `request_mapping`, `credential_headers`가 모두 `jsonb`이며 TypeORM 매핑 패턴이 통일되어 있다. Postgres `text[]`는 TypeORM 배열 처리에서 별도 취급이 필요하고 기존 코드에 선례가 없다.

### 2.2 엔티티

`apps/api/src/database/entities/external-auth-provider.entity.ts`

```ts
/**
 * 적용 대상 이메일 도메인 목록(소문자, '@' 제외).
 * null 또는 빈 배열이면 도메인 조건 없음 = 모든 도메인에 적용.
 * 예: ['test1.com', 'test1.co.kr']
 */
@Column({ name: 'email_domains', type: 'jsonb', nullable: true })
emailDomains: string[] | null;
```

### 2.3 마이그레이션

`apps/api/src/database/migrations/1780900000000-AddExternalAuthEmailDomains.ts`

```sql
-- up
ALTER TABLE "external_auth_providers" ADD COLUMN "email_domains" jsonb;
-- down
ALTER TABLE "external_auth_providers" DROP COLUMN "email_domains";
```

기존 행은 `NULL`로 남아 도메인 무관으로 동작한다(하위호환).

### 2.4 인덱스

추가 인덱스를 두지 않는다. 기존 `@Index(['tenantId', 'clientId'])`로 후보를 좁힌 뒤 애플리케이션에서 도메인을 판정한다. 테넌트/클라이언트당 프로바이더 수는 한 자리 수준으로 예상되므로 jsonb GIN 인덱스의 이득이 없다.

## 3. 도메인 정규화 및 검증

### 3.1 정규화 규칙 (`normalizeEmailDomains`)

`ExternalAuthService`의 정적/private 헬퍼로 구현한다.

```
입력: string[] | null | undefined
1. 각 원소에 trim() 적용
2. 선행 '@' 제거 (한 번만: '@test.com' → 'test.com')
3. toLowerCase()
4. 빈 문자열 제거
5. 형식 검증 실패 시 BadRequestException
6. 중복 제거(순서 보존)
7. 결과가 빈 배열이면 null 반환 (= 도메인 무관)
```

### 3.2 형식 검증

정규화 후 다음 정규식을 만족해야 한다.

```
/^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/
```

- 최소 1개 이상의 점을 포함해야 한다(TLD 필수).
- 라벨은 영숫자로 시작·종료하며 하이픈을 포함할 수 있다.
- 와일드카드(`*`)는 허용하지 않는다 — 입력 시 400.
- 실패 메시지: `유효하지 않은 이메일 도메인입니다: '<입력값>'`

### 3.3 이메일에서 도메인 추출 (`extractEmailDomain`)

```
마지막 '@' 이후 문자열을 소문자로 반환. '@'가 없거나 뒤가 비면 null.
```
마지막 `@`를 기준으로 하는 이유: 로컬 파트에 `@`가 포함된 인용 형식(`"a@b"@test.com`)을 안전하게 처리하기 위함.

## 4. 프로바이더 선택 로직

### 4.1 시그니처 변경

```ts
// AS-IS
async findActive(tenantId: string, clientId: string): Promise<ExternalAuthProvider | null>

// TO-BE
async findActive(
  tenantId: string,
  clientId: string,
  email?: string,
): Promise<ExternalAuthProvider | null>
```

`email`을 선택 파라미터로 두어 기존 호출부/테스트가 컴파일 오류 없이 유지되도록 한다(미전달 시 도메인 무관 프로바이더만 후보가 됨).

### 4.2 알고리즘

DB 왕복 1회로 후보 전체를 읽고 메모리에서 우선순위를 판정한다.

```ts
const candidates = await this.providerRepo
  .createQueryBuilder('p')
  .where('p.tenant_id = :tenantId', { tenantId })
  .andWhere('p.enabled = true')
  .andWhere('(p.client_id = :clientId OR p.client_id IS NULL)', { clientId })
  .orderBy('p.created_at', 'DESC')
  .getMany();

const domain = email ? ExternalAuthService.extractEmailDomain(email) : null;
const hasDomains = (p) => Array.isArray(p.emailDomains) && p.emailDomains.length > 0;
const domainMatches = (p) => !!domain && hasDomains(p) && p.emailDomains.includes(domain);

return (
  candidates.find((p) => p.clientId === clientId && domainMatches(p)) ??   // ① 
  candidates.find((p) => p.clientId === clientId && !hasDomains(p)) ??     // ②
  candidates.find((p) => p.clientId === null && domainMatches(p)) ??       // ③
  candidates.find((p) => p.clientId === null && !hasDomains(p)) ??         // ④
  null
);
```

`emailDomains`는 저장 시 이미 소문자 정규화되어 있고 `domain`도 소문자이므로 단순 `includes` 비교로 충분하다.

기존 구현은 exact/fallback 2회 쿼리였으나 도메인 판정이 들어가면서 1회 조회 + 메모리 필터가 더 단순하고 빠르다.

### 4.3 매칭 실패 시 동작

`findActive`가 `null`을 반환하면 `authorize.service.ts`의 `if (provider)` 분기를 타지 않고 기존 로컬 비밀번호 인증 경로가 그대로 실행된다. **호출부의 추가 변경은 인자 전달뿐이다.**

`apps/api/src/oauth/authorize/authorize.service.ts:313`

```ts
// AS-IS
const provider = await this.externalAuthService.findActive(tenantId, pending.clientId);
// TO-BE
const provider = await this.externalAuthService.findActive(tenantId, pending.clientId, dto.email);
```

## 5. 중복 검사 규칙

### 5.1 규칙

`checkDuplicate(tenantId, clientId, emailDomains, excludeId?)`로 확장한다.

| 신규 항목 | 충돌 조건 |
|---|---|
| 도메인 없음 (`null`) | 같은 `(tenantId, clientId)`에 **도메인 없는** 프로바이더가 이미 존재 |
| 도메인 있음 | 같은 `(tenantId, clientId)`의 **도메인 있는** 프로바이더 중 도메인이 하나라도 겹침 |

- `clientId` 비교에서 `null`(전체)과 특정 값은 서로 다른 범위로 취급한다. 즉 `clientId=null`에 `@test1.com`이 있어도 `clientId='web'`에 `@test1.com`을 등록할 수 있다(우선순위 규칙으로 해소됨).
- `enabled=false`인 프로바이더도 충돌 대상에 포함한다(비활성화 후 재활성화 시 중복이 생기는 것을 방지).
- soft delete된 행(`deleted_at IS NOT NULL`)은 TypeORM 기본 동작에 따라 제외된다.

### 5.2 오류 응답

```
409 Conflict
{ "message": "클라이언트 'web-app' 범위에 이미 등록된 도메인입니다: test1.com, test1.co.kr" }
{ "message": "테넌트 전체 범위에 이미 도메인 조건 없는 외부 인증 프로바이더가 등록되어 있습니다." }
```

### 5.3 update 시 처리

`update()`는 `clientId` 변경 여부만 보고 중복 검사를 하던 기존 로직을 **`clientId` 또는 `emailDomains`가 변경되면 검사**하도록 바꾸고, 자기 자신을 제외하기 위해 `excludeId`를 전달한다.

## 6. API

경로·메서드 변경 없음. 요청/응답 본문에 필드 1개가 추가된다.

### 6.1 DTO

`apps/api/src/external-auth/dto/create-provider.dto.ts`

```ts
@ApiPropertyOptional({
  description: "적용 대상 이메일 도메인 목록. 비우면 모든 도메인에 적용. '@'는 생략 가능",
  example: ['test1.com', 'test1.co.kr'],
  type: [String],
})
@IsOptional()
@IsArray()
@IsString({ each: true })
emailDomains?: string[] | null;
```

`UpdateProviderDto`는 `PartialType(CreateProviderDto)`이므로 자동 반영된다.

### 6.2 응답 예시

```json
{
  "id": "…",
  "clientId": null,
  "emailDomains": ["test1.com", "test1.co.kr"],
  "enabled": true,
  "providerUrl": "https://auth-a.example.com/validate"
}
```

## 7. 관리 UI

### 7.1 `ExternalAuthFormView.vue`

적용 범위 섹션(clientId 선택) 바로 아래에 도메인 입력을 추가한다.

- 상태: `const emailDomainsInput = ref<string>('')`
- 입력 형식: **줄바꿈 또는 콤마 구분** 문자열. 기존 폼이 단순 input/textarea 위주이므로 태그 컴포넌트를 새로 만들지 않는다.
- 저장 시 파싱: `emailDomainsInput.value.split(/[\n,]/).map(s => s.trim().replace(/^@/, '').toLowerCase()).filter(Boolean)` → 빈 배열이면 `null` 전송
- 로드 시 역변환: `data.emailDomains?.join('\n') ?? ''`
- 헬프 텍스트: `비워두면 모든 이메일 도메인에 적용됩니다. 예: test1.com, test1.co.kr (@ 생략 가능, 서브도메인은 자동 매칭되지 않으므로 직접 추가하세요)`
- 서버 409/400 응답 메시지를 폼 상단 오류 영역에 그대로 표시한다(기존 오류 처리 패턴 재사용).

### 7.2 `ExternalAuthListView.vue`

적용 범위 셀(`:66-67`)을 확장한다.

```
클라이언트: web-app
@test1.com, @test1.co.kr
```
- 클라이언트 줄은 기존과 동일(`p.clientId` 또는 `테넌트 전체 적용`).
- 도메인이 있으면 그 아래 줄에 `@` 접두사를 붙여 콤마로 나열한다.
- 도메인이 3개를 초과하면 `@a.com, @b.com, @c.com 외 2개`로 축약하고 `title` 속성에 전체 목록을 넣는다.

### 7.3 `apps/web/src/api/external-auth.ts`

`ExternalAuthProvider`, `CreateProviderPayload` 인터페이스에 `emailDomains: string[] | null` / `emailDomains?: string[] | null`을 추가한다.

## 8. 테스트 설계

### 8.1 `external-auth.service.spec.ts` (단위)

| 대상 | 케이스 |
|---|---|
| `normalizeEmailDomains` | `'@Test1.COM '` → `'test1.com'` / 중복 제거 / 빈 배열 → `null` / `'invalid'`(점 없음) → 400 / `'*.test.com'` → 400 |
| `extractEmailDomain` | `'u@Test.COM'` → `'test.com'` / `'noat'` → `null` / `'"a@b"@test.com'` → `'test.com'` |
| `findActive` | 우선순위 ①~④ 각각이 선택되는 케이스 4개 |
| `findActive` | 도메인 미매칭 + 도메인 무관 프로바이더 없음 → `null` |
| `findActive` | `email` 미전달 시 도메인 조건 프로바이더는 선택되지 않음 |
| `findActive` | `enabled=false` 프로바이더는 후보에서 제외 |
| `checkDuplicate` | 도메인 겹침 → 409(메시지에 충돌 도메인 포함) / 겹치지 않음 → 성공 |
| `checkDuplicate` | 같은 도메인이라도 `clientId` 범위가 다르면 성공 |
| `update` | 자기 자신의 도메인은 충돌로 보지 않음 |

### 8.2 authorize 흐름 (기존 spec 확장)

- `@test1.com` 로그인 → Provider A의 `providerUrl`이 호출됨
- `@test2.com` 로그인 → Provider B가 호출됨
- `@other.com` 로그인 + 도메인 무관 프로바이더 없음 → 외부 호출 없이 로컬 비밀번호 검증 수행

## 9. 보안 · 성능 고려사항

- **매칭 방식 제한**: 정규식 매칭을 배제하여 ReDoS 및 관리자 오설정으로 인한 인증 라우팅 오류를 원천 차단한다.
- **오류 메시지**: 로그인 실패 응답은 기존과 동일하게 `invalid_credentials`로 통일한다. 어떤 도메인이 어떤 프로바이더에 연결되어 있는지는 로그인 응답으로 노출하지 않는다.
- **쿼리 비용**: 기존 최대 2회 쿼리 → 1회 쿼리로 감소. 후보 수는 테넌트당 소수이므로 메모리 필터링 비용은 무시 가능하다.
- **감사 로그**: 기존 `providerId` 메타데이터가 그대로 기록되므로 어떤 프로바이더로 라우팅되었는지 추적 가능하다. 추가 변경 없음.

## 10. 하위호환성

| 항목 | 영향 |
|---|---|
| 기존 프로바이더 행 | `email_domains = NULL` → 우선순위 ②/④로 기존과 동일하게 선택됨 |
| 기존 API 클라이언트 | 필드 미전송 시 `null` → 동작 변화 없음 |
| `findActive` 기존 호출 | `email` 선택 파라미터라 시그니처 호환 |
| 중복 검사 | 도메인 없는 프로바이더에 대해서는 기존 규칙과 동일 |

## 11. 변경 파일 목록

**Backend**
- `apps/api/src/database/entities/external-auth-provider.entity.ts` (수정)
- `apps/api/src/database/migrations/1780900000000-AddExternalAuthEmailDomains.ts` (신규)
- `apps/api/src/external-auth/dto/create-provider.dto.ts` (수정)
- `apps/api/src/external-auth/external-auth.service.ts` (수정)
- `apps/api/src/external-auth/external-auth.service.spec.ts` (수정)
- `apps/api/src/oauth/authorize/authorize.service.ts` (수정 — 1줄)

**Frontend**
- `apps/web/src/api/external-auth.ts` (수정)
- `apps/web/src/views/tenant/external-auth/ExternalAuthFormView.vue` (수정)
- `apps/web/src/views/tenant/external-auth/ExternalAuthListView.vue` (수정)

**문서**
- `CLAUDE.md` (외부 인증 적용 범위 설명 갱신)
