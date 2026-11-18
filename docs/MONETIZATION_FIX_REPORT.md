# Monetization fix report — onchain revenue enablement

Date: 2026-11-17. Scope: P0 monetization hardening for FoundrySignal (USDC-on-Solana checkout).

## Files changed

**New**
- `src/lib/domain/billing/entitlements.ts` — server-side entitlement resolution (`getEntitlements`, `currentPlan`, `requireEntitlement`, `assertPlanAllows`, `planLimit`). Reads `Subscription` (status `ACTIVE`, `currentPeriodEnd` unset or in the future) → joined plan's `entitlementsJson`. Absent/expired/foreign/inactive-plan subscription falls back to the active `EXPLORER` plan. Corrupt `entitlementsJson` parses to `{}` and denies everything — never throws, never 500s. Numeric limits: `-1` unlimited, `0` not included, `n` cap.
- `tests/entitlements.test.ts` — Explorer denied, Researcher allowed, expired Explorer fallback, corrupt-JSON plan, 402 contract (`PAYMENT_REQUIRED` → HTTP 402).
- `.env.example` — every env key the code reads, with purpose comments, no real values. `.gitignore` gained `!.env.example` (`.env*` previously ignored it).
- `docs/MONETIZATION_FIX_REPORT.md` — this file.

**Modified**
- `src/lib/contracts/api.ts` — new `PAYMENT_REQUIRED` error code → HTTP `402`.
- `src/app/api/v1/research/runs/route.ts` — `POST` enforces `researchRunsPerMonth` as a rolling 30-day `db.researchRun.count(createdAt >= now-30d)` in addition to the existing 2-concurrent guard. Explorer (0) → `402 PAYMENT_REQUIRED` before any run starts. The caller's own plan limit (`-1` = unlimited) is returned by `assertPlanAllows`.
- `src/app/api/v1/reports/[id]/export/route.ts` — `GET` gated on `entitlements.reportExport` via `requireEntitlement` (Explorer → 402), enforced before any report lookup.
- `src/app/api/v1/watchlists/route.ts` — `POST` cap replaced: hardcoded `12` → plan's `watchlists` limit (`-1` honored; exceeded → 402 with `{limit, used}`). `DELETE` deliberately not capped — removal cannot exceed a quota.
- `src/lib/domain/ventures/service.ts` + `src/app/api/v1/ventures/route.ts` — new venture intake enforces `savedVentures`. Count = ventures created by **this workspace's members** (`createdById ∈ membership.userId`), evaluated only when a *new* venture would be created (re-submissions that dedup to an existing venture never consume quota). `-1` honored; exceeded → 402.
- `src/app/api/v1/billing/status/route.ts` — `PLATFORM_ADMIN/MODERATOR` gate replaced by `requireAuth` + `requireWorkspaceRole(ctx, "ADMIN")`. Response split into `{ workspace, plans }`: `plans` = purchasable plans (all authenticated workspace admins), `workspace` = the caller's own subscription + provider/configured/checkoutReady/mint + generic note. Deployment internals (`destination`, `missingEnv` env-var names) are included only for platform admins.
- `src/components/fs/settings-view.tsx` — `BillingSection` renders for every authenticated user (un-gated from `isPlatformAdmin`). Purchase buttons (and `?checkout=` auto-start) only for workspace `OWNER`/`ADMIN` (`canPurchase`); everyone else gets read-only plan/subscription view ("admin only" affordances) and a 403 from the API renders a "visible to workspace admins" notice instead of an error. `BillingStatus` interface updated to `{ workspace, plans }` shape. Reads `checkout` search param via `useSearchParams`; `?checkout=<CODE>` + workspace ADMIN → auto-invokes the same `startCheckout` handler the button uses (once per requested plan) and visually pre-highlights the plan row. Non-admins with the param see a "only workspace admins can complete a purchase" notice. Deployment-config sections (capability registry, provider health) remain platform-admin-only.
- `src/components/fs/marketing/page.tsx` — pricing CTA: `/auth` → `/settings?checkout=<planCode>` (Enterprise stays `/contact`). No copy/layout/design changes.
- `test-fs.db` — `CryptoPaymentIntent` table created by applying `prisma/migrations/20261116_usdc_checkout/migration.sql` (SQLite). `db.cryptoPaymentIntent.create` now works against it.

## Enforcement points (server-side only)

| Route | Entitlement | Behavior |
|---|---|---|
| `POST /api/v1/research/runs` | `researchRunsPerMonth` | rolling 30-day count; limit 0 → 402; over cap → 402 |
| `GET /api/v1/reports/[id]/export` | `reportExport` | falsy → 402 |
| `POST /api/v1/watchlists` | `watchlists` | `-1` ok; `count >= limit` → 402 (was hardcoded 12) |
| `POST /api/v1/ventures` | `savedVentures` | member-created count at new-venture creation; over cap → 402 |

