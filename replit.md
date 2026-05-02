# Porirua City Council — Garden Asset Management

## Overview

Full-stack garden asset management system for Porirua City Council (PCC). Built as a pnpm monorepo using TypeScript throughout.

## Build Plan

| Phase | Focus | Status |
|-------|-------|--------|
| 0 | Architecture setup: DB schema, API contract, route scaffold | ✅ Complete |
| 1 | Core CRUD: assets, jobs, schedule generation, auth + React web app | ✅ Complete |
| 2 | Mobile worker app (Expo) + field workflows | ✅ Complete |
| 3 | Programmes (infill, mulching), audits, reporting | ✅ Complete |
| 4 | Enterprise: audit trail, security hardening, health endpoints, Sentry, Vitest tests, CI/CD, Azure IaC, DB backup | ✅ Complete |

## Stack

- **Monorepo**: pnpm workspaces
- **Node.js**: 24, TypeScript 5.9
- **API framework**: Express 5 + helmet + express-rate-limit + cookie-parser + CORS
- **Auth**: JWT (access token 15 min, refresh token 7 days) via httpOnly cookies + `jsonwebtoken` + `bcryptjs`
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: `drizzle-zod` (DB layer) + Zod (route layer)
- **API codegen**: Orval — OpenAPI spec → Zod validators + React Query hooks
- **Build**: esbuild (CJS bundle for prod)
- **Error monitoring**: Sentry (opt-in via `SENTRY_DSN` / `VITE_SENTRY_DSN` env vars)
- **Testing**: Vitest (unit) + Playwright (E2E)
- **CI/CD**: GitHub Actions (ci.yml + deploy.yml)
- **Infrastructure**: Azure Bicep (`infra/main.bicep`), Docker Compose

## Domain Reference

**Garden types**: annuals, roses_perennials, ornamental, amenity, rain_garden, reveg, bush, tree_planter_pits, hedge  
**Teams**: CBD, Mobile 1, Mobile 2, Specialist  
**Wards**: Eastern, Northern, Western  
**Frequencies**: weekly, fortnightly, monthly, bimonthly, quarterly  
**Roles**: manager, supervisor, team_leader, field_worker  

**Seed accounts** (password: `Porirua2024!`):
- `daniela.biaggio@poriruacity.govt.nz` — manager (desktop user)
- `barry.lavakula@poriruacity.govt.nz` — field_worker (mobile user)

**Brand**: teal `#00AECD`, sidebar `#0f2a36`

## Structure

