# 개발 산출물 관리 체계

이 디렉터리는 프로젝트 개발 산출물을 SDLC 단계별로 보관하고 추적하는 문서 저장소다. `docs/software-engineering/sdlc-phases.md`의 6단계 흐름을 기준으로 요구사항, 설계, 구현 계획, 검증, 배포, 운영 산출물이 서로 끊기지 않도록 관리한다.

## 기본 원칙

- **단일 출처**: 확정된 요구사항, 설계 결정, 검증 결과는 이 디렉터리에 문서로 남긴다.
- **추적 가능성**: 구현 계획은 요구사항/설계 문서를, 리뷰와 테스트 결과는 구현 계획을 링크한다.
- **작은 단위 갱신**: 스프린트, 기능, 결함 단위로 문서를 작성하고 상태를 갱신한다.
- **검증 우선**: 계획 문서에는 완료 기준과 검증 명령을 포함하고, 리뷰 문서에는 실제 실행 결과를 기록한다.
- **운영 환류**: 장애, 개선 요청, 운영 데이터는 백로그 또는 다음 요구사항 분석 문서로 연결한다.

## 디렉터리 구조

| 경로 | SDLC 단계 | 관리 대상 |
| --- | --- | --- |
| `software-engineering/` | 공통 기준 | SDLC, 개발 프로세스, 문서 작성 규칙 |
| `requirements/` | 1. 요구사항 분석 | SRS, 사용자 시나리오, 기능 요구사항, 비기능 요구사항 |
| `specs/` | 2. 시스템 및 소프트웨어 설계 | 시스템 아키텍처, API/데이터/보안 설계, UI/UX 명세 |
| `adr/` | 2. 시스템 및 소프트웨어 설계 | 되돌리기 어려운 기술 의사결정 기록 |
| `design/` | 2. 시스템 및 소프트웨어 설계 | 화면 초안, 프로토타입, 디자인 산출물 |
| `plans/` | 3. 구현 및 개발 | 기능별 구현 계획, 작업 분해, 완료 기준 |
| `reviews/` | 3-4. 구현 및 테스트 | 코드/계획 리뷰, QA 결과, 수동 검증 기록 |
| `qa/` | 4. 품질 보증 및 테스트 | 테스트 시나리오, 결함 리포트, 회귀 테스트 체크리스트 |
| `releases/` | 5. 배포 | 릴리스 노트, 배포 체크리스트, 배포 로그 |
| `runbooks/` | 5-6. 배포 및 운영 | 배포/복구/장애 대응 절차 |
| `operations/` | 6. 유지보수 및 운영 | 장애 분석, 모니터링 리뷰, 운영 개선 백로그 |

현재 없는 디렉터리는 해당 산출물이 처음 필요해지는 PR에서 생성한다. 비어 있는 디렉터리 유지를 위한 placeholder 파일은 만들지 않는다.

## SDLC 단계별 산출물

### 1. 요구사항 분석

요구사항 문서는 "무엇을 왜 만드는가"를 설명한다. 기능 구현 전에 작성하고, 이후 설계와 계획 문서가 이 문서를 참조한다.

권장 위치:

- `docs/requirements/YYYY-MM-DD-<topic>-requirements.md`
- `docs/requirements/YYYY-MM-DD-<topic>-user-scenarios.md`

포함 항목:

- 문제 정의와 목표
- 사용자/역할/권한 범위
- 기능 요구사항과 비기능 요구사항
- 제외 범위
- 성공 기준과 우선순위

### 2. 시스템 및 소프트웨어 설계

설계 문서는 요구사항을 구현 가능한 구조로 바꾼다. API, 데이터, 보안, UI, 인프라처럼 구현자가 따라야 할 제약과 결정을 명확히 남긴다.

권장 위치:

- `docs/specs/YYYY-MM-DD-<topic>-spec.md`
- `docs/specs/YYYY-MM-DD-<topic>-architecture.md`
- `docs/adr/NNNN-<decision>.md`
- `docs/design/<topic>.html` 또는 `docs/design/YYYY-MM-DD-<topic>.md`

