# Threat Model

## Project Overview

Porirua City Council’s garden asset management system is a TypeScript pnpm monorepo with a public Express API (`artifacts/api-server`), a React web application (`artifacts/web-app`), and an Expo mobile worker app (`artifacts/field-ops`). Production trust is concentrated in the API: it authenticates users with JWTs, stores business and staff data in PostgreSQL, serves uploaded work evidence, and exposes scheduling, asset, audit, reporting, and workforce-management endpoints.

This scan assumes production traffic is protected by platform TLS, `NODE_ENV` is `production`, and only production-reachable surfaces matter. Local build scripts, Expo bundling helpers, and mock/dev-only tooling are out of scope unless there is evidence they are reachable from the deployed app.

## Assets

- **User accounts and roles** — staff identities, password hashes, JWT claims, and role assignments. Compromise allows impersonation or privilege escalation into manager or administrator capabilities.
- **Operational asset and schedule data** — site locations, work schedules, reactive jobs, team assignments, and completion history. Unauthorized tampering can disrupt council operations and falsify maintenance records.
- **Audit and evidence records** — audit responses, audit PDFs, photo uploads, and immutable audit-log entries. These records are relied on for oversight and quality assurance, so integrity and confidentiality matter.
- **Staff directory and workforce data** — names, emails, team membership, leave/availability data, and workload planning. Exposure affects privacy and can aid internal targeting.
- **Application secrets** — JWT signing key, database credentials, Sentry DSNs, and any deployment secrets. Secret compromise would undermine authentication or backend integrity.

## Trust Boundaries

- **Browser/mobile client to API** — all route parameters, JSON bodies, cookies, and bearer tokens are untrusted until validated server-side.
- **API to PostgreSQL** — the API has broad write access to operational data; injection or authorization flaws at the API layer translate directly into database compromise.
- **Public internet to deployed app** — the deployment is public, so any route not explicitly protected should be treated as internet reachable.
- **Authenticated user to privileged roles** — managers, supervisors, administrators, team leaders, and field workers must be separated by server-side authorization rather than UI affordances.
- **Authenticated metadata to uploaded files** — photo URLs cross from protected application state into a static file surface and must not lose authorization controls.
- **Production vs dev/build tooling** — Expo build scripts, local file utilities, and development defaults are out of scope unless they affect production runtime behavior.

## Scan Anchors

- Production entry points: `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/*.ts`, `artifacts/web-app/src/App.tsx`, `artifacts/field-ops/context/auth.tsx`.
- Highest-risk code areas: auth middleware and token issuance (`middlewares/auth.ts`, `routes/auth.ts`), user/role management (`routes/users.ts`), work-object mutation routes (`routes/jobs.ts`, `routes/audits.ts`, `routes/photos.ts`), and static upload serving in `app.ts`.
- Public surfaces: `/api/health*`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/refresh`, and `/api/uploads/*` unless separately protected.
- Authenticated surfaces: assets, jobs, reactive jobs, schedules, teams, audits, programmes, reports, and settings.
- Usually dev-only and lower priority: `artifacts/field-ops/scripts/**`, `artifacts/field-ops/server/**`, local build helpers, and seed scripts.

## Threat Categories

### Spoofing

The application relies on JWTs carried in cookies for the web app and bearer tokens for the mobile app. The API must reject forged or weakly signed tokens, require a valid token on every protected route, and avoid any production fallback that would let attackers predict the signing secret. Refresh flows must only mint tokens from verified refresh tokens tied to active accounts.

### Tampering

Authenticated users can submit updates that change schedules, job status, audit outcomes, workforce availability, and system settings. The API must validate request bodies and enforce server-side authorization on each mutation so lower-privileged users cannot alter records outside their role or ownership.

### Information Disclosure

The platform stores staff directory data, workforce planning information, audit evidence, and uploaded files. Protected endpoints must return only the minimum data appropriate for the caller, and uploaded evidence must not become publicly retrievable simply because it is stored on disk and referenced by URL.

### Denial of Service

The public API accepts authentication requests, reporting queries, schedule generation, PDF creation, and file uploads. Public or low-privilege callers must not be able to trigger expensive operations or repeated uploads without rate, size, and auth controls that keep the service available.

### Elevation of Privilege

This project has meaningful role boundaries between field workers, team leaders, supervisors, managers, and administrators. Role checks must be enforced on every privileged route, object-level authorization must ensure users can only mutate or access records they are entitled to, and user-management endpoints must never let a lower role grant itself administrator-level power.