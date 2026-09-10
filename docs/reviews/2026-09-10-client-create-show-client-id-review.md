# 개발완료보고서 — 클라이언트 생성 결과 화면에 Client ID 표시

- 작성일: 2026-09-10
- 브랜치: `feat/client-id-on-create`
- 관련 요구사항: [2026-09-10-client-create-show-client-id-requirements.md](../requirements/2026-09-10-client-create-show-client-id-requirements.md)
- 관련 설계서: [2026-09-10-client-create-show-client-id-spec.md](../specs/2026-09-10-client-create-show-client-id-spec.md)
- 관련 계획서: [2026-09-10-client-create-show-client-id-plan.md](../plans/2026-09-10-client-create-show-client-id-plan.md)

## 1. 구현 요약

`CONFIDENTIAL` OAuth 클라이언트 생성 직후 화면에 Client Secret 만 표시되던 것을, **Client ID 와 Client Secret 을 함께** 표시하도록 개선했다. 두 값 모두 기존 `CopyableField` 컴포넌트를 재사용해 각각 독립적인 클립보드 복사 버튼을 갖는다. Client ID 를 Secret 위에 배치하고 "목록과 상세 화면에서 다시 확인할 수 있습니다" 보조 문구를 달아, 기존 경고("Client Secret은 지금만 확인 가능합니다")가 Secret 에만 해당함을 분명히 했다.

구현 과정에서 프런트엔드 응답 타입 오류를 함께 바로잡았다. 백엔드 `ClientsService.create()` 는 `{ client, plainSecret }` 를 반환하지만 `ClientCreatedResponse` 는 `OAuthClient` 를 평탄하게 상속한 형태로 선언돼 있었다. `data.plainSecret` 만 읽던 동안에는 증상이 없었으나 `data.clientId` 는 `undefined` 였다. 실제 응답 구조에 맞춰 정정했고, 결과적으로 `ClientUpdatedResponse` 와 모양이 일치하게 됐다.

## 2. 완료된 작업

| 작업 | 파일 |
|---|---|
| `ClientCreatedResponse` 타입을 `{ client, plainSecret }` 로 정정 | `apps/web/src/api/clients.ts` |
| 결과 상태를 `created: { clientId, plainSecret }` 로 교체 | `apps/web/src/views/tenant/clients/ClientCreateView.vue` |
| 결과 카드에 Client ID `CopyableField` 추가 | `apps/web/src/views/tenant/clients/ClientCreateView.vue` |
| 컴포넌트 테스트 3건 신규 작성 | `apps/web/src/views/tenant/clients/ClientCreateView.spec.ts` |

백엔드·DB·API 계약 변경은 없다.

### 2.1 신규 테스트

| ID | 시나리오 | 결과 |
|---|---|---|
| T-1 | `CONFIDENTIAL` 생성 후 Client ID·Client Secret 이 모두 렌더링됨 | PASS |
| T-2 | 두 복사 버튼이 각각 clientId / plainSecret 로 `clipboard.writeText` 호출 | PASS |
| T-3 | `plainSecret: null`(PUBLIC) 이면 결과 카드 없이 목록으로 이동 | PASS |

## 3. 빌드 및 테스트 결과

| 명령 | 결과 |
|---|---|
| `bun run lint` | **기존 baseline 실패** — `@authori/api` 122 problems (67 errors, 55 warnings). `develop` 에서 실행한 결과와 건수가 동일해 **본 작업으로 유입된 신규 오류는 없다.** `apps/web` 에는 `lint` 스크립트가 없어 루트 lint 대상에 포함되지 않는다(본 작업은 web 단독 변경). |
| `bun run typecheck` | PASS — `@authori/api`, `@authori/web` 2/2 |
| `bun run test` | PASS — api 215건 / web 13건 (신규 3건 포함), 전부 통과 |
| `bun run build` | PASS — 2/2 |

## 4. 남은 리스크 및 후속 작업

- **`apps/api` lint baseline (67 errors)** — 본 작업 이전부터 존재하던 부채로, 루트 `bun run lint` 가 항상 실패해 turbo 파이프라인이 api 단계에서 멈춘다. 이 때문에 web 에 lint 스크립트를 추가하더라도 실행되지 않는다. 별도 정리 작업 권장.
- **`apps/web` 에 lint 스크립트 부재** — 프런트엔드 코드는 현재 루트 lint 로 검증되지 않는다. 후속으로 eslint 설정 추가 검토.
- `PUBLIC` 클라이언트는 설계대로 생성 후 목록으로 바로 이동하며 Client ID 전용 결과 화면을 두지 않았다. 필요해지면 `created` 상태에 `plainSecret` 을 선택적으로 만들어 확장할 수 있다.
