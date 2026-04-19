FROM oven/bun:1-alpine AS build

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

RUN bun run build

FROM nginx:1.29-alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html

ENV API_BASE_URL=http://localhost:3000

COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 80
