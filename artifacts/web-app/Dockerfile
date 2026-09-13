# syntax=docker/dockerfile:1

# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /workspace

RUN corepack enable pnpm && corepack prepare pnpm@10 --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY lib/ ./lib/
COPY artifacts/web-app/ ./artifacts/web-app/

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/web-app run build

# ── Stage 2: nginx serving ────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

COPY --from=builder /workspace/artifacts/web-app/dist/public /usr/share/nginx/html
COPY artifacts/web-app/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://localhost/ || exit 1
