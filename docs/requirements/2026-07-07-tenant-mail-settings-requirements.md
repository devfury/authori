# 요구사항정의서 — 메일 발신자·개발용 리다이렉트 테넌트별 설정

- 작성일: 2026-07-07
- 작성자: Jinho Lee
- 상태: 초안 (승인 대기)

## 1. 문제 정의

현재 가입 이메일 인증 메일의 **발신자 주소(`from`)** 와 **개발용 강제 수신자(dev redirect)** 는
전역 환경변수(`SMTP_FROM`, `SMTP_DEV_REDIRECT_TO`)로만 설정된다(`apps/api/src/common/config/app.config.ts`).

- 멀티테넌트 서비스임에도 모든 테넌트가 동일한 발신자 주소를 사용할 수밖에 없다.
- 개발용 리다이렉트 주소도 배포 단위 전역 값이라 테넌트별로 다르게 지정할 수 없다.
- 환경변수 기반이라 운영 중 값 변경 시 재배포가 필요하다.

## 2. 목표

- 인증 메일 발신자 주소를 **테넌트별로** 설정 가능하게 한다.
- 개발용 강제 수신자(dev redirect)를 **테넌트별로** 설정 가능하게 한다.
- 개발용 강제 수신자 설정은 **`NODE_ENV=production` 환경에서는 설정할 수 없어야 하며 관리 UI에 노출되지 않아야 한다.**

## 3. 기능 요구사항

| ID | 요구사항 |
|----|----------|
| FR-1 | `TenantSettings`에 발신자 주소(`mailFrom`)와 개발용 강제 수신자(`mailDevRedirectTo`) 필드를 추가한다. |
| FR-2 | 인증 메일 발송 시 해당 테넌트의 `mailFrom`을 발신자로 사용한다. |
| FR-3 | 테넌트에 `mailFrom`이 설정되지 않은 경우 하드코딩 기본값 `Authori <no-reply@authori.local>`을 사용한다. |
| FR-4 | 인증 메일 발송 시 `NODE_ENV=development`이고 해당 테넌트의 `mailDevRedirectTo`가 설정된 경우, 실제 수신자를 이 주소로 강제 변경한다(기존 dev 게이트 유지). |
| FR-5 | 전역 환경변수 `SMTP_FROM`, `SMTP_DEV_REDIRECT_TO`를 완전히 제거한다(`app.config.ts`, `.env`, `.env.example` 및 관련 문서). 그 외 `SMTP_*`(host/port/user/pass/secure/tls)는 전역 유지한다. |
| FR-6 | `NODE_ENV=production`이면 테넌트 설정 저장 API에서 `mailDevRedirectTo` 필드를 무시하여 저장하지 않는다. |
| FR-7 | 관리 웹 UI는 `NODE_ENV=production`일 때 `mailDevRedirectTo` 입력 필드를 렌더링하지 않는다. UI의 production 판단은 **백엔드가 내려주는 플래그**를 기준으로 한다. |
| FR-8 | `mailFrom`은 production/development 모두에서 정상적으로 노출·편집 가능하다. |

## 4. 비기능 요구사항

- **하위호환**: 기존 테넌트는 두 필드가 비어 있는 상태로 마이그레이션되며, `mailFrom` 미설정 시 기본값으로 동작한다.
- **보안**: production에서 dev redirect가 실 사용자 메일을 가로채는 사고를 원천 차단한다(UI 숨김 + 저장 거부 + send 시점 dev 게이트의 3중 방어).
- **일관성**: production 판단은 서버 실제 `NODE_ENV` 기준으로 단일화한다(프론트 빌드 플래그 아님).

## 5. 제외 범위 (Out of Scope)

- 전역 SMTP 접속 정보(host/port/user/pass/secure/tls)의 테넌트별 설정.
- 인증 메일 외 다른 메일 종류.
- 조회 응답에서 `mailDevRedirectTo` 값 자체를 제외하는 처리(요구되지 않음 — production에서는 어차피 값이 설정될 수 없음).

## 6. 성공 기준

- 서로 다른 테넌트가 각기 다른 발신자 주소로 인증 메일을 받는다.
- development 환경에서 테넌트별 dev redirect가 동작한다.
- production 환경에서 관리 UI에 dev redirect 입력이 보이지 않고, 해당 필드를 담아 저장 요청을 보내도 저장되지 않는다.
- `SMTP_FROM`/`SMTP_DEV_REDIRECT_TO` 환경변수가 없어도 기존 발송 흐름이 정상 동작한다.
- `bun run lint && bun run typecheck && bun run test && bun run build` 통과.
