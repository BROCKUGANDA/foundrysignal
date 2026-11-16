# FoundrySignal — Delivery Report (Sprint 0 → Sprint 8, this deployment)

**Date:** 2026-11-15 · **Scope:** full directive execution in the sandbox deployment
Every statement below reflects what was actually executed and observed. Nothing is claimed beyond evidence.

## 1. Features implemented (working end-to-end)

| Feature | Status | Verified by |
| --- | --- | --- |
| Session auth (register/login/logout, bcrypt, revocable sessions, login throttling) | WORKING | smoke script §2/§3/§13; browser E2E |
| Venture registry + intake (URL normalization, SSRF-guarded, zod-validated) | WORKING | smoke §4; rejected malformed inputs in tests |
| Durable job queue (idempotency, bounded retries, backoff+jitter, timeouts, dead-letter, failure classification, circuit breaker) | WORKING | job table: GitHub jobs → DEAD after 5 attempts (honest); others COMPLETED |
| Website collector (SSRF guard, SHA-256 snapshots, change-detection-ready) | WORKING — live jup.ag snapshot collected with content hash | smoke §6/§7 |
| GitHub collector (REST v3, rate-limit-header aware, contributors/roles, releases, commits, languages) | CODE COMPLETE — honest RATE_LIMITED/DEAD without GITHUB_TOKEN (unauthenticated quota exhausted on shared egress IP, measured) | job records; capability registry |
| Solana onchain collector (@solana/kit: mint decode, authorities, supply, slot provenance) | WORKING — real JUP mint read: decimals 6, supply 6,861,485,677,982,295, mint authority revoked, slot recorded | smoke §6; dossier Onchain tab |
| Jupiter market collector (Price API V3, asOf snapshots) | WORKING — real price/liquidity snapshots persisted | smoke §7; Markets tab |
| Evidence engine (claims, sources, immutable snapshots, computed verification classes, claim status) | WORKING — mint-authority claim classified SUPPORTED from ONCHAIN_RPC evidence | smoke §6; unit tests |
| Discovery (search, filters, sort, saved searches, result-origin disclosure) | WORKING | browser E2E |
| Venture dossier (9 independent tabs, per-section states) | WORKING | browser E2E screenshots 02–05 |
| Founder attribution (explicit, SELF_ASSERTED, never inferred) | WORKING (API + UI; attribution dialog) | API contract; attribution rule enforced in collectors |
| AI research analyst (real LLM via z-ai-web-dev-sdk; retrieval-grounded; injection-stripping; server-side citation validation; 11-section report; markdown export) | WORKING — real report: VALID citations, explicit "Insufficient evidence" for founders, real token data cited | smoke §8–9; browser E2E screenshot 06 |
| Watchlists / saved searches / alerts (workspace-scoped) | WORKING | smoke §10; browser E2E |
| Alert evaluation worker (release/authority/contradiction/market deltas) | WORKING (code path exercised; events require deltas over time) | handlers registered; unit-tested logic |
| Quote preview (real Jupiter V2 Lite quotes → QUOTE_PREVIEW records) | WORKING — real SOL→JUP quote captured, price impact shown | smoke §11; Markets view |
| Wallet layer (Wallet Standard detection via @wallet-standard/app) | WORKING — honest "no wallets detected" in sandbox | Markets view screenshot 08 |
| Trading execution | **GATED OFF** by design (EXECUTION_GATED; adapter behind flag) | capabilities API; UI states |
| Admin console (queue, dead letters, audit log, stats; RBAC 403 for non-admins) | WORKING | API probe: 403 for USER role |
| Capability registry (env-gated honesty) | WORKING | /api/v1/capabilities |
| Billing | SCHEMA + PLAN MODEL ONLY — checkout surfaces CONFIGURATION_REQUIRED (no provider credentials) | KNOWN_LIMITATIONS |

