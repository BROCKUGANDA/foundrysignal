# Entitlements Fix Report — 2026-11-17

Server-side enforcement of the plan entitlements that were previously data-only,
plus the demo-team entitlement workaround and the sameAs probe. Canonical
enforcement module: `src/lib/domain/billing/entitlements.ts`
(`assertPlanAllows` / `planLimit` / `requireEntitlement` / `getEntitlements`).
Entitlement source of truth: `PLAN_SEED` in `src/lib/domain/billing/plans.ts`
(parsed server-side only; Explorer fallback applies for missing/expired/past_due/
canceled subscriptions; corrupt JSON → `{}` → most restrictive).

## Task 1 — savedSearches (DONE)

`src/app/api/v1/saved-searches/route.ts` POST previously hardcoded a cap of 20
(`if (count >= 20) throw new ApiHttpError("CONFLICT", ...)`). Now:

- `assertPlanAllows(ctx, "savedSearches")` resolves the plan limit; Explorer and
  Researcher have **no `savedSearches` key** in PLAN_SEED → `planLimit` → 0 →
  **402 PAYMENT_REQUIRED** ("Your plan does not include savedSearches…").
- Professional = **50**, Team = **200** (verified in PLAN_SEED, plans.ts lines ~69/~88).
- Enterprise has **no `savedSearches` key** either → resolves to 0 → 402. This is a
  PLAN_SEED data gap flagged here, not silently invented: \[INFERENCE\] the intended
  Enterprise value is unlimited (-1), matching its other -1 limits, but PLAN_SEED
  was not modified (out of scope to change plan data). Recommended follow-up: add
  `savedSearches: -1` to the ENTERPRISE entitlement block.
- Limit hit → 402 PAYMENT_REQUIRED with message
  `Saved-search limit reached: your plan includes N saved search(es). Upgrade your plan to add more.`
  (mirrors the watchlists pattern), `{ limit, used }` details.
- `-1` honored as unlimited. DELETE untouched — removal is never limited.

## Task 2 — alerts (DONE)

`src/app/api/v1/alerts/route.ts` POST is now gated with
`await requireEntitlement(ctx, "alerts")` immediately after the role check, before
any DB work. Explorer `alerts: false` → `entitlementGranted(false)` is false →
**402 PAYMENT_REQUIRED**. Researcher / Professional / Team / Enterprise all have
`alerts: true`. There is **no numeric alerts cap** in PLAN_SEED (bool only) → no
count cap was invented. No changes to GET/PATCH/DELETE (creation is the metered
action).

## Task 3 — seats (Team feature made real) (DONE)

`src/app/api/v1/workspaces/[id]/invitations/route.ts` POST now enforces the plan
`seats` entitlement after the ADMIN role check and before creating the invitation.
Workspace is read from `ctx` (the path `[id]` must already equal `ctx.workspaceId`
per the existing multi-tenant guard).

Counting (exact MembershipInvitation model fields, prisma/schema.prisma):

- `db.membership.count({ where: { workspaceId } })` — active memberships
- `db.membershipInvitation.count({ where: { workspaceId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } })` — pending invitations only (unaccepted, unrevoked, unexpired)

If `memberships + pendingInvites >= seats` → **402 PAYMENT_REQUIRED**,
message exactly: `Workspace seat limit reached for your plan. Upgrade to invite more members.`
with `{ limit: seats, used: memberships + pendingInvites }`.
`seats === -1` (Enterprise) → unlimited, check skipped. Error uses the existing
`ApiHttpError("PAYMENT_REQUIRED", …)` convention — no new error code added.

Seat limits per PLAN_SEED as seeded:

| Plan         | seats | Invite allowed while…            |
|--------------|-------|----------------------------------|
| Explorer     | 1     | 0 members + 0 pending invites    |
| Researcher   | 1     | 0 members + 0 pending invites    |
| Professional | 1     | 0 members + 0 pending invites    |
| Team         | 5     | members + pending invites < 5    |
| Enterprise   | -1    | unlimited                        |

Note: Explorer/Researcher/Professional (1 seat) already have their owner
membership, so the very first invitation from those plans returns 402 — which is
the intended commercial behavior (single-seat plans cannot invite).

## Task 4 — comparativeResearch (NOT SURFACED — cannot be gated)

Searched all of `src/` for `comparative` / `comparativeResearch`: only hits are
the three `comparativeResearch: true` entries in PLAN_SEED (Professional, Team,
Enterprise). A broader case-insensitive search for `compare` in `src/app/` found
**no route, handler, or page**. No comparative-research endpoint exists anywhere
in the codebase → **"not surfaced anywhere — cannot be gated"**. Nothing was
created (per instructions). When a comparative-research endpoint is added, it must
call `requireEntitlement(ctx, "comparativeResearch")`.

## Task 5 — apiMonthlyCalls (DEFERRED — nothing to meter)

