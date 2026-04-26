---

---
# PendingRequestStore 영속성 개선 (Redis / PostgreSQL)

## 배경

현재 `oauth/authorize/` 모듈의 `PendingRequestStore`는 인메모리(Map)로 OAuth Authorization Code 흐름의 요청 상태를 임시 저장한다.
서버가 재시작되거나 인스턴스가 여러 대로 이중화되는 경우, 저장된 요청이 사라져 인증 흐름이 끊어진다.

## 문제

- 서버 재시작 시 진행 중인 모든 OAuth 요청 유실
- 수평 확장(다중 인스턴스) 시 인스턴스 간 상태 공유 불가
- 프로덕션 환경에서 가용성 보장 불가

## 목표

프로덕션 배포 전, `PendingRequestStore`의 저장소를 외부 영속 스토리지로 교체한다.

## 구현 방안

### 1안 — Redis (권장)

- TTL 기반 자동 만료 처리가 자연스럽게 맞아떨어짐
- 빠른 읽기/쓰기 성능
- `ioredis` 또는 `@nestjs/cache-manager` + `cache-manager-redis-store` 활용
- 환경변수로 Redis 접속 정보 주입 (`REDIS_URL` 등)

### 2안 — PostgreSQL (최소 요건)

- 별도 인프라 추가 없이 기존 DB 활용 가능
- `pending_oauth_requests` 테이블 신규 생성, `expires_at` 컬럼으로 만료 처리
- TypeORM 엔티티 및 마이그레이션 추가 필요
- 만료된 레코드 정리를 위한 스케줄러(`@nestjs/schedule`) 필요

## 작업 항목

- [ ] `PendingRequestStore` 인터페이스 추상화 (구현체 교체 가능하도록)
- [ ] Redis 구현체 작성 (`RedisPendingRequestStore`)
- [ ] 또는 PostgreSQL 구현체 + 엔티티 + 마이그레이션 작성
- [ ] 환경변수 설정 및 `.env.example` 업데이트
- [ ] 로컬 개발 환경에서는 기존 인메모리 구현체 유지 가능하도록 분기 처리

## 우선순위

프로덕션 이중화 전 반드시 완료.