포함 항목:

- 범위와 비범위
- 아키텍처/데이터/API/UI 설계
- 보안, 성능, 운영 제약
- 대안과 채택 근거
- 관련 요구사항 링크

ADR은 다음 조건 중 하나에 해당할 때 작성한다.

- 기술 스택, 데이터 격리, 인증 방식처럼 변경 비용이 큰 결정
- 운영 복잡도나 보안 리스크에 영향을 주는 결정
- 팀이 반복해서 같은 선택지를 다시 논의할 가능성이 높은 결정

### 3. 구현 및 개발

계획 문서는 "어떤 파일을 어떤 순서로 바꾸고 어떻게 검증할지"를 정의한다. 개발 에이전트와 리뷰어가 같은 기준으로 작업하도록 구체적으로 작성한다.

권장 위치:

- `docs/plans/YYYY-MM-DD-<topic>-plan.md`

포함 항목:

- Goal, Architecture, Tech Stack
- In scope / Out of scope
- 사전 상태
- 변경 파일 목록
- 작업 단계 체크리스트
- 검증 명령과 기대 결과
- 리스크와 주의사항

구현 중 계획이 달라지면 코드만 바꾸지 말고 계획 문서도 함께 갱신한다. 계획과 구현이 어긋난 상태로 리뷰를 요청하지 않는다.

### 4. 품질 보증 및 테스트

리뷰와 QA 문서는 "요구사항과 계획을 실제로 만족했는가"를 기록한다. 자동 테스트만으로 부족한 흐름은 수동 검증 결과를 남긴다.

권장 위치:

- `docs/reviews/YYYY-MM-DD-<topic>-review.md`
- `docs/qa/YYYY-MM-DD-<topic>-test-scenarios.md`
- `docs/qa/YYYY-MM-DD-<topic>-bug-report.md`

포함 항목:

- 검토 대상 브랜치/커밋/계획 문서
- 발견 사항과 심각도
- 실행한 검증 명령
- 수동 검증 시나리오와 결과
- 남은 리스크 또는 후속 작업

리뷰 문서는 결론보다 발견 사항을 먼저 쓴다. 문제가 없을 때도 "발견 사항 없음"과 검증 범위를 명시한다.

### 5. 배포

배포 산출물은 운영 환경에 무엇이 언제 어떻게 반영됐는지를 남긴다. 배포 실패 시 되돌릴 수 있도록 절차와 확인 기준을 포함한다.

권장 위치:

- `docs/releases/YYYY-MM-DD-<version-or-topic>-release-notes.md`
- `docs/releases/YYYY-MM-DD-<version-or-topic>-deployment-log.md`
- `docs/runbooks/<topic>-runbook.md`

포함 항목:

- 배포 대상 버전과 커밋
- 포함 기능, 수정, 마이그레이션
- 배포 전후 체크리스트
- 롤백 조건과 절차
- 운영 확인 결과

### 6. 유지보수 및 운영

운영 문서는 배포 이후의 실제 문제, 개선 요구, 모니터링 결과를 다음 개발 사이클로 되돌리는 연결점이다.

권장 위치:

- `docs/operations/YYYY-MM-DD-<incident>-incident-report.md`
- `docs/operations/YYYY-MM-DD-<topic>-ops-review.md`
- `docs/operations/YYYY-MM-DD-<topic>-improvement-backlog.md`

포함 항목:

- 발생 시각, 영향 범위, 원인
- 탐지 경로와 대응 타임라인
- 재발 방지 조치
- 후속 요구사항/계획 문서 링크

## 파일명 규칙

문서 파일명은 검색과 정렬을 위해 다음 형식을 따른다.

```text
YYYY-MM-DD-<topic>-<artifact-type>.md
```

예시:

- `2026-05-31-api-prefix-and-swagger-plan.md`
- `2026-05-31-api-prefix-and-swagger-review.md`
- `2026-06-03-ticket-sla-policy-spec.md`