Not implemented, deliberately. `src/lib/app/api/v1/` (and the repo overall) has
**no ApiKey issuance / API-key product surface**: the schema has `ApiKey` /
`ApiUsage` models, but there is no route that creates API keys, no public
API-key-authenticated consumer surface, and no per-key usage accounting in the
request path to attribute calls to a workspace. Metering `apiMonthlyCalls` would
require designing the entire API-key issuance + authentication + usage-ledger
story first. Inventing counters without a product surface would be fake
enforcement. Team has `apiMonthlyCalls: 50_000`, Enterprise `-1`, others none —
these remain data-only until an API-key surface exists.

## Task 6 — priorityCollection (SKIPPED — product decision)

Skipped deliberately. `priorityCollection: true` (Professional, Team) would imply
re-prioritizing the collection queue ahead of paying workspaces. Queue
re-prioritization policy (fairness, starvation, ordering guarantees, what
"priority" means operationally) is a product decision, not something to smuggle
into an entitlement fix. Out of scope; left as plan data only.

## Task 7 — Demo export entitlement via seeded subscription (DONE)

`scripts/seed-roles.ts` now upserts a `Subscription` for the demo workspace
("FoundrySignal Demo Team", slug `foundrysignal-demo-team`) **after** the demo
users/workspace are created (called right after the user-seeding loop, before the
venture lookup — it therefore also runs on the early-exit path where ventures are
missing). Behavior:

- Ensures plans are seeded (`ensurePlans()`), finds the RESEARCHER plan row.
- `currentPeriodEnd` = now + 365 days; `status = "ACTIVE"`; `provider = "none"`;
  `cancelAtPeriodEnd = false`.
- Idempotent: no `@@unique([workspaceId])` on Subscription, so it does
  `findFirst({ where: { workspaceId }, orderBy: { createdAt: "desc" } })` →
  `update` if present, else `create`. Safe to re-run.
- Code carries the comment: `DEMO ENTITLEMENT — replace with a real paid subscription; not a revenue path.`

Verified live against the dev DB (see Task 8): first seed run printed
`✓ demo subscription created (RESEARCHER, ACTIVE, currentPeriodEnd +365d)`;
a second run printed `✓ demo subscription updated (RESEARCHER, ACTIVE, …)` → idempotent.
Direct DB read confirms: plan=RESEARCHER, status=ACTIVE, provider=none,
currentPeriodEnd=2027-11-17 (≈ +365d from seed time), cancelAtPeriodEnd=false.

**Export 200 path for the demo workspace:** reportExport is `true` in the
RESEARCHER plan and the demo workspace now has an ACTIVE RESEARCHER subscription
with a valid period → `requireEntitlement(ctx, "reportExport")` passes → the
report Export button should work end-to-end for demo users. This is the
sanctioned workaround for the operator-raised Explorer-blocked export flag.
It is a demo workaround, **not** a revenue path, and **not** a verified browser
click-through (no browser was driven; verification is at the entitlement/DB layer
plus the build compiling the export route).

## Task 8 — Dev DB seed (DONE — DB was reachable)

- TCP reachability: `net.connect(5433, "127.0.0.1")` → **DB_REACHABLE** (re-checked
  after interruption, same result).
- Three strong passwords generated with `crypto.randomBytes(18).toString("base64url")`.
- Ran `DEMO_ADMIN_PASSWORD=… DEMO_ANALYST_PASSWORD=… DEMO_VIEWER_PASSWORD=… bun run db:seed-roles`:
  - `✓ workspace FoundrySignal Demo Team (cmwkfr3ju00007qt0cidp099z)`
  - `✓ demo-analyst@foundrysignal.aiazimara.com (ANALYST)` — status `updated`
  - `✓ demo-viewer@foundrysignal.aiazimara.com (VIEWER)` — status `updated`
  - `✓ demo-admin@foundrysignal.aiazimara.com (ADMIN)` — status `updated`
  - `✓ demo subscription created (RESEARCHER, …)` — then `updated` on re-run
  - watchlist / alert rules + events / saved search / notes / per-user research run + report: all seeded
- Honest note: the demo users **already existed**; the seed reports `updated`
  (passwords re-set to the values below), not `created`. Verification query
  confirms 3 memberships (ANALYST, VIEWER, ADMIN), 0 pending invitations,
  1 saved search, and the RESEARCHER ACTIVE subscription above.

### DEMO PASSWORDS — ROTATE BEFORE ANY EXPOSURE

Local dev seed only. These are for the dev database at 127.0.0.1:5433 and must be
rotated/discarded before any environment reachable by anyone else.

- `demo-admin@foundrysignal.aiazimara.com` → DEMO_ADMIN_PASSWORD = `uf7RULuslrY9db-EZNmDj-rs`
- `demo-analyst@foundrysignal.aiazimara.com` → DEMO_ANALYST_PASSWORD = `6FZ5d8QDZrLaMU0z_zKo6IZ-`
- `demo-viewer@foundrysignal.aiazimara.com` → DEMO_VIEWER_PASSWORD = `73_8IaPUAOB4L3vkLxK3W5vb`

