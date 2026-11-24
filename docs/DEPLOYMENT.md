# FoundrySignal — Deployment

## Environments
- **Development:** single Bun process, `next dev` on :3000, PostgreSQL (the current Prisma schema), configured Solana RPC and Jupiter providers. Local secrets in `.env` (gitignored).
- **Staging (production path):** PostgreSQL 15 + Redis 7, `apps/worker` process for collectors, provider sandbox keys, migration validation before apply.
- **Production (production path):** managed PostgreSQL (+ pgvector when AI semantic search moves beyond keyword retrieval), Redis + BullMQ driver, object storage for snapshots/exports, dedicated Solana RPC (Helius or equivalent), managed secrets, backups, incident monitoring.

## Build & run (sandbox)
- `bun install` (lockfile pinned) → `bun run db:push` (schema) → dev server managed by the platform.
- Apply migrations with `bun x prisma migrate deploy` (includes 20261117_roles_invitations_verification — drills the roles/invitation gates).
- `bun run lint` gate; `bun test` suites; agent-browser E2E verification of the golden path.

### Windows gotcha
`npm run start` fails silently on Windows (`NODE_ENV=production` prefix is Unix shell syntax). Start the production server with:

```powershell
$env:NODE_ENV='production'; bun .next/standalone/server.js 2>&1 | Tee-Object server.log
```

Health check: `GET http://localhost:3000/api/v1/health`.

## CI pipeline (production definition)
1. Install with lockfile → 2. format → 3. `tsc --noEmit` → 4. lint → 5. unit tests → 6. integration tests (ephemeral Postgres/Redis) → 7. migration validation (`prisma migrate diff` guard) → 8. API contract tests → 9. dependency + secret scans → 10. frontend build → 11. E2E critical journeys → 12. deploy + health checks → 13. post-deploy smoke tests. Rollback: previous artifact + backward-compatible migrations required (expand/contract pattern).

## Observability
Structured JSON logs (request/job/provider) with request IDs; provider health registry; queue depth + job age + failure classification metrics; AI run cost/failure tracking. Sandbox exposes the same data via the admin console.

## Backups
Production requires PostgreSQL backups and a tested restore procedure. The old `scripts/backup-db.sh` supports only historical SQLite sandboxes and is not a backup mechanism for the current PostgreSQL schema. Use `pg_dump` with the deployment's private `DATABASE_URL`; never print or commit it.

## Verified upgrade boundaries

The selected source is `D:\AI AZIMARA(AAA)\FoundrySignal`, not the older `D:\foundrysignal` checkout. Before replacing a running release, compare its Prisma schema and migrations, back up PostgreSQL, build a new release on `/mnt/data` block storage, and retain the prior release for rollback. Do not copy `.env`, `node_modules`, or Windows build output into a Linux release; build the standalone output on Linux. The Dockerfile generates the Prisma client and includes its native runtime engine, then runs as the non-root `bun` user.

The checkout regression suite is `bun test tests/checkout-chain-proof.test.ts`: it performs only mocked read-only RPC calls, without transferring money or touching a database. The verifier requires confirmed successful transactions, one exact checkout memo from a recognized Memo program, the intended USDC mint and destination, and integer-precise token credits. Do not describe this limited suite as an independent payment or smart-contract audit.

Persona-specific dashboards are presentation, not privileges. Platform and workspace roles remain the authorization source; self-selecting a founder, investor or analyst persona does not grant management or administrative access. Trading release gates remain in force; do not enable legal, provider or security approvals merely to make the trade button active.

## Release asset consistency

Build each production image with a unique, stable-per-release identifier: `docker build --build-arg DEPLOYMENT_ID=fs-20261119-r2 -t foundrysignal:fs-20261119-r2 .`. Change the identifier for each new release; keep it the same across replicas of that release. `next.config.ts` passes it to Next.js deployment/version-skew protection, which versions static asset URLs with `?dpl=`. It is not a secret and does not replace correct proxy routing.

The 2026-11-19 asset investigation found an old Cloudflare-cached 404 for one existing chunk. The real systemd service listens on port 3016, not 3100; use `systemctl show foundrysignal` and the current service configuration rather than assuming an origin port. All 18 checked asset requests matched the release on port 3016. A saved Cloudflare credential was rejected, so no purge was performed. An operator with a valid scoped token can run `node scripts/purge-stale-checkout-asset.mjs --confirm-one-file`; it targets only the documented stale chunk, never the entire zone.

Release `fs-20261119-r3` is active through `/mnt/data/apps/foundrysignal/current`, with older releases retained. `deploy/vps/block-storage.conf` overrides only the systemd working directory and executable; the existing private service environment remains outside the image. A custom-format PostgreSQL backup was created under `/mnt/data/backups/foundrysignal` before the initial cutover. Backup listing was checked; a production restore drill was not performed. No schema migration was needed because the deployed and selected schemas/migrations matched.

Validation for this slice: 24 targeted checkout/role/theme tests, TypeScript, lint and Linux production build passed. `scripts/verify-checkout-atomic.ts` additionally passed six scenarios on isolated PostgreSQL 18.7, including genuine serialization conflicts and trigger-injected write failures; test containers/network were removed. The production theme bootstrap is now a literal server-layout script, not a client-module reference. Twelve normal cold-context browser visits at 390/768/1440px passed without failed assets, page errors or document overflow; 21 public page/discovery URLs returned 200 and anonymous watchlists returned 401. These checks do not authorize mainnet trading or establish commercial/legal readiness.

## Deployment topology note
The single-route constraint of the preview gateway is documented in IMPLEMENTATION_PLAN.md §2. The production deployment restores route groups; view components and API modules are unchanged.