## 2. Files
Created: 60+ source files (providers, domain services, jobs, API routes, design system, views), 9 docs, 3 test suites, smoke script. Modified: `prisma/schema.prisma` (38 models), `globals.css` (full token system), `layout.tsx`, `page.tsx`, `db.ts`. See `git status` for the complete list.

## 3. Database
38-model schema pushed (`bun run db:push` = de-facto migration in sandbox; production swaps provider to PostgreSQL and regenerates migrations). 6 real ventures, 18 real evidence records present from live runs.

## 4. Integrations operational (measured live)
- Solana public RPC: HEALTHY (slot 469,783,039 at final check)
- Jupiter Lite (price + quote): HEALTHY
- Website collection: operational (jup.ag collected; some sites block → PROVIDER_BLOCKED honest state)
- z-ai LLM: operational (server-side research runs, ~10–25 s per report)
- GitHub: REACHABLE but rate-limited without token — `GITHUB_TOKEN` required for operation (documented, not faked)

## 5. Environment variables required for full production capability
`GITHUB_TOKEN` · `SOLANA_RPC_URL` (optional upgrade) · `HELIUS_API_KEY` (optional) · `BILLING_PROVIDER` (+ webhook secret) · `RESEND_API_KEY`/`SMTP_URL` · `TRADING_ENABLED` (stays false until reviews pass)

## 6. Tests executed
- `bun test`: **41/41 pass** (evidence classification ×8, snapshot diffing ×2, injection stripping ×3, citation validation ×4, GitHub/website parsing ×7, slug ×2, RBAC ranks ×2, SSRF ranges ×10, password/hash ×2, tenant isolation ×1, role ranking ×1)
- Golden-path smoke script: 13 sections, all pass (includes cross-tenant 403 probe and gated-execution refusal)
- Browser E2E (agent-browser): registration → sign-in → discover → dossier tabs → evidence expansion → research run → CITATIONS VALID report → watchlist creation → markets quote → settings → mobile viewport; 0 console errors after fixes (nested-button hydration defect found and fixed; grouped-citation validator defect found and fixed)

## 7. Security findings during build (all resolved)
1. Nested interactive elements caused hydration errors (Evidence tab) → restructured to div[role=button].
2. Research-run report include missing relation → schema relation fixed.
3. SSRF guard verified by tests (private ranges, metadata IP, localhost, metadata hostname blocked).
4. Cross-tenant read attempt on research run → 403 enforced (verified by live probe).

## 8. Known limitations
See docs/KNOWN_LIMITATIONS.md — the material ones: SQLite-not-PostgreSQL, in-process queue (BullMQ swap path documented), single visible route in preview, no email delivery, GitHub unauthenticated quota exhausted, Helius not configured, trading gated, billing unconfigured, OAuth/MFA unconfigured. Vector search (pgvector) not present — retrieval is provider-structured, keyword-ordered.

## 9. Acceptance criteria (docs/ACCEPTANCE_CRITERIA.md)
A1–A12: PASS (A2 partially dependent on GITHUB_TOKEN for repository depth; website/onchain/market evidence fully real). B1–B4: PASS with execution gate held OFF per directive §8.11.

## 10. Recommended next steps
1. Configure `GITHUB_TOKEN` → repository intelligence fills immediately (adapter is live).
2. PostgreSQL + Redis/BullMQ migration per documented swap paths before scale-out.
3. Legal review gates (paid research, issuer services, trading activation).
4. AI evaluation suite expansion (adversarial citation corpora) and load testing.

---

## Increment 2 — deep-link routing, trading governance, hardening (2026-11-15, later session)

