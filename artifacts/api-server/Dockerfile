# syntax=docker/dockerfile:1

# ── Stage 1: install & build ──────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /workspace

RUN corepack enable pnpm

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY lib/ ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/

# Install only production + build deps for the API server
RUN pnpm install --frozen-lockfile

# Build the API bundle
RUN pnpm --filter @workspace/api-server run build

# ── Stage 2: minimal runtime ──────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /workspace/artifacts/api-server/dist ./dist
COPY --from=builder /workspace/artifacts/api-server/package.json ./

RUN npm install --omit=dev --ignore-scripts 2>/dev/null || true

EXPOSE 8080
ENV PORT=8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/api/health/live || exit 1

CMD ["node", "dist/index.js"]
