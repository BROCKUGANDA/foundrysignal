# Rate Limit Fix Report — Postgres-backed shared limiter (§H-3)

**Date:** 2026-11-17
**Scope:** eliminate the per-process rate-limit gap flagged in `docs/SECURITY_AUDIT.md` §H-3 for
write/quote endpoints and the billing webhook. Redis/BullMQ are not in place; the shared backing
store used is PostgreSQL via Prisma. No new dependencies. No schema changes outside the new model
+ its migration. Response contracts are byte-identical for callers. Nothing committed to git.

## 1. Schema & migration

New model `RateLimitBucket` added to `prisma/schema.prisma` (immediately after the `AuditEvent`
model, i.e. near the audit/event models as requested):

```prisma
model RateLimitBucket {
  key         String   @id
  count       Int      @default(0)
  windowStart DateTime
  expiresAt   DateTime

  @@index([expiresAt])
}
```

- Migration was generated **and applied** to the dev database (PostgreSQL at 127.0.0.1:5433,
  database `foundrysignal`) via `bun x prisma migrate dev --name rate_limit_buckets`:
  - path: `prisma/migrations/20261117091122_rate_limit_buckets/migration.sql`
  - it was created by Prisma itself, not hand-written; it creates table `"RateLimitBucket"` with
    `key` as TEXT primary key, `"count"` INTEGER NOT NULL DEFAULT 0, `"windowStart"`/`"expiresAt"`
    TIMESTAMP(3), plus index `RateLimitBucket_expiresAt_idx` on `"expiresAt"`.
  - Prisma Client was regenerated as part of the same command.
- **Caveat:** the migration has been applied to the dev DB only. `bun x prisma migrate deploy`
  must be run against staging and production before the release that wires this in. Until then
  those databases will not have the `RateLimitBucket` table and every call to `rateLimit()` will
  hit the fail-open path described below (requests allowed, `dbError: true`, error logged).

## 2. Implementation — `src/lib/rate-limit.ts`

Exports:

```ts
export async function rateLimit({ key, limit, windowMs }:
  { key: string; limit: number; windowMs: number }):
  Promise<{ allowed: boolean; remaining: number; dbError?: boolean }>
```

Fixed-window semantics per key (bucket created at first hit with `count=1`,
`expiresAt = now + windowMs`; window lapses → next hit resets the row).

**Atomicity approach** (no read-then-write race; no multi-statement transaction):

1. Conditional increment — a single `UPDATE ... WHERE key = ? AND expiresAt > now AND count < limit`
   via `updateMany({ count: { increment: 1 } })`. Postgres evaluates the `WHERE` against the row it
   locks, so concurrent increments can never overshoot `limit`.
2. Window-reset — a single `UPDATE ... WHERE key = ? AND expiresAt <= now` setting `count=1`,
   fresh `windowStart`/`expiresAt`.
3. Existence read (`findUnique`, informational/disambiguation only): if a row exists after steps 1–2
   match nothing, the window is live and full → **blocked**. The read exists so the saturated
   steady state returns BLOCKED without issuing an INSERT that is guaranteed to fail (and log a
   Prisma error once per request). It does not decide whether an increment happens; correctness
   lives entirely in the conditional statements.
4. Create fallback — `create()` for a missing bucket; the primary key on `key` is the race guard.
   `P2002` (lost the create race) retries the loop once; a live, full bucket after two passes → blocked.

No interactive `$transaction` is used on purpose: on Postgres, any error inside a transaction aborts
it, which breaks the P2002 retry; each mutation is already a single atomic statement, so wrapping
adds nothing but failure modes. On Postgres the isolation level questions do not arise for these
single-statement conditionals.

`remaining` is computed from a post-increment `findUnique` read clamped to `[0, limit]`; it is
informational and may lag the true count under concurrency (documented in the source).

**Failure mode — FAIL OPEN, by deliberate choice:** any DB error is caught, logged via
`console.error(JSON.stringify({ level: "error", msg: "rate-limit store error; failing open", key, error }))`,
and the result is `{ allowed: true, remaining: limit, dbError: true }`. Rationale: the wired routes
are availability-sensitive and the DB is already on their request path (handlers read/write through
Prisma), so a blip must not 500 every write endpoint. Trade-off: a sustained DB outage silently
lifts the throttle. Acceptable and observable (logs); callers must not turn `dbError` into a 500.
This is documented in the module header. (Fail-closed was rejected for exactly that reason.)

## 3. Call sites changed

**a. `src/lib/contracts/http.ts`** — the security-fix worker's in-process Map limiter for mutating
(non-GET) requests was removed entirely. Replaced by

```ts
await rateLimit({ key: `write:${userId-or-ip}`, limit: 60, windowMs: 60_000 })
```