규칙:

- 날짜는 문서 최초 작성일을 사용한다.
- `<topic>`은 소문자 kebab-case로 쓴다.
- `<artifact-type>`은 `requirements`, `spec`, `architecture`, `plan`, `review`, `test-scenarios`, `bug-report`, `release-notes`, `runbook`, `incident-report` 중 하나를 우선 사용한다.
- 같은 주제의 후속 개정은 파일명을 바꾸기보다 문서 상단의 `Status`, `Updated`, 변경 이력을 갱신한다.

## 문서 상태값

문서 상단에는 가능하면 다음 메타데이터를 둔다.

```markdown
> **Status:** Draft | Review | Approved | Superseded
> **Owner:** <name-or-role>
> **Created:** YYYY-MM-DD
> **Updated:** YYYY-MM-DD
> **Related:** <links>
```

상태 의미:

| 상태 | 의미 |
| --- | --- |
| `Draft` | 작성 중이며 구현 기준으로 사용하기 전 |
| `Review` | 리뷰 요청 또는 검토 중 |
| `Approved` | 현재 구현/운영 기준으로 사용 |
| `Superseded` | 새 문서나 결정으로 대체됨 |

`Superseded` 처리 시에는 대체 문서 링크를 반드시 남긴다.

## 추적성 규칙

산출물 사이의 흐름은 다음을 기본으로 한다.

```text
requirements -> specs / adr / design -> plans -> reviews / qa -> releases / runbooks -> operations -> requirements
```

문서 작성 시 최소 링크 기준:

- `specs/` 문서는 관련 `requirements/` 또는 상위 계획 문서를 링크한다.
- `plans/` 문서는 관련 `requirements/`, `specs/`, `adr/`를 링크한다.
- `reviews/` 문서는 검토한 `plans/`와 브랜치/커밋을 명시한다.
- `releases/` 문서는 포함된 PR/커밋, 검증 결과, 관련 리뷰를 링크한다.
- `operations/` 문서는 후속 요구사항, 계획, 릴리스 문서로 이어지는 링크를 남긴다.

## 변경 절차

1. 새 기능이나 큰 변경은 요구사항 또는 설계 문서부터 작성한다.
2. 구현 전 `plans/`에 작업 단위와 검증 기준을 남긴다.
3. 구현 PR에는 관련 문서 링크를 포함한다.
4. 리뷰 또는 QA 후 `reviews/`나 `qa/`에 실제 검증 결과를 기록한다.
5. 배포 시 `releases/`와 필요한 `runbooks/`를 갱신한다.
6. 운영 중 발견된 문제는 `operations/`에 기록하고 다음 요구사항/계획으로 연결한다.

문서가 코드와 함께 변경되어야 하는 경우, 같은 브랜치와 같은 PR에서 함께 수정한다. 문서만 먼저 확정해야 하는 경우에는 문서 전용 브랜치로 리뷰를 받는다.

## 품질 체크리스트

문서 PR을 올리기 전에 다음을 확인한다.

- 문서가 적절한 SDLC 단계 디렉터리에 있는가?
- 파일명이 날짜, 주제, 산출물 유형을 드러내는가?
- 범위와 비범위가 분리되어 있는가?
- 관련 요구사항, 설계, 계획, 리뷰 링크가 있는가?
- 완료 기준과 검증 방법이 구체적인가?
- 오래된 문서를 대체했다면 `Superseded`와 대체 링크를 남겼는가?
- 민감정보, 운영 비밀, 실제 인증 정보가 포함되지 않았는가?

## 보안 및 민감정보

문서에는 실제 비밀번호, 토큰, 쿠키, 개인식별정보, 환자정보, 운영 인증 정보를 기록하지 않는다. 예시는 더미 값으로 작성하고, 운영 값은 비밀 관리 도구 또는 배포 환경 설정에서 관리한다. 장애 분석이나 로그 예시가 필요할 때는 식별 가능한 값을 마스킹한다.
