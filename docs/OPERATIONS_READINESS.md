# FoundrySignal — Operations Readiness Runbook

**Purpose.** What an operator must have in place before public traffic, what the
repository actually provides today, and the gaps that remain. This is an
operational inventory, not a legal or security sign-off. Facts are sourced from
the files named in each section; anything not present in the repository is
marked `OPERATOR INPUT REQUIRED`.

---

## 1. Deployment topology (as built)

| Layer | Reality |
| --- | --- |
| Runtime | Next.js 16 standalone output, Bun, one process serving UI + API + in-process job worker. |
| Host | Self-hosted Linux runner, app at `/home/ubuntu/ai-azimara-foundrysignal`, systemd unit `foundrysignal`. |
| Env | `/etc/foundrysignal/foundrysignal.env`, mode 0600, materialised from GitHub Actions secrets by `.github/workflows/deploy.yml`. |
| Database | PostgreSQL, Prisma 6 migrations (`prisma/migrations/`), applied by `bun x prisma migrate deploy` during deploy. |
| Reverse proxy | Caddy in the checkout proxies to `localhost:3000`. `docs/DEPLOYMENT.md` records the live service on port 3016 behind Cloudflare — confirm the actual port with `systemctl show foundrysignal` rather than assuming one. |
| Release assets | `next.config.ts` uses `DEPLOYMENT_ID` to version static URLs with `?dpl=`. Each release needs a unique, stable identifier. |
| Worker | `src/instrumentation.ts` starts the DB-backed queue loop and schedules billing sweep + checkout watcher jobs. No separate worker process. |

Deploy workflow order (`.github/workflows/deploy.yml`): materialise env → install → rsync source (excludes `node_modules`, `.next`, `.git`, `.env`) → `prisma migrate deploy` → `prisma generate` → `bun run build` → restart service → health check → billing readiness check. The billing check fails the deploy when `/api/v1/pricing` does not report `purchasingAvailable:true`.

---

## 2. Pre-public-launch checklist

| # | Item | Current state | Owner |
| --- | --- | --- | --- |
| 1 | CI green on `main` | `bun run typecheck`, `bun run lint`, `bun test` (244 pass), `bun run build` verified locally on 2026-11-24 | Engineering |
| 2 | Prisma migrations applied to production | Applied by deploy workflow; verify with `bun x prisma migrate status` against the production URL | Operator |
| 3 | Database backup before cutover | One custom-format backup exists under `/mnt/data/backups/foundrysignal`; no restore drill performed | Operator |
| 4 | Restore drill | **NOT DONE** — see §3 | Operator |
| 5 | Monitoring beyond `/api/v1/health` | Health + capabilities + admin overview exist; queue depth, dead letters, billing watcher and UNCERTAIN trades are not alerted | Engineering |
| 6 | Log retention | Structured JSON logs exist; retention period not configured in repo | Operator |
| 7 | Secret rotation | Rotation procedure in §4; last rotation out of band | Operator |
| 8 | TLS / DNS | Caddy + Cloudflare documented; certificate and DNS ownership `OPERATOR INPUT REQUIRED` | Operator |
| 9 | Admin bootstrap | `ADMIN_BOOTSTRAP_EMAIL` promotes an existing account once at boot, audited | Operator |
| 10 | OAuth callbacks registered | Code complete; callbacks must be registered with GitHub and Google and one live sign-in performed | Operator |
| 11 | Email sender verified | `RESEND_API_KEY` + `EMAIL_FROM` required; without them verification mail is honestly reported undelivered | Operator |
| 12 | USDC payout wallet | `PAYOUT_WALLET`, `USDC_MINT`, `SOLANA_RPC_URL` required; billing check fails deploy when absent | Operator |
| 13 | GitHub collector token | `COLLECTOR_GITHUB_TOKEN` required for repository depth; otherwise honest `RATE_LIMITED` | Operator |
| 14 | Helius | Optional; without it onchain reads fall back to public RPC | Operator |
| 15 | Legal sign-off | Seven items open — see `docs/COMMERCIALIZATION_LEGAL_PACK.md` | Counsel / Operator |
| 16 | Accessibility audit | No independent WCAG 2.2 AA audit — see `/accessibility` and the legal pack | Auditor |
| 17 | Trading release gates | Four gates and kill switch; `TRADING_ENABLED=true` in deploy by explicit operator decision — see §7 | Operator |