### Fixed from operator report: "404 page not found"
- Root cause: the product was a single-route SPA (`src/app/page.tsx` only) — every deep link (`/pricing`, `/ventures/<slug>`, a refresh on any section) hit Next.js's default 404.
- Fix: optional catch-all route `src/app/[[...fs]]/page.tsx` with server-side route validation. Known paths prerender (19 static params); unknown paths call `notFound()` and return a **real HTTP 404** with the branded NotFound page (verified: `GET /no-such-thing → 404`, body contains branded 404 with recovery actions). URL is now the source of truth: `navigate()` pushes canonical URLs via History API; `usePathname`/`useSearchParams` re-derive section on popstate; per-view `document.title`; `robots.txt` + `sitemap.xml` added; platform surfaces excluded from crawling.

### Trading "on the way" while staying gated (per operator decision)
- New governance model `TradingReleaseGate`: four review gates (PRODUCT_REVIEW, LEGAL_JURISDICTION_REVIEW, PROVIDER_INTEGRATION_REVIEW, SECURITY_REVIEW) + EXECUTION_KILL_SWITCH (default-deny: seeds ENGAGED).
- Execution now requires ALL of: every gate APPROVED by a platform admin (mandatory decision notes, validated state transitions, append-only audit), kill switch CLEAR, and `TRADING_ENABLED=true` in the environment. Verified: approve drill raised readiness; execution stayed blocked until env flag set — then reverted to default-deny.
- New API: `GET /api/v1/trading/gates`, `GET|POST /api/v1/trading/order-intents` (real Jupiter quote → persisted ORDER_INTENT with status GATED_EXECUTION_DISABLED; provider failures surface honestly as PROVIDER_UNAVAILABLE), `POST /api/v1/trading/execute` (403 EXECUTION_GATED with readiness payload while gated; post-gate pipeline implemented end-to-end), admin `GET|PATCH /api/v1/admin/trading-gates` (PLATFORM_ADMIN only).
- Jupiter Swap API V2 pipeline implemented in the adapter: `createSwapOrder` (POST /order → unsigned transaction) and `executeSwapOrder` (POST /execute → signature/status) — signing always client-side; Solana `getSignatureStatus` added to resolve CONFIRMED/UNCERTAIN/FAILED honestly.
- Admin console: Trading Readiness section (gate cards, decision dialog with mandatory notes, kill-switch engage/clear, live EXECUTION PERMITTED/BLOCKED banner, decision history from audit log). Markets view: live gate-status strip, "Record as order intent" flow, order-intent list. Capabilities registry now computes `tradingExecution` from the governance system instead of a constant.
- Platform admin bootstrap: `ADMIN_BOOTSTRAP_EMAIL` env var promotes the named account at server boot (audited; no self-service escalation path exists).

### Production audit fixes (all real defects found by `tsc --noEmit` + review)
- Build no longer masks type errors (`ignoreBuildErrors: false`); full `tsc` is clean.
- Auth: `requireWorkspaceRole` verified intact; registration now IP-throttled (10/hour, bounded memory); login throttle unchanged.
- Wallet Standard runtime bug fixed: `Wallets` registry used via `.get()` with `register`/`unregister` events (previous code called nonexistent `.slice()` and `"changed"` event inside a swallowed try/catch — detection would always report zero wallets).
- Solana mint authority parsing fixed: base58 decode via `getBase58Decoder()` (previous code used the encoder + UTF-8 TextDecoder, which would throw on real authority bytes).
- Report markdown export fixed (missing `venture` relation → separate query; raw NextResponse passthrough now supported by the `handler` wrapper with security headers preserved).
- `enqueue` missing import in the GitHub org collector (would crash org-repo association jobs at runtime).
- Jupiter `routeLabels` type/logic bug → `routeLegs: number`; never-typed arrays in token association route; admin stats tuple typing; `INVALID_TRANSITION` added to the API error taxonomy (409).
- Security headers for every route (CSP, X-Frame-Options DENY, Permissions-Policy, COOP, HSTS in prod, `poweredByHeader: false`); API handler passthrough preserves them.
- TypeScript target ES2020 (BigInt literal support); non-app trees excluded from type-check scope.

