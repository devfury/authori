# Authori API (NestJS) — Turborepo 모노레포용 Dockerfile
# build context 는 저장소 루트다: docker build -f apps/api/Dockerfile .
FROM oven/bun:1-alpine AS base
WORKDIR /app
# 워크스페이스 매니페스트만 먼저 복사해 의존성 레이어를 캐싱한다
COPY package.json bun.lock turbo.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN bun install --frozen-lockfile

FROM base AS development
COPY . .
WORKDIR /app/apps/api
CMD ["bun", "run", "dev"]

FROM base AS builder
COPY . .
RUN cd apps/api && bun run build

FROM oven/bun:1-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY package.json bun.lock turbo.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN bun install --production --frozen-lockfile
COPY --from=builder /app/apps/api/dist ./apps/api/dist
WORKDIR /app/apps/api
CMD ["bun", "dist/main.js"]
