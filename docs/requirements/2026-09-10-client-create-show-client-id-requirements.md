# 요구사항정의서 — 클라이언트 생성 결과 화면에 Client ID 표시

- 작성일: 2026-09-10
- 작성자: Jinho Lee
- 상태: 확정
- 유형: 기능 개선 (관리 UI)

## 1. 문제 정의

관리자가 OAuth 클라이언트를 `CONFIDENTIAL` 타입으로 생성하면 생성 직후 화면(`ClientCreateView.vue`)에 **Client Secret 만** 표시된다. Secret 은 이 화면을 벗어나면 다시 볼 수 없으므로 관리자는 이 시점에 값을 복사해 둔다. 그러나 클라이언트 애플리케이션을 설정하려면 Client Secret 과 **Client ID 가 항상 쌍으로** 필요하다.

현재는 Client ID 를 얻으려면 목록으로 이동해 방금 만든 클라이언트를 다시 찾아 상세 화면에 들어가야 한다. 한 번의 작업이 두 화면으로 쪼개지고, Secret 을 먼저 안전한 곳에 옮긴 뒤 다시 돌아와 ID 를 찾아 붙여 넣어야 하므로 잘못된 클라이언트의 ID 를 복사할 여지도 있다.

### 1.1 부수 결함 (구현 중 발견)

백엔드 `ClientsService.create()` 는 `{ client, plainSecret }` 형태로 응답하지만, 프런트엔드 타입 `ClientCreatedResponse` 는 `OAuthClient` 를 그대로 상속한 **평탄한(flat) 구조**로 선언돼 있다. `data.plainSecret` 만 읽고 있어 현재까지는 증상이 없었으나, 같은 응답에서 `data.clientId` 를 읽으면 `undefined` 가 된다. 본 작업에서 Client ID 를 읽어야 하므로 함께 바로잡는다.

## 2. 목표

클라이언트 생성 직후 화면 한 곳에서 **Client ID 와 Client Secret 을 모두 확인하고 각각 클립보드로 복사**할 수 있게 한다.

## 3. 기능 요구사항

| ID | 요구사항 |
|---|---|
| FR-1 | `CONFIDENTIAL` 클라이언트 생성 결과 화면에 Client ID 를 표시한다. |
| FR-2 | Client ID 는 기존 Client Secret 과 동일하게 `CopyableField` 로 렌더링해 **클립보드 복사 버튼**을 제공한다. |
| FR-3 | Client ID 를 Client Secret 보다 위에 배치한다(설정 파일에 기입하는 순서와 일치). |
| FR-4 | "지금만 확인 가능" 경고는 Client Secret 에만 해당함이 드러나야 한다. Client ID 는 목록·상세에서 언제든 다시 볼 수 있다. |
| FR-5 | 프런트엔드 `ClientCreatedResponse` 타입을 실제 API 응답(`{ client, plainSecret }`)에 맞춘다. |

## 4. 비기능 요구사항

| ID | 요구사항 |
|---|---|
| NFR-1 | 백엔드 API(응답 스키마 포함)는 변경하지 않는다. 프런트엔드만 수정한다. |
| NFR-2 | 기존 화면의 시각적 톤(카드·간격·색)을 유지한다. |

## 5. 제외 범위

- `PUBLIC` 클라이언트 생성 흐름 변경 — 지금처럼 생성 후 목록으로 바로 이동한다(Secret 이 없어 표시할 일회성 정보가 없다).
- 클라이언트 상세 화면의 Secret 재발급(`rotate-secret`) 결과 표시 — 해당 화면에는 이미 Client ID 가 노출돼 있다.

## 6. 성공 기준

- `CONFIDENTIAL` 클라이언트를 생성하면 Client ID 와 Client Secret 이 한 화면에 각각 복사 버튼과 함께 나타난다.
- `bun run lint`, `bun run typecheck`, `bun run test`, `bun run build` 통과.