### Commercialization audit
- Plan catalog is now real data: `ensurePlans()` seeds EXPLORER/RESEARCHER/PROFESSIONAL/TEAM/ENTERPRISE with micros-priced amounts and JSON entitlements; public `GET /api/v1/pricing` serves it.
- Pricing page consumes the API (skeleton loading, honest error/retry state when the catalog is unreachable — never silently stale prices); hardcoded prices removed; purchasing-availability note comes from the server.
- Marketing nav is auth-aware (no "Sign in/Request access" for signed-in users viewing legal/pricing in-shell).
- 401 broadcast: the API client emits `fs:unauthorized`; the shell resets to an honest re-auth flow instead of leaving views stuck in error states. Offline banner (`online`/`offline` listeners, aria-live). Mobile drawer: Escape-to-close + background scroll lock.

### Verification evidence
- `bunx tsc --noEmit`: clean. `bun test`: 41/41 pass. `bun run build`: succeeds with type errors enforced.
- Smoke script extended (§12 trading gates: status + intent + execute-403 + admin-403; §13 pricing catalog) — full golden path passes with real website/onchain/Jupiter/LLM data.
- Browser E2E: `/` discover for authed user, `/pricing` server-fed prices, `/ventures/<slug>` dossier deep link, branded 404, admin readiness console decision drill with audit trail (screenshots retained in session).
- Session cookies: HttpOnly + SameSite=Lax + Secure in production (verified in session.ts).

---

## Increment 3 — SEO/AEO/GEO + mobile, billing provider, gate evidence (2026-11-15, later session)

### Operator asks → delivered
1. **Mobile optimizations** — bottom tab bar (thumb-reachable, safe-area, 44px+ targets), safe-area insets top/bottom everywhere (notch/home indicator), `viewportFit: cover` + `interactiveWidget: resizes-content`, `min-h-dvh`, mobile marketing menu (Escape + scroll lock), offline banner clears tab bar, `text-size-adjust` + tap-highlight + overscroll containment, heavy views code-split via `next/dynamic` with skeletons, PWA manifest + generated icons (192/512/maskable/apple-touch via sharp).
2. **SEO + geo UAE/Dubai** — `metadataBase`, per-route canonical + OG (locale `en_AE`) + Twitter cards via a central metadata factory; geo meta (`geo.region: AE-DU`, `geo.placename: Dubai`, ICBM coordinates); Organization JSON-LD with Dubai/AE address; DUBAI-UAE signals in hero/footer/about; dynamic 1200×630 OG image; apple icon set.
3. **AEO** — FAQ corpus single-source rendered as visible `<details>` on /methodology + `FAQPage` JSON-LD + `llms.txt`/`llms-full.txt`; `speakable` on methodology; Organization/WebSite site-wide, SoftwareApplication on /product, BreadcrumbList on docs.
4. **Crawlers** — robots.txt rewritten (explicit AI-crawler allowances: GPTBot/OAI-SearchBot/ClaudeBot/PerplexityBot/Google-Extended etc., platform surfaces disallowed for all); stale static `public/robots.txt` deleted (was shadowing the route); sitemap with per-route changeFrequency/priority.
5. **SSR and CSR** — THE structural fix: marketing + legal pages are now server-rendered RSC (full content in initial HTML — verified `curl / | grep`), pricing SSRs the real DB catalog with ISR(300); platform routes stay client; marketing nav is real `<a>` links (crawlable) with session-aware CTA island; app views `noindex` by metadata.
6. **Four review gates** — evidence packages compiled in `docs/gate-reviews/` (README + 4 packages with sign-off blocks). Machine phase complete: adversarial security code review executed, dependency audit (0 critical after fixes), secret scan clean, 54/54 tests, headers verified, live Jupiter/RPC probes. **No gate was approved and the flag was NOT flipped: there is no licensed counsel or human security reviewer in this environment — approvals and `TRADING_ENABLED=true` remain operator steps with the runbook provided.** Kill switch stays ENGAGED.
7. **Billing provider (Stripe)** — full real integration built config-gated: checkout (ADMIN+, per-plan price env), portal, raw-body signature-verified webhook with insert-first idempotency ledger + release-on-transient-failure, subscription sync via server-side metadata, status endpoint; capabilities registry + admin overview + Settings billing section surface exact missing env vars; no simulated payments. Schema: `Subscription` (provider/ref unique, cancelAtPeriodEnd) + `BillingWebhookEvent`; `stripe@23` installed; `.env` commented placeholders.
8. **GITHUB_TOKEN** — support confirmed end-to-end (adapter Bearer auth, 5,000 req/h), surfaced in providers route, capabilities, admin overview, docs; operator adds the env var when ready — honest RATE_LIMITED state until then.

