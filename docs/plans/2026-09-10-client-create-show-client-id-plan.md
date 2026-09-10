# 개발계획서 — 클라이언트 생성 결과 화면에 Client ID 표시

- 작성일: 2026-09-10
- 관련 요구사항: [2026-09-10-client-create-show-client-id-requirements.md](../requirements/2026-09-10-client-create-show-client-id-requirements.md)
- 관련 설계서: [2026-09-10-client-create-show-client-id-spec.md](../specs/2026-09-10-client-create-show-client-id-spec.md)
- 브랜치: `feat/client-id-on-create`

## Goal

`CONFIDENTIAL` OAuth 클라이언트 생성 직후 화면에서 Client ID 와 Client Secret 을 각각 클립보드 복사 버튼과 함께 확인할 수 있게 한다.

## 변경 파일

- `apps/web/src/api/clients.ts`
- `apps/web/src/views/tenant/clients/ClientCreateView.vue`
- `apps/web/src/views/tenant/clients/ClientCreateView.spec.ts` (신규)

## 작업 단계

- [ ] `ClientCreatedResponse` 타입을 실제 API 응답 `{ client, plainSecret }` 에 맞춰 정정
- [ ] `ClientCreateView` 의 결과 상태를 `created: { clientId, plainSecret }` 로 교체하고 `submit()` 을 새 응답 구조에 맞게 수정
- [ ] 결과 카드에 Client ID `CopyableField` 추가 (Secret 위, 보조 문구 포함)
- [ ] `ClientCreateView.spec.ts` 로 T-1/T-2/T-3 검증
- [ ] 4단계 검증 (lint / typecheck / test / build)
- [ ] 개발완료보고서 작성 및 develop 병합

## 검증 명령과 기대 결과

```bash
bun run lint       # 신규 경고·오류 없음
bun run typecheck  # 통과 (특히 clients.ts 타입 변경 여파 없음)
bun run test       # 전체 통과, 신규 ClientCreateView 테스트 3건 포함
bun run build      # 통과
```

## 리스크

| 리스크 | 대응 |
|---|---|
| `ClientCreatedResponse` 타입 변경이 다른 호출부를 깨뜨림 | 사용처는 `clients.ts` 정의부와 `ClientCreateView.vue` 뿐임을 확인했다. `typecheck` 로 재확인한다. |
| jsdom 에 `navigator.clipboard` 가 없어 복사 테스트 실패 | 테스트에서 `navigator.clipboard.writeText` 를 스텁으로 정의한다. |
