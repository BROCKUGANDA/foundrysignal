# FoundrySignal — Known Limitations

Honest, current as of 2026-11-16. Nothing here is hidden behind fake data.

These are **deployment configuration states**, not product capabilities: each one
is either already wired (credential present) or a single environment variable an
administrator sets. They are listed so no gap is silently simulated.

## Deployment constraints
1. **Database engine.** Production and development both run PostgreSQL 18 (schema is Prisma-managed with versioned migrations under `prisma/migrations/`). No SQLite dependency remains.
2. **Queue driver.** Durable DB-backed queue replaces Redis + BullMQ. Semantics (idempotency, retries, backoff+jitter, timeouts, dead-letter, failure classification) are implemented and tested; horizontal scaling and at-least-once across processes require the BullMQ driver (Redis is running on the host, the driver swap is not done).
3. **Single-process shell routing.** App URLs resolve through one optional catch-all route (`src/app/[[...fs]]/page.tsx`) with server-side route validation: marketing/legal pages are server-rendered RSC (SEO surface), platform views are the client app, unknown paths return a real HTTP 404 with the branded page, and section state derives from the URL (deep links, refresh, back/forward all work).
4. **Email delivery.** Resend is the configured provider (`RESEND_API_KEY`); verification and password-reset tokens are generated and delivered through it. Without the key the UI says `EMAIL_NOT_CONFIGURED` instead of pretending to send.
5. **Process model.** One process runs API + worker loop; a separate worker process is not deployed yet.

## Credential-gated (honest states implemented)
6. **GitHub token.** A personal access token is provisioned for this deployment. Without `GITHUB_TOKEN` in the environment, unauthenticated quota on the shared egress IP is exhausted and repository collection reports RATE_LIMITED with provider-degraded dossier states. No synthetic repository data is ever shown.
7. **Helius / indexed provider.** `HELIUS_API_KEY` is set in production; without it the adapter contract and health registry report MISCONFIGURED and onchain data falls back to public RPC reads only (limited throughput, no enhanced APIs).
8. **Checkout (USDC on Solana).** Onchain checkout is built end to end: the client requests a payment intent, receives the platform destination wallet, the exact amount and a binding memo, then asks for verification; entitlement is granted only after a matching transfer is read from Solana (`CryptoPaymentIntent` → idempotent subscription upsert). Requires `PAYOUT_WALLET`; `USDC_MINT` defaults to native Solana USDC. Until configured, billing surfaces state `CONFIGURATION_REQUIRED` with the missing variable and no payment is simulated.
9. **OAuth sign-in (GitHub / Google).** Implemented with authorization-code + PKCE S256, server-side hashed single-use state, a `redirect_uri` derived only from `NEXT_PUBLIC_SITE_URL`, and linking **only** by provider-asserted verified email. It becomes available when the provider client id/secret are set; the OAuth buttons then appear on the sign-in page. **Operator action still required:** register the callback URLs `<site>/api/v1/auth/oauth/github/callback` and `<site>/api/v1/auth/oauth/google/callback` with each provider. A live token exchange has not been exercised against real provider credentials; it is covered by injected-response tests and route-level smoke checks.
10. **MFA.** Implemented as described in `SECURITY_MODEL.md`. Requires `MFA_ENCRYPTION_KEY`; without it enrollment is unavailable and enrolled accounts fail closed. Attempt counters are in-process; the cross-process DB rate limiter in the API wrapper is the second layer.

## Not implemented (stated, never faked)
- BullMQ queue driver and a separate worker process.
- Visual regression harness, Storybook migration, low-end Android hardware pass.
- An independent WCAG 2.2 AA audit. `/accessibility` states what is implemented and what is not; no conformance claim is made.
- An explicit Terms-of-Service consent step for OAuth-created accounts. Credential registration records acceptance with a version stamp; OAuth accounts have `termsAcceptedAt=NULL` until this is added.
- A production restore drill, a persistent staging environment, and live provider sign-in/payment verification.

## Implemented but worth stating
- Checkout watcher (`billing_intent_watcher`) settles pending USDC intents server-side every two minutes and expires stale ones. It reduces, but does not eliminate, the reconciliation gap: an intent paid after expiry still needs operator discretion.
- Registration clickwrap is recorded as `termsAcceptedAt` + `termsVersion` for credential accounts only. A re-acceptance flow for material terms changes is still a follow-up.

## Product gates (deliberate, per spec)
11. **Trading execution.** Jupiter `/order`+`/execute` adapter code exists behind the four governance gates and a kill switch. Quote preview and wallet connection are real. `TRADING_ENABLED=true` is set in the deploy workflow by explicit operator decision (commit `f3cf2d1`), but execution remains blocked until every gate is APPROVED by a platform admin and the kill switch is CLEAR — verify with `GET /api/v1/trading/gates`. The gate-review packages still record the earlier default-deny posture; that divergence is documented in `docs/OPERATIONS_READINESS.md` §7.
12. **Legal review.** Paid research services, issuer services, trading, and geographic availability require professional legal assessment before commercial activation; no compliance claims are made anywhere in the product.
13. **Name/trademark clearance.** "FoundrySignal" is a working name.

## Data scope honesty
14. **Venture registry.** Seeded with public, verifiable portfolio data via `scripts/seed-portfolio.ts`; it grows through real ingestion (URL submission → collectors) or admin entry. No fabricated private companies.
15. **Founder identity.** No identity is auto-linked; attribution confidence is explicit; without founder-provided or corroborating evidence, founder sections remain `UNKNOWN`/`SELF_ASSERTED`.
16. **Website collection.** Many venture sites block server-side fetch (observed 429s); those sources show PROVIDER_BLOCKED.
17. **AI grounding.** The analyst can only cite evidence present in the database; for sparsely ingested ventures most sections will correctly answer "insufficient evidence". This is by design, not a bug.