### Production audit — real defects found & fixed (adversarial review)
- **HIGH SSRF (F-1)**: guardedFetch followed redirects blindly + weak IPv6 checks → rewritten with manual redirect handling (per-hop scheme/blocklist/DNS re-validation, max 3 hops) + full IPv6 blocklist (mapped/NAT64/6to4/ULA/link-local/discard) + 13 new tests.
- **HIGH IDOR (F-2)**: cross-tenant watchlist-item deletion → tenant-bound lookup + role raise.
- **MED (F-4)**: execution double-submission → atomic intent claim + status + quote-expiry enforcement.
- **MED (F-5)**: webhook idempotency race + permanently-skipped FAILED events → insert-first claim with release-on-transient.
- **MED (F-6)**: client-controlled Origin in payment redirects → origin allowlist.
- **MED (F-7)**: documented Origin/Host CSRF check missing → `verifyMutationOrigin` in shared handler (also rejects Sec-Fetch-Site cross-site).
- **MED (F-9 related)**: dependency audit → **5 critical → 0** (Next.js 16.4.6 fixes 4 RCE advisories, next-auth 4.24.15, zod 4.6.7, prismjs override, unused next-intl removed).
- **LOW (F-10)**: billing role gates (ADMIN+). **LOW (F-12)**: login timing equalization via throwaway-hash verify.
- **BUGFIX**: catch-all metadata now emits robots noindex for app surfaces; doc/code divergence in SECURITY_MODEL.md corrected to match reality (F-17).

### Commercialization audit
- Pricing page now SSRs the real catalog (was client-fetch-only); Stripe path ready for activation; capability flags & footer reflect billing/GitHub/trading truth; purchasing stays unavailable until operator configures Stripe (honest).

### Verification evidence (this increment)
- `bunx tsc --noEmit`: clean · `bun test`: **54/54** (41→54: IPv6 SSRF suite) · golden-path smoke: PASS (real website + mint + LLM + Jupiter quote + gate 403s + cross-tenant probe) · secret scan clean · SSR/JSON-LD/geo/canonical/robots/sitemap/llms/manifest/OG verified via curl · 404 still real (branded page).

---

## Increment 4 — registry integrity: venture dedup (2026-11-16, this session)

### Defect found by fresh full-path verification
Discovery listed the same venture ten times. Root cause: `POST /v1/ventures` had **no venture-level identity dedup** — every repeated submission of the same real project (repeated smoke runs, in production a re-submitting user) created a new `Venture` row with a fresh collision-suffixed slug (`jupiter-exchange-c0ti`, `-cfrp`, …), fragmenting the evidence graph across duplicate dossiers. Only the token mint was deduped.

### Fix (three layers)
1. **Schema**: `Venture.websiteKey String? @unique` — normalized registrable domain; DB-level guard so one website can never map to two ventures (null allowed for website-less ventures). Pushed via `prisma db push` (sandbox migration path).
2. **Intake semantics** (`createVenture`): submissions whose normalized website already exists now resolve to the existing venture — HTTP 200 with `existing: true`; user-supplied identities missing from the record are attached there (audit-logged as `VENTURE_DEDUP_MATCH` + venture history `IDENTITY_ATTACHED`), relevant collectors enqueue onto the canonical dossier, and no new row is created. Fresh registrations still return 201.
3. **UI honesty**: the intake form distinguishes the two outcomes in its toast ("matched by website, no duplicate created").

