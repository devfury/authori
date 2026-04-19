FROM oven/bun:1-alpine AS base
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM base AS development
COPY . .
CMD ["bun", "run", "start:dev"]

FROM base AS builder
COPY . .
RUN bun run build

FROM oven/bun:1-alpine AS production
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile
COPY --from=builder /app/dist ./dist
CMD ["bun", "dist/main.js"]
