# Porirua City Council — Garden Asset Management

## Overview

Full-stack garden asset management system for Porirua City Council (PCC). Built as a pnpm monorepo using TypeScript throughout. The frontend React prototype (Phase 0) is partially complete; the real backend infrastructure is now in place.

## Build Plan

| Phase | Focus | Status |
|-------|-------|--------|
| 0 | Architecture setup: DB schema, API contract, route scaffold | ✅ Complete |
| 1 | Core CRUD: assets, jobs, schedule generation, auth | Pending |
| 2 | Mobile worker app (Expo) + field workflows | Pending |
| 3 | Programmes (infill, mulching), audits, reporting | Pending |

## Stack

- **Monorepo**: pnpm workspaces
- **Node.js**: 24, TypeScript 5.9
- **API framework**: Express 5 + cookie-parser + CORS
- **Auth**: JWT (access token 15 min, refresh token 7 days) via httpOnly cookies + `jsonwebtoken` + `bcryptjs`
- **Database**: PostgreSQL + Drizzle ORM (helium host)
- **Validation**: `drizzle-zod` (DB layer) + Zod (route layer)
- **API codegen**: Orval — OpenAPI spec → Zod validators + React Query hooks
- **Build**: esbuild (CJS bundle for prod)

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
│   └── api-server/           # Express 5 API (the real backend)
│       ├── src/
│       │   ├── app.ts         # CORS, JSON, cookies, router mount at /api
│       │   ├── index.ts       # PORT binding
│       │   ├── routes/        # health, auth, assets, jobs, teams, audits
│       │   ├── middlewares/   # requireAuth, requireRole, validateBody, validateQuery
│       │   └── lib/           # password.ts (bcrypt helpers)
│       └── package.json
├── lib/
│   ├── api-spec/              # openapi.yaml (source of truth) + orval.config.ts
│   ├── api-client-react/      # Generated React Query hooks (via Orval)
│   ├── api-zod/               # Generated Zod validators (via Orval)
│   └── db/
│       ├── src/
│       │   ├── index.ts       # Drizzle client + Pool export
│       │   ├── seed.ts        # Seed script (run: pnpm --filter @workspace/db run seed)
│       │   └── schema/
│       │       ├── index.ts   # Barrel re-export
│       │       ├── enums.ts   # All pgEnum definitions
│       │       ├── teams.ts   # teams table
│       │       ├── users.ts   # users table
│       │       ├── assets.ts  # assets table (garden assets)
│       │       ├── jobs.ts    # jobs, reactive_jobs, job_photos tables
│       │       ├── audits.ts  # audits, audit_items tables
│       │       └── programmes.ts # infill_orders, mulching_records tables
│       ├── drizzle.config.ts
│       └── package.json
└── tsconfig.base.json         # composite, bundler moduleResolution, es2022
```

## Database Tables (all live in PostgreSQL)

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

## API Routes

All routes prefixed `/api/`. Protected routes require a valid JWT (cookie or Bearer header).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/healthz` | Public | Health check |
| POST | `/auth/login` | Public | Login → sets httpOnly cookies |
| POST | `/auth/logout` | Public | Clears cookies |
| GET | `/auth/me` | Auth | Current user |
| GET | `/assets` | Auth | List assets (paginated) |
| POST | `/assets` | Manager/Supervisor | Create asset |
| GET | `/assets/:id` | Auth | Get asset |
| PATCH | `/assets/:id` | Manager/Supervisor | Update asset |
| DELETE | `/assets/:id` | Manager | Soft delete |
| GET | `/jobs` | Auth | List scheduled jobs |
| POST | `/jobs` | Manager/Supervisor | Create job |
| GET | `/jobs/:id` | Auth | Get job |
| PATCH | `/jobs/:id` | Auth | Update job (status, completion) |
| GET | `/reactive-jobs` | Auth | List reactive jobs |
| POST | `/reactive-jobs` | Auth | Raise reactive job |
| PATCH | `/reactive-jobs/:id` | Auth | Update reactive job |
| GET | `/teams` | Auth | List teams |
| POST | `/teams` | Manager | Create team |
| GET | `/teams/:id/members` | Auth | Team members |
| GET | `/audits` | Auth | List audits |
| POST | `/audits` | Manager/Supervisor/TL | Create audit |
| GET | `/audits/:id` | Auth | Get audit + items |
| PATCH | `/audits/:id` | Manager/Supervisor/TL | Update audit |
| POST | `/audits/:id/items` | Auth | Add audit item |

## Key Workflows

### Codegen (after OpenAPI spec change)
```bash
cd lib/api-spec && pnpm exec orval
pnpm run typecheck:libs
```

### Schema push (after Drizzle schema change)
```bash
pnpm --filter @workspace/db run push
# or force:
pnpm --filter @workspace/db run push-force
```

### Seed database
```bash
pnpm --filter @workspace/db run seed
```

### Typecheck everything
```bash
pnpm run typecheck
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` (`composite: true`, `moduleResolution: bundler`). Always typecheck from root — `pnpm run typecheck` runs `tsc --build` which resolves cross-package references correctly. `emitDeclarationOnly` — only `.d.ts` files are emitted; JS bundling is via esbuild/tsx/vite.

When a package A depends on package B, A's `tsconfig.json` must list B in `references`. Run `pnpm run typecheck:libs` first, then `pnpm run typecheck` for full check.

## Notes

- `lib/db/src/seed.ts` is excluded from the db package's tsconfig (it's run directly with tsx, never compiled to d.ts)
- `lib/api-zod/src/index.ts` exports only from `./generated/api` — the types folder is not re-exported to avoid name collisions (Orval generates both Zod schemas and TS interfaces with the same names)
- `validateBody` / `validateQuery` in api-server use duck-typed schema interface (not importing `ZodSchema` from zod) to be compatible with both drizzle-zod and standard Zod schemas
- Soft deletes on assets — `isActive: false` rather than hard DELETE
