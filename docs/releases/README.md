# 릴리스 노트 인덱스

> **Status:** Approved
> **Owner:** Jinho Lee
> **Created:** 2026-11-24
> **Updated:** 2026-11-24
> **Related:** [AGENTS.md 「릴리스 노트 (태그마다 한 번)」](../../AGENTS.md) · [docs/README.md](../README.md)

git 태그 하나에 노트 파일 하나를 둔다. 노트는 한 번만 쓰고, 이 인덱스만 릴리스마다 갱신한다.
노트는 1.4.1 부터 쓴다. 그 이전 태그(1.4.0 까지)는 노트가 없으며 `git log` 가 근거다.

## 한눈에 보기

| 구간 | 노트가 있는 태그 수 | 주요 흐름 |
| --- | --- | --- |
| 1.4.x | 1 | web 런타임 이미지(nginx) 보안 갱신 |

## 1.4.x

1.4.0 은 DB 접속 정보를 `DATABASE_URL` 단일 변수로 바꾼 버전이다(노트 없음). 1.4.1 은 그 위에 web 이미지의 nginx 베이스만 올린 보안 패치다.

- [1.4.1](2026-11-24-1.4.1-release-notes.md) — web 이미지 nginx `1.30.8-alpine` 으로 상향(CVE 대응)
