# 개발설계서 — 클라이언트 생성 결과 화면에 Client ID 표시

- 작성일: 2026-09-10
- 관련 요구사항: [2026-09-10-client-create-show-client-id-requirements.md](../requirements/2026-09-10-client-create-show-client-id-requirements.md)

## 1. 범위

프런트엔드(`apps/web`)만 변경한다. 백엔드 코드·API 계약·DB 스키마 변경 없음.

## 2. 현재 동작

`apps/web/src/views/tenant/clients/ClientCreateView.vue` 는 생성 성공 시 `data.plainSecret` 이 있으면 `plainSecret` ref 에 담고, 템플릿에서 `v-if="plainSecret"` 분기로 결과 카드를 그린다. 결과 카드는 경고 배너 + `CopyableField(Client Secret)` + "목록으로" 버튼으로 구성된다.

## 3. API 응답 계약 정정

`ClientsService.create()` 의 실제 반환은 다음과 같다 (`apps/api/src/oauth/clients/clients.service.ts:104`).

```ts
{ client: OAuthClient, plainSecret: string | null }
```

프런트엔드 타입은 이를 평탄한 구조로 잘못 선언하고 있다. 실제 응답에 맞춰 정정한다.

```ts
// apps/web/src/api/clients.ts
export interface ClientCreatedResponse {
  client: OAuthClient
  plainSecret: string | null
}
```

`ClientUpdatedResponse` 는 이미 같은 형태이므로 두 타입의 모양이 일치하게 된다.

## 4. 화면 설계

### 4.1 상태

`plainSecret: Ref<string | null>` 하나로 결과 화면을 판정하던 것을 생성 결과 묶음으로 바꾼다.

```ts
const created = ref<{ clientId: string; plainSecret: string } | null>(null)
```

`v-if="created"` 로 결과 카드를 분기한다. `plainSecret` 이 없으면(= `PUBLIC`) 기존과 동일하게 목록으로 이동하므로, `created` 는 항상 secret 을 가진 상태로만 채워진다.

### 4.2 레이아웃

```
┌─ OAuth 클라이언트 생성 ─────────────────────┐
│  ⚠ Client Secret은 지금만 확인 가능합니다.   │
│     반드시 안전한 곳에 저장하세요.            │
│                                             │
│  Client ID                                  │
│  ┌───────────────────────────────┐ ┌──┐     │
│  │ 3f9c1a2e-…                    │ │📋│     │
│  └───────────────────────────────┘ └──┘     │
│                                             │
│  Client Secret                              │
│  ┌───────────────────────────────┐ ┌──┐     │
│  │ 8Kd2…                         │ │📋│     │
│  └───────────────────────────────┘ └──┘     │
│                                             │
│  [           목록으로           ]            │
└─────────────────────────────────────────────┘
```

- Client ID 를 Secret 위에 둔다 (FR-3).
- 두 필드 모두 기존 `CopyableField` 컴포넌트를 재사용한다. 이 컴포넌트가 이미 `navigator.clipboard.writeText` 복사와 2초간 체크 아이콘 피드백을 제공하므로 복사 로직을 새로 만들지 않는다 (FR-2).
- 경고 배너 문구는 "Client Secret은 지금만 확인 가능합니다"로 유지해 대상이 Secret 임을 명시하고, Client ID 필드 아래에 "목록에서 다시 확인할 수 있습니다" 보조 문구를 둔다 (FR-4).

## 5. 변경 파일

| 파일 | 변경 |
|---|---|
| `apps/web/src/api/clients.ts` | `ClientCreatedResponse` 를 `{ client, plainSecret }` 로 정정 |
| `apps/web/src/views/tenant/clients/ClientCreateView.vue` | `created` 상태 도입, 결과 카드에 Client ID `CopyableField` 추가 |

## 6. 보안 고려

- Client ID 는 기밀이 아니다(목록·상세·토큰 요청에 그대로 노출). 추가 노출로 인한 위험 없음.
- Client Secret 은 기존과 동일하게 응답 1회분만 메모리에 유지하며 저장·로깅하지 않는다.

## 7. 테스트 설계

`apps/web` 에는 이미 Vitest + `@vue/test-utils` 기반 컴포넌트 테스트가 있다(`OAuthRegisterView.spec.ts`). 동일 방식으로 `ClientCreateView.spec.ts` 를 추가한다.

| ID | 시나리오 | 기대 |
|---|---|---|
| T-1 | `CONFIDENTIAL` 생성 응답 `{ client: { clientId }, plainSecret }` | Client ID 와 Client Secret 두 값이 모두 렌더링된다 |
| T-2 | 결과 화면의 복사 버튼 클릭 | `navigator.clipboard.writeText` 가 각각 clientId / plainSecret 로 호출된다 |
| T-3 | `PUBLIC` 생성 (`plainSecret: null`) | 결과 카드를 그리지 않고 목록 라우트로 이동한다 |