```text
├── artifacts/
│   ├── api-server/           # Express 5 API
│   │   ├── src/
│   │   │   ├── app.ts         # Security middleware, rate limiting, CORS, Sentry
│   │   │   ├── index.ts       # PORT binding
│   │   │   ├── routes/        # health, auth, assets, jobs, teams, audits, audit-log, dashboard, schedule
│   │   │   ├── middlewares/   # requireAuth, requireRole, validateBody, validateQuery
│   │   │   └── lib/           # password.ts, audit.ts, sentry.ts
│   │   ├── src/__tests__/     # Vitest unit tests (health, audit, auth-middleware)
│   │   ├── vitest.config.ts
│   │   └── Dockerfile
│   ├── field-ops/            # Expo React Native mobile app (Barry's field app)
│   │   ├── app/
│   │   │   ├── _layout.tsx      # Root layout: AuthProvider, setBaseUrl, Stack nav
│   │   │   ├── index.tsx        # Auth-based redirect (→ login or tabs)
│   │   │   ├── login.tsx        # Login screen (bearer token, SecureStore)
│   │   │   ├── (tabs)/
│   │   │   │   ├── _layout.tsx  # 4 tabs: Today/Assets/Report/Me (NativeTabs + BlurView)
│   │   │   │   ├── index.tsx    # Today's jobs (via /schedule/week, navy header)
│   │   │   │   ├── assets.tsx   # Asset browser (search, live API)
│   │   │   │   ├── report.tsx   # Raise reactive job form (modal pickers)
│   │   │   │   └── me.tsx       # Profile + sign out
│   │   │   └── job/[id].tsx     # Job detail: info tiles, task checklist, Start/Complete/Skip
│   │   ├── components/
│   │   │   ├── StatusBadge.tsx  # Colour-coded status pill
│   │   │   ├── JobCard.tsx      # Tappable job card (→ job detail)
│   │   │   └── EmptyState.tsx   # Empty state with icon + text
│   │   ├── context/auth.tsx     # AuthContext + SecureStore token persistence
│   │   ├── constants/colors.ts  # PCC brand tokens (teal/navy, light + dark)
│   │   └── metro.config.js      # @sentry/node tmp-dir blockList fix
│   └── web-app/              # React + Vite + Tailwind + shadcn/ui (desktop)
│       ├── src/
│       │   ├── App.tsx        # Wouter router + AuthProvider + QueryClient
│       │   ├── main.tsx       # Sentry init + React root mount
│       │   ├── lib/
│       │   │   ├── auth.tsx   # AuthContext + useAuth hook (JWT cookie auth)
│       │   │   └── sentry.ts  # Frontend Sentry init (VITE_SENTRY_DSN)
│       │   ├── components/
│       │   │   ├── layout.tsx # Sidebar nav (role-filtered: Audit Log manager/supervisor only)
│       │   │   └── ui/        # shadcn/ui components
│       │   └── pages/
│       │       ├── login.tsx
│       │       ├── dashboard.tsx
│       │       ├── assets/index.tsx, new.tsx
│       │       ├── schedule.tsx
│       │       ├── jobs.tsx
│       │       ├── reactive-jobs.tsx
│       │       ├── audits/index.tsx
│       │       ├── programmes/index.tsx
│       │       ├── reports.tsx
│       │       └── audit-log/index.tsx   # Immutable change log viewer (manager/supervisor)
│       ├── nginx.conf         # Production nginx config with security headers
│       ├── Dockerfile
│       └── vite.config.ts     # Proxy /api → :8080
├── lib/
│   ├── api-spec/              # openapi.yaml (source of truth) + orval.config.ts
│   ├── api-client-react/      # Generated React Query hooks (via Orval)
│   ├── api-zod/               # Generated Zod validators (via Orval)
│   └── db/
│       ├── src/
│       │   ├── index.ts       # Drizzle client + Pool export
│       │   ├── seed.ts        # Seed script
│       │   └── schema/
│       │       ├── index.ts
│       │       ├── enums.ts
│       │       ├── teams.ts
│       │       ├── users.ts
│       │       ├── assets.ts
│       │       ├── jobs.ts
│       │       ├── audits.ts
│       │       ├── programmes.ts
│       │       └── audit-log.ts   # audit_log table (immutable change trail)
│       ├── drizzle.config.ts
│       └── package.json
├── .github/
│   └── workflows/
│       ├── ci.yml             # Typecheck + unit tests + build on every PR/push
│       └── deploy.yml         # Build → push Docker images → deploy to Azure App Service
├── infra/
│   ├── main.bicep             # Azure: ACR, App Service Plan, API + Web App, PostgreSQL Flexible Server
│   └── parameters.prod.json   # Production parameters (secrets from Key Vault)
├── scripts/
│   ├── backup-db.ts           # pg_dump + optional Azure Blob upload
│   └── restore-db.ts          # Restore from gzip dump
├── docker-compose.yml         # Local full-stack: db + api + web
└── tsconfig.base.json
```

## Database Tables

| Table | Purpose |
|-------|---------|
| `teams` | CBD / Mobile 1 / Mobile 2 / Specialist |
| `users` | Staff with roles, bcrypt password hash |
| `assets` | Garden assets (GRD-YYYY-XXXX reference) |
| `jobs` | Scheduled maintenance jobs |
| `reactive_jobs` | Ad-hoc reactive jobs raised by workers |
| `job_photos` | Photo evidence linked to jobs |
| `audits` | Quality audit records |
| `audit_items` | Individual audit criteria results |
| `infill_orders` | Infill planting orders |
| `mulching_records` | Mulching programme records |
| `audit_log` | **Immutable** change trail for all write operations (INSERT/UPDATE/DELETE) |

## API Routes