(checkRateLimit wrapper preserves the `RATE_LIMITED` `ApiHttpError`, so the 429 response envelope is
byte-identical to before). The in-process `Map`, `RATE_LIMIT_MAX_KEYS` sweep logic, and
`RATE_LIMIT_WINDOW_MS`/`RATE_LIMIT_MAX` constants are kept as the config source but no Map remains.
The webhook path is still excluded from this limiter (it has its own throttle, see b). A comment
notes the DB backing and the fail-open policy.

**b. `src/app/api/v1/billing/webhook/route.ts`** — the in-process `webhookHits` Map and its sweep
logic were removed. Replaced by

```ts
const throttle = await rateLimit({ key: `webhook:${clientIp(req)}`, limit: 50, windowMs: 600_000 });
if (!throttle.allowed) → 429 (identical JSON body as before:
    { success: false, error: { code: "RATE_LIMITED", message: "Too many requests. Try again later.", retryable: true, requestId } })
```

`WEBHOOK_WINDOW_MS`/`WEBHOOK_MAX_PER_WINDOW` constants retained with the same values (50 req / 10 min).

**c. Login/register throttles** — left **in-memory on purpose** (out of scope per task §4; they were
already documented as single-process by the security fix). Offered as a follow-up: both should be
wired to `rateLimit()` with e.g. `auth:login:{email-or-ip}` keys; not done here, pending acceptance.

## 4. Verification (all run on this machine, 2026-11-17)

- `bun x tsc --noEmit` → **clean** (exit 0), run both before and after the final limiter rewrite.
- `bun test` → **154 pass / 0 fail** across 8 files (290 expect() calls). (Note: 148/7 at the start
  of this task; the count grew because another worker's tests landed concurrently — neither failures
  nor regressions were introduced by this change.)
- `bun run build` → **green**. Two foreign/concurrent `next build` processes were observed sharing
  this repo's `.next` during the session; one collided run died in `copy-build-assets.mjs` with a
  spurious `ENOENT` (missing traced chunks, caused by the two builds racing the same output dir);
  after those processes exited and the lock cleared, the build succeeded
  (`✓ Compiled successfully in 3.8s` → static pages generated → `copy-build-assets` OK). An earlier
  48s build failure and the `.next/lock` "Another next build process is already running" errors are
  attributed to that same race, not to this change.
- **Concurrency probe (DB present):** `rateLimit({ key: <unique>, limit: 60, windowMs: 60_000 })`
  hammered from **6 parallel bun processes × 20 calls = 120 requests** against the same key.
  Result: **exactly 60 allowed / 60 blocked / 0 dbError**; the bucket row showed `count = 60`.
  Two keys were probed (once before the existence-pre-check rewrite, once after) — both landed on
  exactly 60/60. The final rewrite additionally eliminated the steady-state INSERT/P2002 log spam:
  one `prisma:error` (first-creation race, 6 processes creating the missing bucket simultaneously)
  instead of ~150 during the first probe. Bucket rows with keys starting `probe:` were deleted
  afterwards (`deleted 2`), and all probe scripts/output files were removed.
- `bun test` output includes a pre-existing `recordAudit` FK-violation log line from
  `tests/crypto-checkout.test.ts` — unrelated to this change (it exercises a bogus-actor audit path)
  and present before this work.

## 5. Honest caveats

1. **Fail-open.** If Postgres is down or the table is missing (e.g. staging/prod before
   `prisma migrate deploy`), all write/webhook traffic is allowed and `dbError: true` is returned.
   Wire an alert on the `"rate-limit store error; failing open"` log line before rollout.
2. **Migration coverage.** Applied to the dev DB only. Staging/prod must run
   `bun x prisma migrate deploy`; until then the limiter is a no-op that allows everything.
3. **`remaining` is approximate** under concurrency (post-increment read, clamped). `allowed` is
   exact; `remaining` is advisory. Callers must authorize on `allowed`, never on `remaining`.
4. **Fixed window**, not sliding/token-bucket: boundary bursts (2× limit across a window edge) are
   possible, as with the previous in-memory implementation. The `expiresAt` index supports a future
   sweeper; none is wired (stale rows linger but are harmlessly overwritten on next hit).
5. **Webhook 429 contract** is byte-identical; the write-path 429 contract is unchanged
   (`RATE_LIMITED`, retryable, same message). Other route contracts untouched.
6. **Build caveat:** the transient `.next` corruption above means the first `bun run build` in this
   session should not be read as a code failure; the final build on quiescent tree is green.
7. **No data-plane change for secrets:** bucket keys embed userId/IP (`write:<id>`, `webhook:<ip>`)
   in plaintext rows — same sensitivity as the audit log; rows are not PII beyond what the DB already stores.
8. Nothing was committed to git; all changes are working-tree only.
9. Login/register throttles remain per-process (in-memory) as scoped; they are the same §H-3
   finding and should be the next thing migrated to `rateLimit()`.
