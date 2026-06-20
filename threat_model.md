# Threat Model

## Project Overview

Porirua City Council’s garden asset management system is a TypeScript pnpm monorepo with a public Express API (`artifacts/api-server`), a React web application (`artifacts/web-app`), and an Expo-based field app (`artifacts/field-ops`). In production, the Express API is the primary trust boundary: it authenticates users, enforces role separation, stores operational data in PostgreSQL, serves uploaded evidence, and exposes scheduling, asset, audit, reporting, workforce, and settings endpoints.

This scan assumes production traffic is protected by platform TLS, `NODE_ENV=production`, and only production-reachable surfaces matter. The deployment is publicly reachable, so every unauthenticated or weakly authenticated route must be treated as internet-exposed. Dev tooling, scripts, mocks, and local-only helpers are out of scope unless they affect production runtime behavior.

## Production Scope Notes

- The deployed application is public at `https://porirua-garden-manager.replit.app`.
- The production route surface is broader than earlier threat-model revisions implied; meaningful API areas include assets, jobs, reactive jobs, audits, uploads, users, team/teams, settings, schedule, reports, admin patches, and audit-log routes.
- Web uses cookie-based JWT auth; field-ops/mobile uses bearer tokens and a web-to-field-ops handoff flow.
- Current production infrastructure provisions the JWT secret externally. The hardcoded fallback secret in code is only exploitable if deployment drift leaves `JWT_SECRET` unset, so future scans should treat that as conditional rather than automatically reportable.

## Assets

- **User accounts and roles** — staff identities, password hashes, JWT claims, refresh/access tokens, and role assignments.
- **Operational work data** — assets, schedules, reactive jobs, audits, completions, route order, and workforce assignment data.
- **Uploaded evidence and documents** — job photos, audit photos, PDFs, and other files referenced by application metadata.
- **Administrative configuration** — global system settings that affect scheduling, routing, quotas, and operational behaviour across teams.
- **Audit and compliance records** — audit-log entries, historical changes, IP metadata, and sign-off artefacts.
- **Staff privacy data** — emails, team membership, leave/availability data, and mobile push tokens.

## Trust Boundaries

- **Browser/mobile client to API** — all cookies, bearer tokens, route params, query params, and request bodies are untrusted until validated and authorized server-side.
- **Authenticated low-privilege users to privileged roles** — field workers, supervisors/team leaders, managers, and administrators must be separated by server-side checks rather than UI affordances.
- **Protected metadata to file download surface** — object URLs and upload paths cross from authorized business records into `/api/uploads/*`, so authorization must survive that handoff.
- **Desktop session to field-ops session bootstrap** — the web client can transfer users into the field-ops surface; token handoff mechanisms are security-sensitive, not mere UX plumbing.
- **Persisted user content to HTML/WebView rendering** — asset names/descriptions and similar stored content can cross into generated HTML for Leaflet popups and WebViews, creating stored-XSS risk.
- **API to PostgreSQL** — authorization failures or unsafe query construction translate directly into operational data compromise.
- **Production app to third-party telemetry/storage** — Sentry and object storage receive production traffic and metadata; URLs, user context, and uploaded objects must not leak secrets or bypass access control.

## Scan Anchors

- **Primary production entry points**: `artifacts/api-server/src/index.ts`, `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/*.ts`, `artifacts/web-app/src/lib/auth.tsx`, `artifacts/field-ops/context/auth.tsx`, `artifacts/field-ops/app/_layout.tsx`.
- **Highest-risk auth/session files**: `artifacts/api-server/src/middlewares/auth.ts`, `artifacts/api-server/src/routes/auth.ts`, `artifacts/web-app/src/lib/auth.tsx`, `artifacts/field-ops/context/auth.tsx`, `lib/api-client-react/src/custom-fetch.ts`.
- **Highest-risk authorization/data-boundary files**: `artifacts/api-server/src/routes/jobs.ts`, `artifacts/api-server/src/routes/photos.ts`, `artifacts/api-server/src/routes/audits.ts`, `artifacts/api-server/src/routes/settings.ts`, `artifacts/api-server/src/routes/schedule.ts`, `artifacts/api-server/src/routes/users.ts`, `artifacts/api-server/src/routes/audit-log.ts`, `artifacts/api-server/src/app.ts`.
- **Stored-content rendering sinks**: `artifacts/field-ops/app/(tabs)/assets.tsx`, `artifacts/field-ops/app/(tabs)/audits.tsx`, `artifacts/field-ops/components/AssetMap.web.tsx`, `artifacts/field-ops/components/AssetMap.tsx`, `artifacts/field-ops/components/AuditMap.tsx`.
- **Public surfaces**: `/api/health*`, login/refresh/logout auth routes, and any route missing explicit auth middleware.
- **Authenticated but high-risk surfaces**: uploads, reactive jobs, schedule mutation routes, settings mutation routes, audit-log routes, user-management routes, and admin/support routes.
- **Usually dev-only / out of scope unless production reachability changes**: `artifacts/field-ops/scripts/**`, local server helpers, seed scripts, and build-time utilities.

## Threat Categories

### Spoofing

The application relies on JWTs in secure cookies for the web app and bearer tokens for field-ops/mobile. Protected routes must reject forged, expired, or mis-scoped tokens, and cross-surface handoffs must not expose live bearer credentials through URLs, logs, or telemetry.

### Tampering

Authenticated users can change schedules, job state, route order, settings, audits, and workforce data. Every mutation route needs both input validation and object/role-level authorization so lower-privileged users cannot alter data outside their authority.

### Information Disclosure

The system stores staff records, audit history, push tokens, evidence files, and operational site data. File download routes and administrative read APIs must return only data the caller is entitled to see and must not expose secrets or historical sensitive fields unnecessarily.

### Denial of Service

Expensive endpoints such as auth, schedule generation, reporting, PDF generation, and uploads can affect availability. Public and low-privilege callers must not be able to trigger disruptive high-cost operations across the whole organisation.

### Elevation of Privilege

The key production risk is broken server-side separation between supervisors/team leaders, managers, administrators, and field workers. Pay particular attention to routes where the UI implies view-only access but the API grants edit rights, and to any endpoint that accepts caller-supplied team/user assignment fields.
