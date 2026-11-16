# FoundrySignal — Known Limitations

Honest, current as of 2026-11-16. Nothing here is hidden behind fake data.

These are **deployment configuration states**, not product capabilities: each one
is either already wired (credential present) or a single environment variable an
administrator sets. They are listed so no gap is silently simulated.

## Deployment constraints
1. **Database engine.** Sandbox uses Prisma + SQLite. The relational schema is written to be PostgreSQL-portable, but SQLite lacks: concurrent-write throughput, native enums (modeled as string unions with zod), and pgvector. Migration path documented in ARCHITECTURE.md.
2. **Queue driver.** Durable DB-backed queue replaces Redis + BullMQ. Semantics (idempotency, retries, backoff+jitter, timeouts, dead-letter, failure classification) are implemented and tested; horizontal scaling and at-least-once across processes require the BullMQ driver.
3. **Single-process shell routing.** App URLs resolve through one optional catch-all route (`src/app/[[...fs]]/page.tsx`) with server-side route validation: marketing/legal pages are server-rendered RSC (SEO surface), platform views are the client app, unknown paths return a real HTTP 404 with the branded page, and section state derives from the URL (deep links, refresh, back/forward all work).
4. **Email delivery.** Resend is the configured provider (`RESEND_API_KEY`); verification and password-reset tokens are generated and delivered through it. Without the key the UI says `EMAIL_NOT_CONFIGURED` instead of pretending to send.
5. **Process model.** One process runs API + worker loop; production splits `apps/worker`.

## Credential-gated (honest states implemented)
6. **GitHub token.** A personal access token is provisioned for this deployment. Without `GITHUB_TOKEN` in the environment, unauthenticated quota on the shared egress IP is exhausted and repository collection reports RATE_LIMITED with provider-degraded dossier states. No synthetic repository data is ever shown.
7. **Helius / indexed provider.** A Helius API key is available (`HELIUS_API_KEY`). Until it is set in an environment, the adapter contract and health registry report MISCONFIGURED and onchain data comes from public RPC reads only (limited throughput, no enhanced APIs).
8. **Billing provider (Stripe integration built, unconfigured).** The full Stripe path is implemented â€” checkout session creation, admin-gated portal, signature-verified webhook with insert-first idempotency ledger, subscription/entitlement sync â€” and is gated on env credentials (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`). Until set, every billing surface shows the exact missing env names (configuration gap), and `purchasingAvailable` stays false. No simulated payments. Onchain investment settlement is separate from subscription billing and needs no card processor; whether checkout should be fiat (Stripe) or onchain (USDC) is an explicit owner decision, not an environment gap.
9. **OAuth / MFA.** OAuth client credentials (GitHub/Google) and an MFA encryption key are present in environment configuration and reported by the capability registry. Interactive OAuth sign-in requires provider callback/redirect registration and route enablement; MFA requires user enrollment/verification flows. First-party password sessions remain fully supported.

## Product gates (deliberate, per spec)
10. **Trading execution.** Jupiter `/order`+`/execute` adapter code exists behind `TRADING_ENABLED=false` and pending legal/security/provider review. Quote preview and wallet connection are real.
11. **Legal review.** Paid research services, issuer services, trading, and geographic availability require professional legal assessment before commercial activation; no compliance claims are made anywhere in the product.
12. **Name/trademark clearance.** "FoundrySignal" is a working name.

## Design system gaps (2026-11-16)
17. **Visual regression baseline absent.** `/design-system` is the visual target but no committed pixel diff harness; capture was verified manually via Playwright during implementation.
18. **Storybook not present.** `/design-system` serves component isolation; a Storybook migration is a future refactor task, not shipped in this pass.
19. **Signal Prism low-end unverified.** WebGL â†’ Canvas 2D â†’ static chain implemented; no hardware-lab run on low-spec Android confirmed yet.
20. **`next-themes` unused.** Left in deps to avoid lockfile churn; remove in next dependency refresh.
21. **shadcn compatibility layer frozen.** `@/components/ui/*` retained for Radix primitives; not migrated to DS; removal deferred to a dedicated pass.
22. **Focus-visible coverage audited manually.** Interactive DS controls verified by hand; no axe-core automated run in this sandbox.

## Data scope honesty
13. **Venture registry is empty by design.** No fabricated companies. The registry grows through real ingestion (URL submission â†’ collectors) or admin entry; empty states explain this.
14. **Founder identity.** No identity is auto-linked; attribution confidence is explicit; without founder-provided or corroborating evidence, founder sections remain `UNKNOWN`/`SELF_ASSERTED`.
15. **Website collection.** Many venture sites block server-side fetch (observed 429s); those sources show PROVIDER_BLOCKED.
16. **AI grounding.** The analyst can only cite evidence present in the database; for sparsely ingested ventures most sections will correctly answer "insufficient evidence". This is by design, not a bug.