Entitlement checks live in `src/lib/domain/billing/entitlements.ts`, called only from route handlers / domain services. No client component enforces anything; the UI only hides/disables controls for ergonomics.

## Entitlement matrix (from `src/lib/domain/billing/plans.ts`, `entitlementsJson`)

| Entitlement | EXPLORER ($0) | RESEARCHER ($39) | PROFESSIONAL ($99) | TEAM ($299) | ENTERPRISE (custom) |
|---|---|---|---|---|---|
| savedVentures | 10 | 100 | 500 | 2000 | −1 (∞) |
| researchRunsPerMonth | 0 | 25 | 100 | 400 | −1 |
| watchlists | 1 | 5 | 20 | 100 | −1 |
| reportExport | false | true | true | true | true |
| alerts | false | true | true | true | true |
| dossierAccess | PUBLIC | FULL | FULL | FULL | FULL |
| comparativeResearch | — | — | true | true | true |
| savedSearches | — | — | 50 | 200 | — |
| priorityCollection | — | — | true | true | true |
| researchRooms / rolePermissions / auditExports | — | — | — | true | true |
| apiAccess | false | false | false | true | true |
| apiMonthlyCalls | — | — | — | 50 000 | −1 |
| seats | 1 | 1 | 1 | 5 | −1 |

**Enforced today:** `researchRunsPerMonth`, `reportExport`, `watchlists`, `savedVentures`. The remaining keys are data for future gates; nothing else enforces them.

## Verification (actually run)

- `bun x tsc --noEmit` → clean, exit 0.
- `bun test` → **135 pass, 0 fail** (128 baseline + 7 new). Pre-existing stderr: `auditEvent` FK violation logged by `tests/crypto-checkout.test.ts` — present on unmodified baseline too, non-fatal.
- `bun run build` (`next build && node scripts/copy-build-assets.mjs`) → **success**; `/settings` static shell built, all API routes compiled.
- Standalone server probe (`PORT=3100`): `GET /pricing` → 200, HTML contains `/settings?checkout=EXPLORER|RESEARCHER|PROFESSIONAL|TEAM`; `GET /settings?checkout=PROFESSIONAL` → 200. Unauthenticated visitors land on the auth view at the same URL; after sign-in the same URL re-renders settings with the param intact (URL is not rewritten), so the deep link completes end-to-end.
- `test-fs.db`: `CryptoPaymentIntent` table present with all columns/indexes from the `20261116_usdc_checkout` migration.

Note on the test DB: `bun test` connects via `DATABASE_URL` from `.env` (PostgreSQL at `127.0.0.1:5433`), where `CryptoPaymentIntent` already exists — the suite exercises Postgres, not `test-fs.db`. `test-fs.db` was patched anyway as requested; its schema is SQLite while `prisma/schema.prisma` targets postgresql, so `prisma migrate deploy` cannot target it — the migration SQL was applied directly.

## What still requires operator action

1. **`PAYOUT_WALLET`** — unset in `.env`. Until it is set to the platform's Solana USDC receiving wallet, `POST /api/v1/billing/checkout` returns `501 CONFIGURATION_REQUIRED` and the settings billing panel shows the exact missing env name (platform admins) or a generic "not enabled on this deployment" (workspace admins). No payment can be taken and no subscription can be granted.
2. `SOLANA_RPC_URL` — defaults to public mainnet RPC; set a dedicated provider for production verification load.
3. `USDC_MINT` — defaults to canonical Solana USDC; override only for devnet/testing.
4. Stripe path (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_RESEARCHER|PROFESSIONAL|TEAM`, optional `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`) — documented in `.env.example`; independently config-gated, not required for USDC checkout.
5. Apply the same `usdc_checkout` migration to any other environment's database (staging/prod) — `db push` or reviewed migration run.
6. Legal review gates for paid research services remain required before commercial activation (unchanged, by design).

## Observations / non-goals (not changed, per scope)

- `EXPLORER` ($0) appears in the purchasable plans list (`monthlyPriceMicros >= 0` filter, pre-existing) so "Start with Explorer" deep-links to a zero-amount intent; harmless but odd — flagging for the pricing owner.
- Watchlist `DELETE` intentionally ungated (removal never exceeds quota).
- Venture quota counts member-created ventures workspace-wide; there is no per-workspace "saved venture" join in the schema — this is the closest faithful reading of `savedVentures` with the current data model. Dedup matches never consume quota.
- `/settings` billing for non-admin workspace members shows a read-only/403 notice because `GET /api/v1/billing/status` now requires workspace ADMIN (per spec); there is no lower-privilege billing read surface.
- `TRADING_ENABLED`, research/report generation, and all other surfaces untouched. No marketing copy, design system, or page content modified beyond the one CTA href.