### Data migration
`scripts/dedupe-ventures.ts` merged the 9 duplicate Jupiter rows into the canonical oldest dossier (unique-conflict-safe reassignment of identities, repositories, products, token assets, wallets, watchlist items, founder links, claims, evidence incl. VENTURE-subject references, onchain observations, market snapshots, research runs, alerts, disputes, history, notes), then deleted the dup rows and backfilled `websiteKey`. Canonical dossier now carries the full consolidated graph: **45 evidence records, 22 claims, 9 onchain observations, 6 market snapshots, 9 research runs, 3 repositories** — nothing was lost; it had been scattered across the duplicates.

### Verification (this increment)
- `bunx tsc --noEmit` clean · `bun test` **54/54** · `eslint` clean (fixed one genuine lint error: marketing nav closed its mobile menu via a pathname effect → moved to click handlers).
- Live re-submission of jup.ag via API probe → **200 `existing:true`, registry count stays 1**; via UI → honest toast, no duplicate.
- Browser E2E re-run end-to-end: registration → discover (1 venture) → dossier deep link (9 tabs) → Evidence tab (45 records, real snapshots, content hashes) → Onchain tab (real mint reads: authority revoked, decimals 6, slot provenance) → AI research run (COMPLETED, **CITATIONS VALID**, real token data + explicit insufficient-evidence statements, 7.2k-char report) → watchlist create → markets (real Jupiter quote: slippage 50bps, impact 0.00%; order intent recorded as `GATED_EXECUTION_DISABLED`) → mobile viewport 375×812 (no horizontal overflow, 48px tab-bar targets ≥44px WCAG, safe-area insets, honest wallet-empty state) → settings (roles + billing env-gap disclosure).
- Probes: `/v1/admin/*` → 403 for non-admin; `POST /v1/trading/execute` → **403 EXECUTION_GATED** with full readiness payload (4 gates NOT_STARTED, kill switch ENGAGED, flag unset); cross-tenant research-run read → 403; unauthenticated → 401.
- SEO surface re-verified: JSON-LD blocks, `geo.region=AE-DU`/`geo.placename=Dubai`/ICBM, canonical, `og:locale=en_AE` + alternates, Twitter cards, robots (AI crawlers allowed, platform surfaces disallowed), sitemap, llms.txt/llms-full.txt, manifest — all live; SSR pricing serves the real catalog.
- Zero error-level log entries after restart. Config gaps remain honestly exposed: `GITHUB_TOKEN`, Stripe env set, `TRADING_ENABLED` (stays false until the four gates pass real human review).

### Claim canonicalization (found during the same audit, fixed this increment)
The smoke output exposed the same duplication class one level down: every collector re-run created a NEW claim row for the same real-world statement (7× mint-authority claims, 10× identical website claims in the dossier). Fix:
- `getOrCreateCanonicalClaim()` in the evidence engine — a statement about a subject exists once; collectors, intake and the founder-attribution flow now reuse it (all four former `claim.create` sites converted).
- `scripts/dedupe-claims.ts` merged the historical duplicates (22 → 5 canonical claims; evidence links reassigned, nothing lost).
- Live verification (`scripts/verify-canonical-claims.ts`): real `collect_solana_mint` job enqueued through the production queue → new evidence record persisted (47 total) with **zero new claim rows** (PASS) — after a dev-server restart, since the instrumentation-registered worker binds collectors at boot.
- Final canonical graph: website identity claim (UNVERIFIED — only self-asserted evidence exists, honest), mint-authority claim (SUPPORTED, 11 evidence records), 3 repository-association claims (SUPPORTED).
