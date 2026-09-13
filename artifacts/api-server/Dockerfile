# syntax=docker/dockerfile:1

# ── Stage 1: install & build ──────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /workspace

RUN corepack enable pnpm && corepack prepare pnpm@10 --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY lib/ ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/

# Install only production + build deps for the API server
RUN pnpm install --frozen-lockfile

# Build the API bundle
RUN pnpm --filter @workspace/api-server run build
RUN pnpm --filter @workspace/api-server deploy --prod --legacy /runtime
RUN rm -rf /runtime/dist && cp -R /workspace/artifacts/api-server/dist /runtime/dist

# ── Stage 2: minimal runtime ──────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /runtime ./

# Fail the image build before release if the report module or sharp's native
# runtime cannot load and process an image in this final production stage.
RUN node dist/check-report-runtime.cjs

EXPOSE 8080
ENV PORT=8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/api/health/live || exit 1

CMD ["node", "dist/index.cjs"]
