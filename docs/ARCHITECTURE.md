# FoundrySignal — Architecture

## 1. System shape

Single deployable Next.js 16 application (App Router, React 19, TypeScript strict) with modular domain code and a versioned REST API. The sandbox runs one process; the codebase is partitioned so production can split the worker loop into a dedicated process without changing handlers.

```
src/
  app/page.tsx               ← single user-visible route hosting the app shell
  app/api/v1/…               ← versioned REST modules (auth, ventures, evidence, research, …)
  lib/contracts/             ← ApiResponse envelope, error codes, OpenAPI-aligned types
  lib/domain/                ← business services; own validation + persistence + rules
    auth/ ventures/ evidence/ research/ onchain/ markets/ watchlists/ billing/ admin/
  lib/providers/             ← DataProvider framework + adapters (github, website, solana, jupiter)
  lib/jobs/                  ← durable queue, worker loop, collectors (sprint-mapped)
  components/fs/             ← FoundrySignal design system (tokens, glyphs, logo, states)
  components/ui/             ← shadcn/ui primitives (retained)
  tests/ (tests/ at root)    ← bun test suites
```

Rules enforced by convention and by review:
- Domain services are the only writers of business tables. Route handlers validate + authorize then delegate.
- Frontend never constructs provider requests. All provider access is server-side behind `lib/providers`.
- Every response uses the `ApiResponse<T>` envelope with `requestId`, timestamp, API version, cursor when paginated.
- Every job/worker mutation is idempotent and audited.

## 2. Frontend architecture

- TanStack Query for all server state; query keys include view + filters + pagination cursors.
- Zustand for session/UI state (current section, theme preference, wallet state).
- Client-side section navigation inside the single visible route: marketing ↔ auth ↔ platform (discover / dossier / research / watchlists / markets / settings / admin), mirroring the production route groups `(marketing) (auth) (platform)`.
- Every async view implements the state matrix: loading / empty / partial / stale / error / retry / degraded / unauthorized. No unbounded spinners.
- 3D Signal Prism is lazy-loaded (`next/dynamic`, `ssr:false`) with reduced-motion fallback; failure of the prism never affects core surfaces.

## 3. Backend architecture

- Route handlers `/api/v1/*`: zod-validated input → authorization check → domain service → envelope response. Structured logging with request IDs propagated to job logs.
- Sessions: opaque 256-bit token, HttpOnly + SameSite=Lax cookie, server-side session table with expiry and rotation on privilege change.
- RBAC: workspace memberships with roles (`OWNER`, `ADMIN`, `ANALYST`, `VIEWER`); platform role (`USER`, `MODERATOR`, `PLATFORM_ADMIN`) for admin surfaces.
- Authorization is enforced in service layer functions (defense in depth), not only in handlers.
- Job system: DB-backed durable queue (`JobRecord` table). Fields: unique idempotency key, payload, attempts, maxAttempts, backoff schedule with jitter, timeout, status (`QUEUED/RUNNING/COMPLETED/FAILED/DEAD`), failure classification (`TRANSIENT/PERMANENT`), lease timestamps, dead-letter retention. Worker loop runs on an interval, claims due jobs with lease semantics, executes handlers (collectors, evidence evaluation, snapshots, alerts).
- Provider framework: every external integration implements `DataProvider { getHealth, fetch, getRateLimitState }` with per-provider circuit breaker (failure threshold, half-open probe), timeout, bounded retries, rate-limit header parsing, and a health registry consumed by the admin console and honest UI states.

## 4. Data layer

Prisma 6 over SQLite in the sandbox; schema written to be PostgreSQL-portable. Tenant isolation via `workspaceId` scoping on all user-owned tables and composite indexes on `(workspaceId, …)`. Evidence observations are append-only; corrections create new auditable records referencing the original. Timestamps: `createdAt`, `updatedAt`, plus explicit `collectedAt`/`observedAt` where provenance requires them.

## 5. Cross-cutting

- Observability: structured JSON logs (request, job, provider), provider health registry surfaced in admin, dev.log inspection as local runtime check.
- Security: CSP headers, SSRF-guarded fetch layer (private-CIDR and metadata-endpoint denial), URL validation, bcrypt password hashing, constant-time token comparison, audit log on privileged actions, CSRF via SameSite + origin verification on mutations. Detailed in SECURITY_MODEL.md.