---

## 3. Backup and restore

**Backup.** `scripts/backup-postgres.mjs` is Linux-only and creates a custom-format
`pg_dump` in `/mnt/data/backups/foundrysignal` with `umask 077`, using
`DATABASE_URL`. It requires Docker on the deployment host and deliberately does
not relay client error text to public logs. Run it on every release cutover and
on a daily schedule (the scheduling mechanism is `OPERATOR INPUT REQUIRED` — no
cron/systemd timer is present in the repo).

**Restore drill — missing.** No restore script or documented drill exists. Before
public launch, perform at least one drill into a throwaway database:

1. Create an empty database and a throwaway `DATABASE_URL` pointing at it.
2. Restore with `pg_restore --clean --if-exists --no-owner --dbname=<throwaway> <backup-file>` using the same `postgres:18-alpine` image and host network as the backup script.
3. Run `bun x prisma migrate status` — it must report all migrations applied.
4. Run `bun run test` against the throwaway database.
5. Record the drill result, duration and operator in this document.

Do not treat a successful backup listing as a successful restore.

---

## 4. Key rotation runbook

Secrets referenced by `.github/workflows/deploy.yml` (names only, never values):

`DATABASE_URL`, `NEXT_PUBLIC_SITE_URL`, `ALLOWED_ORIGINS`, `TRUSTED_PROXIES`,
`ADMIN_BOOTSTRAP_EMAIL`, `EMAIL_FROM`, `RESEND_API_KEY`,
`COLLECTOR_GITHUB_TOKEN`, `SOLANA_RPC_URL`, `HELIUS_API_KEY`, `PAYOUT_WALLET`,
`PAYOUT_WALLET_EVM`, `BILLING_PROVIDER`, `TRADING_ENABLED`.

Rotation order (lowest blast radius first):

1. Collector-only keys: `COLLECTOR_GITHUB_TOKEN`, `HELIUS_API_KEY` — verify `/api/v1/providers` and a collector job afterwards.
2. Email: `RESEND_API_KEY`, `EMAIL_FROM` — verify a verification email and a password-reset email.
3. Payment/runtime: `SOLANA_RPC_URL`, `PAYOUT_WALLET`, `BILLING_PROVIDER` — verify `/api/v1/pricing` reports `purchasingAvailable:true` and one test checkout intent.
4. Identity/network: `ADMIN_BOOTSTRAP_EMAIL`, `ALLOWED_ORIGINS`, `TRUSTED_PROXIES` — verify admin access and that cross-origin mutation attempts are rejected.
5. `DATABASE_URL` last: rotate the role password, update the secret, redeploy, then run migrations and the health check. Take a backup first.

After every rotation: confirm the deploy workflow completed, `/api/v1/health`
is 200, `/api/v1/capabilities` shows the expected states, and no secret value
appears in logs. Operators rotating keys outside GitHub must update the systemd
env file with mode 0600 and restart the service.

---

## 5. Monitoring and incident response

**Available endpoints:** `/api/v1/health`, `/api/v1/capabilities` (public),
`/api/v1/providers` and the admin overview (authenticated). Structured JSON logs
include request, job, provider and audit events.

**Not monitored today:** queue depth, dead-letter count, oldest job age, billing
watcher lag, unconfirmed checkout intents, `TransactionRecord` UNCERTAIN
outcomes, AI run cost/failure rate, disk usage, backup freshness.

**Minimal alert set to add before public traffic:**

| Alert | Condition | Why |
| --- | --- | --- |
| API down | `/api/v1/health` non-200 for 2 minutes | Basic availability |
| Dead letters growing | `JobRecord.status=DEAD` count increases in 15 minutes | Collector pipeline silently failing |
| Job age | Oldest pending job > 10 minutes | Worker stalled |
| Checkout stuck | Pending intent older than 30 minutes | Watcher or settlement failure |
| Trading uncertain | Any `TransactionRecord` status `UNCERTAIN` | Requires manual reconciliation |
| Backup freshness | No successful backup in 26 hours | Data-loss risk |
| Disk / DB connections | Host or database thresholds | Capacity |

**Incident path:** acknowledge in the incident channel, capture the audit trail
and job records, engage the kill switch for trading (`PATCH /api/v1/admin/trading-gates`)
if any execution-related anomaly appears, preserve logs and snapshots, then
follow the post-incident review. Roles and permissions are enforced in the
service layer; do not add a self-service admin path during an incident.

