# FoundrySignal — Deployment

## Environments
- **Development (current):** single Bun process, `next dev` on :3000, SQLite file DB, public Solana RPC, Jupiter Lite. Local secrets in `.env` (gitignored).
- **Staging (production path):** PostgreSQL 15 + Redis 7, `apps/worker` process for collectors, provider sandbox keys, migration validation before apply.
- **Production (production path):** managed PostgreSQL (+ pgvector when AI semantic search moves beyond keyword retrieval), Redis + BullMQ driver, object storage for snapshots/exports, dedicated Solana RPC (Helius or equivalent), managed secrets, backups, incident monitoring.

## Build & run (sandbox)
- `bun install` (lockfile pinned) → `bun run db:push` (schema) → dev server managed by the platform.
- Apply migrations with `bun x prisma migrate deploy` (includes 20261117_roles_invitations_verification — drills the roles/invitation gates).
- `bun run lint` gate; `bun test` suites; agent-browser E2E verification of the golden path.

## CI pipeline (production definition)
1. Install with lockfile → 2. format → 3. `tsc --noEmit` → 4. lint → 5. unit tests → 6. integration tests (ephemeral Postgres/Redis) → 7. migration validation (`prisma migrate diff` guard) → 8. API contract tests → 9. dependency + secret scans → 10. frontend build → 11. E2E critical journeys → 12. deploy + health checks → 13. post-deploy smoke tests. Rollback: previous artifact + backward-compatible migrations required (expand/contract pattern).

## Observability
Structured JSON logs (request/job/provider) with request IDs; provider health registry; queue depth + job age + failure classification metrics; AI run cost/failure tracking. Sandbox exposes the same data via the admin console.

## Backups
Production: PostgreSQL continuous WAL archiving + daily snapshots; restore drill runbook. Sandbox: `db/custom.db` file snapshot script (scripts/backup-db.sh).

## Deployment topology note
The single-route constraint of the preview gateway is documented in IMPLEMENTATION_PLAN.md §2. The production deployment restores route groups; view components and API modules are unchanged.