## Task 9 — sameAs probe (PARTIAL — one URL added)

HEAD requests, 10s timeout, verbatim results (2026-11-17):

| URL | Result |
|---|---|
| `https://www.aiazimara.com` | **301 Moved Permanently** → `Location: https://aiazimara.com/` (Cloudflare, CF-RAY a5bdaa2239b1253d-JNB) |
| `https://aiazimara.com/` (redirect target of the candidate above) | **HTTP/1.1 200 OK** (Cloudflare, CF-RAY a5bdaa644b22253d-JNB, full HEAD captured; exit 0 on re-probe) |
| `https://github.com/aiazimara` | **404** |
| `https://x.com/aiazimara` | **404** |
| `https://www.linkedin.com/company/aiazimara` | **403** |

`src/lib/seo.ts` `organizationLd()` now includes
`sameAs: ["https://aiazimara.com/"]` — the only 2xx URL, and it is the canonical
target of the probed `www.aiazimara.com` candidate (verified via its own 301
redirect, not invented). GitHub/X/LinkedIn are **excluded** (404/404/403). The
`www.aiazimara.com` variant itself returns 301, not 2xx, so the apex is used.
No other URLs were added.

Note on curl exit codes: the batched probe loop exited 23 (write error to the
null device on this host) while still printing status codes; the apex was
re-probed standalone with `curl -sI` → `HTTP/1.1 200 OK`, `CURL_EXIT=0`.

## Task 10 — Verification

- `bun x tsc --noEmit` → **exit 0** (clean), run twice (after route/seed edits; again after the seo.ts edit).
- `bun test` → **148 pass, 0 fail**, 268 expect() calls, 7 files, ~2–4s.
  (stderr shows a pre-existing `AuditEvent_actorId_fkey` FK warning from
  crypto-checkout tests via `src/lib/domain/shared/audit.ts`; tests still pass. Not touched.)
- `bun run build` → **green**. Run 1 (after route/seed edits): completed, full route table printed, `[copy-build-assets] static + public -> .next/standalone`. A re-run inside this session initially failed with "Another next build process is already running" because a stale `.next/lock` (0-byte, no process holding it) was left by the interrupted turn; the lock was removed and the build re-ran to completion (exit 0, ~50s). Final build after the one-line seo.ts sameAs edit (background job bg_205): `✓ Compiled successfully in 3.6s`, `✓ Generating static pages using 11 workers (59/59) in 4.5s`, `[copy-build-assets] static + public -> .next/standalone`, **BUILD_EXIT=0**.
- `bun x tsc --noEmit` after the seo.ts edit → **TSC_EXIT=0**.

## Remaining unenforceable / data-only entitlements (and why)

- **comparativeResearch** — no endpoint exists anywhere; cannot be gated until one is built (see Task 4).
- **apiMonthlyCalls** — no API-key issuance/auth surface; nothing to meter (see Task 5). Team `50_000` / Enterprise `-1` remain unused data.
- **priorityCollection** — queue re-prioritization is a product decision; out of scope (see Task 6).
- **Enterprise `savedSearches`** — missing key in PLAN_SEED → resolves to 0 → 402 for Enterprise workspaces. PLAN_SEED not edited (not authorized to change plan data); add `savedSearches: -1` to ENTERPRISE to fix.
- **researchRooms, rolePermissions, auditExports, ssoScim ("ROADMAP"), customCollectionScopes, dedicatedSupport** — Team/Enterprise-only boolean/roadmap flags; no dedicated enforcement points were in scope for this pass. Report existence: not enforced server-side yet.
- **apiAccess** (Team `true` / Enterprise `true`) — no API-key surface to gate (same root cause as apiMonthlyCalls).
- **dossierAccess** — dossier gating exists elsewhere in the codebase (not part of this task set; not re-audited here).
- **seats for Explorer/Researcher/Professional = 1** — enforced, but note these plans' sole seat is consumed by the owner, so invitations always 402. Intended per PLAN_SEED.

## Files changed

- `src/app/api/v1/saved-searches/route.ts` — plan-capped saved searches
- `src/app/api/v1/alerts/route.ts` — `requireEntitlement(ctx, "alerts")` on POST
- `src/app/api/v1/workspaces/[id]/invitations/route.ts` — seat-limit enforcement on invite creation
- `scripts/seed-roles.ts` — idempotent RESEARCHER demo Subscription upsert (DEMO ENTITLEMENT comment)
- `src/lib/seo.ts` — `sameAs: ["https://aiazimara.com/"]` on Organization JSON-LD
- `docs/ENTITLEMENTS_FIX_REPORT.md` — this report

No marketing copy, security headers, rate-limit module, framework.ts, .env, or git
history were touched. No git commit was made.