All routes prefixed `/api/`. Protected routes require a valid JWT (cookie or Bearer header).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health/live` | Public | Liveness probe |
| GET | `/health/ready` | Public | Readiness probe (checks DB) |
| GET | `/health` | Public | Full health (version, uptime, db latency) |
| GET | `/healthz` | Public | Legacy health check |
| POST | `/auth/login` | Public | Login → sets httpOnly cookies |
| POST | `/auth/logout` | Public | Clears cookies |
| GET | `/auth/me` | Auth | Current user |
| GET | `/dashboard/summary` | Auth | Dashboard metrics |
| GET | `/assets` | Auth | List assets (paginated) |
| POST | `/assets` | Manager/Supervisor | Create asset + audit log |
| GET | `/assets/:id` | Auth | Get asset |
| PATCH | `/assets/:id` | Manager/Supervisor | Update asset + audit log |
| DELETE | `/assets/:id` | Manager | Soft delete + audit log |
| GET | `/jobs` | Auth | List scheduled jobs |
| POST | `/jobs` | Manager/Supervisor | Create job + audit log |
| PATCH | `/jobs/:id` | Auth | Update job + audit log |
| GET | `/reactive-jobs` | Auth | List reactive jobs |
| POST | `/reactive-jobs` | Auth | Raise reactive job + audit log |
| PATCH | `/reactive-jobs/:id` | Auth | Update reactive job + audit log |
| GET | `/teams` | Auth | List teams |
| GET | `/teams/:id/members` | Auth | Team members |
| POST | `/schedule/generate` | Manager/Supervisor | Generate scheduled jobs |
| GET | `/schedule/week` | Auth | Jobs grouped by day |
| GET | `/audits` | Auth | List audits |
| POST | `/audits` | Manager/Supervisor/TL | Create audit + audit log |
| PATCH | `/audits/:id` | Manager/Supervisor/TL | Update audit + audit log |
| POST | `/audits/:id/items` | Auth | Add audit item |
| GET | `/audit-log` | Manager/Supervisor | Query the immutable audit trail |

## Security (Phase 4)

- **Helmet** — sets 11 security headers (HSTS, X-Frame-Options, nosniff, etc.)
- **Rate limiting** — 300 req/15 min general; 10 req/15 min on auth routes (failed attempts only)
- **Body limit** — 1 MB hard cap on JSON/URL-encoded bodies
- **CORS** — env-var controlled (`ALLOWED_ORIGINS`); allows all in dev
- **Trust proxy** — `app.set('trust proxy', 1)` for accurate IP behind Replit/Azure proxy
- **Sentry** — opt-in via `SENTRY_DSN` (API) / `VITE_SENTRY_DSN` (web) env vars

## Testing (Phase 4)

```bash
# Unit tests
pnpm --filter @workspace/api-server run test

# With coverage
pnpm --filter @workspace/api-server run test:coverage
```

3 test files / 11 tests:
- `health.test.ts` — liveness, readiness (db up/down), legacy healthz
- `audit.test.ts` — auditLog() inserts correctly, swallows db errors
- `auth-middleware.test.ts` — requireAuth (valid/missing/invalid), requireRole (pass/fail)

## Mobile Auth Flow (field-ops)

- Login: POST /api/auth/login → `{ user, accessToken }` → stored in `expo-secure-store`
- `setAuthTokenGetter` registered at module load (context/auth.tsx)
- `setBaseUrl(...)` called in `app/_layout.tsx`
- Web app auth: `credentials: 'include'` (httpOnly cookies)

## Key Workflows

### Codegen (after OpenAPI spec change)
```bash
cd lib/api-spec && pnpm exec orval
pnpm run typecheck:libs
```

### Schema push (after Drizzle schema change)
```bash
pnpm --filter @workspace/db run push
```

### Seed database
```bash
pnpm --filter @workspace/db run seed
```

### Typecheck everything
```bash
pnpm run typecheck
```

### DB backup
```bash
DATABASE_URL=postgresql://... tsx scripts/backup-db.ts
# With Azure Blob upload:
DATABASE_URL=... AZURE_STORAGE_CONNECTION_STRING=... AZURE_BACKUP_CONTAINER=db-backups tsx scripts/backup-db.ts
```

### Azure deployment
```bash
# Provision infrastructure (first time)
az deployment group create \
  --resource-group pcc-gardens-prod \
  --template-file infra/main.bicep \
  --parameters @infra/parameters.prod.json

# CI/CD: push to main → GitHub Actions ci.yml + deploy.yml run automatically
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` (`composite: true`, `moduleResolution: bundler`). Always typecheck from root — `pnpm run typecheck` runs `tsc --build`.

`@opentelemetry/api` is pinned via pnpm override to prevent drizzle-orm dual-version issues caused by `@sentry/node` pulling different peer dep resolutions.

## Notes

- `audit_log` writes are fire-and-forget (errors are logged but don't fail the request)
- `Audit Log` sidebar nav item is only shown to `manager` and `supervisor` roles
- Soft deletes on assets — `isActive: false` rather than hard DELETE
- `lib/db/src/seed.ts` excluded from db tsconfig (run directly with tsx)
- `validateBody`/`validateQuery` use duck-typed schema interface for drizzle-zod + Zod compatibility
