# Authori Web (Vue 3) — Turborepo 모노레포용 Dockerfile
# build context 는 저장소 루트다: docker build -f apps/web/Dockerfile .
FROM oven/bun:1-alpine AS build
WORKDIR /app

# 워크스페이스 매니페스트만 먼저 복사해 의존성 레이어를 캐싱한다
COPY package.json bun.lock turbo.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN bun install --frozen-lockfile

COPY . .

ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN cd apps/web && bun run build

FROM nginx:1.29-alpine AS runtime

COPY --from=build /app/apps/web/dist /usr/share/nginx/html

ENV API_BASE_URL=http://localhost:3000

COPY apps/web/nginx/default.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 80