---

## 6. Live verification checklist

Commands that exist in the repository:

| Check | Command | Credentials needed |
| --- | --- | --- |
| Typecheck | `bun run typecheck` | none |
| Lint | `bun run lint` | none |
| Test suite | `bun run test` (uses `--isolate`) | reachable `DATABASE_URL` |
| Production build | `bun run build` | reachable `DATABASE_URL` |
| Golden path | `bash scripts/smoke-golden-path.sh` | running server, live providers |
| MFA flow | `bun scripts/smoke-mfa.ts` | running server, `MFA_ENCRYPTION_KEY` |
| OAuth routes | `bun scripts/smoke-oauth.ts` | running server; provider credentials for live sign-in |
| Checkout atomicity | `bun scripts/verify-checkout-atomic.ts` | isolated PostgreSQL, mocked RPC |
| Targeted checkout/role/theme | `bun test tests/checkout-chain-proof.test.ts` | none (mocked) |
| Routes | `GET /`, `/pricing`, `/terms`, `/accessibility`, `/api/v1/health`, `/api/v1/capabilities` | running server |

Still external and unexecuted: a live GitHub/Google sign-in with registered
callbacks, a live mainnet USDC payment, a production restore drill, and an
independent accessibility audit.

---

## 7. Known operational gaps

1. **Single-process worker.** API and worker share one process; no BullMQ driver
   and no separate worker process. Horizontal scale-out and at-least-once across
   processes require the documented swap.
2. **In-process MFA attempt counters.** The cross-process DB rate limiter is the
   second layer; a shared counter store is a follow-up.
3. **Trading flag contradiction.** `docs/gate-reviews/README.md` states
   `TRADING_ENABLED` is OFF and all gates are NOT_STARTED, while commit
   `f3cf2d1` ("config(deploy): keep trading execution armed (operator decision)")
   sets `TRADING_ENABLED=true` in the deploy workflow. This is an explicit
   operator decision, not an implementation defect. Execution is still blocked
   until all four gates are APPROVED by an admin and the kill switch is CLEAR —
   verify with `GET /api/v1/trading/gates` before any public launch. The docs
   must be updated to reflect the operator decision rather than silently
   changed in code.
4. **Shared `bun` binary on the VPS.** Other app processes map
   `/home/ubuntu/.bun/bin/bun`, so `setup-bun` with `bun-version: latest` fails
   with `ETXTBSY` when it tries to replace the binary. Both workflows now pin
   `1.4.5` (the installed version); bump deliberately, and never kill unrelated
   processes to work around this.
5. **Post-restart readiness race.** The billing check originally ran milliseconds
   after restart and could hit a not-yet-bound port. It now retries for up to
   60 seconds, mirroring the health check.
6. **No staging evidence.** CI provisions a throwaway PostgreSQL service, but a
   persistent staging environment with its own migration history is not
   evidenced in the repo.
7. **Stale block-storage drop-in (fixed).** `block-storage.conf` pointed
   `WorkingDirectory` at `/mnt/data/apps/foundrysignal/current` (release
   `fs-20261119-r3`) while the deploy workflow builds into `APP_DIR`. Deploys
   therefore passed health checks on the old app. The workflow now writes
   `zz-appdir.conf` to bind the service to `APP_DIR/.next/standalone` before
   restarting; verify `/accessibility` = 200 and a terms-less registration = 422
   after every deploy.
8. **Release-gate sign-off remains human.** Machine evidence packages exist in
   `docs/gate-reviews/`; counsel, security, provider and product decisions do not.

---

## 8. Operator sign-off

| Role | Name | Date | Decision |
| --- | --- | --- | --- |
| Operator | `OPERATOR INPUT REQUIRED` | — | Backup + restore drill complete |
| Operator | `OPERATOR INPUT REQUIRED` | — | Secrets rotated, keys listed in §4 verified |
| Counsel | `OPERATOR INPUT REQUIRED` | — | Items in `COMMERCIALIZATION_LEGAL_PACK.md` closed |
| Auditor | `OPERATOR INPUT REQUIRED` | — | Accessibility audit complete |
| Operator | `OPERATOR INPUT REQUIRED` | — | Trading gate state confirmed before public traffic |
