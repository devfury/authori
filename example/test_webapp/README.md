# test_webapp

Authori 인증 서버 연동 예시용 Vite + Vue + TypeScript 웹앱입니다.

## 목적

- 테넌트 슬러그 `test` 기준으로 OAuth2 Authorization Code + PKCE 흐름을 테스트합니다.
- 로그인 시작, callback 처리, 토큰 교환, `userinfo` 조회까지 한 화면에서 확인할 수 있습니다.

## 실행

```bash
npm install
npm run dev
```

## 기본 가정

- 인증 서버는 `http://localhost:3000` 에서 실행 중
- authorize endpoint: `/t/test/oauth/authorize`
- token endpoint: `/t/test/oauth/token`
- userinfo endpoint: `/t/test/oauth/userinfo`

앱 실행 후 화면에서 `Auth Server Base URL`, `Client ID`, `Scope`를 필요에 따라 조정할 수 있습니다.
