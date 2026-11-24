# FoundrySignal — Security Model

Status verified against code 2026-11-15 (increment 3 adversarial review —
findings/remediations in `docs/gate-reviews/SECURITY_REVIEW.md`; open items are
stated here as such rather than implied away).

## Authentication & sessions
- Passwords: bcrypt (cost 10) via `bcryptjs`; policy: minimum 10 chars.
- Sessions: 256-bit random token; only the SHA-256 hash stored; HttpOnly, SameSite=Lax, Secure (in production); fixed 7-day expiry; server-side revocation on every request (deleted-user check). Known gap (open): no sliding expiry and no rotation on privilege change — mitigated by roles being re-read from the database on every request.
- Login throttling per email+IP with bounded counters; generic error messages; **timing-equalized verification** (unknown emails run the same bcrypt cost against a throwaway hash) so latency does not enumerate accounts. Registration throttled per IP (10/hour). Throttles are in-process (single-instance assumption).
- Account deletion workflow: soft delete + session revocation; personal data retention documented. Open recommendation: password re-entry for deletion.

## Two-factor authentication (TOTP, added 2026-11-20)
- Opt-in per account under Settings → Security. Enrollment requires re-entering the current password so a stolen session cannot enroll an attacker-controlled factor.
- Secret: 20 random bytes base32; stored only as AES-256-GCM ciphertext with a fresh 12-byte IV and 16-byte auth tag, with the user id as AAD (a row transplanted to another user cannot be decrypted). Key from `MFA_ENCRYPTION_KEY` (64-hex raw key or SHA-256-derived passphrase). No secret, ciphertext or recovery hash is returned by the status endpoint.
- Verification: RFC 6238 (HMAC-SHA1, 6 digits, 30 s) with ±1 step skew. The matched time-step counter is the replay guard and advances only in the same conditional write that proves the code was unused. Codes are compared with `timingSafeEqual`.
- Login step-up: a correct password issues a single-use, 5-minute challenge but **no session**. The challenge is consumed before factor verification; a wrong code fails closed. MFA users cannot reach authenticated routes with a password alone.
- Recovery: 10 single-use codes stored as SHA-256 hashes, consumed with a conditional atomic write; regenerating invalidates all previous codes. Plaintext is shown exactly once.
- Denial of service: per-purpose attempt counters (5 attempts / 15 min) plus the DB-backed API write limiter. Attempt state is in-process; the cross-process limiter is the second layer.
- Fail-closed configuration: without `MFA_ENCRYPTION_KEY`, enrollment is unavailable and an enrolled account cannot verify (no bypass). Password reset, disable and account deletion clear outstanding challenges.
- Audit events: `MFA_ENROLL_START`, `MFA_ENROLL_CONFIRM`, `AUTH_MFA_CHALLENGE`, `AUTH_MFA_VERIFY`, `MFA_RECOVERY_REGENERATE`, `MFA_DISABLE`.

## OAuth sign-in (added 2026-11-20)
- Authorization-code + PKCE S256 for GitHub and Google. `state` is 256-bit random, persisted only as SHA-256, single-use, 10-minute expiry; the PKCE verifier is server-side only and never appears in a URL or readable cookie.
- `redirect_uri` is constructed solely from `NEXT_PUBLIC_SITE_URL` — a request-supplied redirect is never accepted. Callback errors return a generic redirect with no provider detail or token in the URL.
- Provider tokens are used for one userinfo request in memory and never persisted. Login requires a **provider-asserted verified email**; unverified addresses are rejected and no account is created. Linking is by email hash only — never by name, avatar or provider user id.
- An existing account with TOTP MFA receives a single-use step-up challenge via an HttpOnly cookie and no session; the cookie is consumed by `/api/v1/auth/mfa-challenge` and deleted.
- New OAuth accounts get an unguessable random password hash (no password sign-in), an email-verified timestamp and a personal workspace. Provider client secrets are read from the server environment only.
- Callback URLs must be registered with GitHub/Google by the operator; the capability registry reports which providers are configured.

## Authorization
- Two axes: platform role (`USER`, `MODERATOR`, `PLATFORM_ADMIN`) and workspace role (`OWNER`, `ADMIN`, `ANALYST`, `VIEWER`) with rank-based enforcement (`requireWorkspaceRole`).
- All service-layer functions receive an `AuthContext` and enforce visibility; tenant ownership is asserted with `assertTenant` on workspace-scoped resources (cross-tenant watchlist deletion found and fixed in the increment-3 review; billing checkout/portal require workspace ADMIN+).
- Every protected endpoint is tested for unauthenticated and cross-tenant access (see tests/authorization.test.ts) — with the caveat that such tests cannot cover *unlisted* routes; the adversarial review greps for missing guards and any new route must add one.

## Input handling
- Zod validation at every API boundary.
- URL validation + **SSRF guard**: http/https only (per hop); metadata hostnames blocklisted; resolved IPs checked against private/link-local/loopback ranges for IPv4 **and IPv6** (loopback, ULA, link-local, IPv4-mapped, NAT64, 6to4, discard-only); **redirects are followed manually and every hop is fully re-validated and re-pinned** (scheme, host blocklist, fresh DNS check), max 3 hops. **Connect-by-IP pinning closed the DNS-rebinding race**: the transport that performs the connection uses a custom `lookup` that returns only the address validated for that hop — DNS is never consulted again at connect time (see `docs/SSRF_FIX_REPORT.md`).
- Output encoding: React default escaping; no `dangerouslySetInnerHTML` for external content; the only inline HTML is server-owned JSON-LD with `<` escaped.
- Webhook signature verification for billing webhooks (Stripe SDK HMAC, timing-safe, over the raw body); insert-first idempotency ledger with release-on-transient-failure semantics.

## CSRF & headers
- Mutations require SameSite=Lax cookie **plus Origin/Host match verification** (`verifyMutationOrigin` in the shared handler: Origin host must equal request host; `Sec-Fetch-Site: cross-site` rejected; server-to-server callers without Origin pass through).
- CSP: `default-src 'self'`; script/style restrictions; `frame-ancestors 'none'`; `X-Content-Type-Options: nosniff`; `Referrer-Policy: strict-origin-when-cross-origin`; COOP; HSTS in production; `poweredByHeader: false`. Known gap (open): production `script-src` still allows `'unsafe-inline'` (Next.js nonce-based CSP is the follow-up).
- API rate limiting per session/IP: implemented for auth endpoints; **write/quote endpoints are not yet rate-limited** (open item F-11; required before commercial launch).
- Billing payment redirect URLs are built only from an origin allowlist (NEXT_PUBLIC_SITE_URL / ALLOWED_ORIGINS / deployment origin) — client-supplied origins that are not allowlisted are rejected.

## Secrets
- Secrets only in environment (.env in sandbox; managed secrets in production). Signing material never present in browser or server env for the trading layer (users sign with their own wallets).
- No tokens, keys, or wallet secrets logged. Structured logs redact `authorization`, `cookie`, `token` fields.
- Client IP derivation: taken from the reverse proxy layer — the repo Caddyfile replaces `X-Forwarded-For` with the remote host. When the API is exposed without the proxy, XFF is client-controllable (open item F-8: TRUSTED_PROXIES config).

## AI pipeline hardening
- External content (website text, README, repository files) is treated as untrusted data. Retrieved passages are wrapped in explicit delimiters with an instruction to treat content as data only; obvious injection markers are stripped before assembly.
- Citations validated server-side against retrieved evidence; tenant-aware retrieval prevents cross-workspace leakage.

## Audit & operations
- AuditEvent append-only log for: auth events, role changes, admin actions, evidence corrections, billing changes (checkout created, subscription synced, webhook processed), deletion requests. Admin corrections never mutate original observations. Known gap (open): audit writes are best-effort (DB failures logged, not raised) — make gate/execution audit writes transactional.
- Dependency scanning: `bun audit` run every increment (0 critical as of 2026-11-15; remaining findings are dev-toolchain DoS classes or no-fix-yet with unreachable paths); automated scanning configured in CI (production).
- Incident runbook placeholders in docs/runbooks (auth compromise, provider outage, data corruption, AI failure).


## Trading execution governance (added increment 2, hardened increment 3)

Swap execution is protected by three independent, stacked conditions — every one must pass:

1. **Human review gates** (`TradingReleaseGate`): PRODUCT_REVIEW, LEGAL_JURISDICTION_REVIEW, PROVIDER_INTEGRATION_REVIEW, SECURITY_REVIEW must each be APPROVED by a PLATFORM_ADMIN through `PATCH /api/v1/admin/trading-gates`. Evidence packages live in `docs/gate-reviews/` (machine phase complete; human signatures pending). Decisions require non-trivial notes, validated state transitions, and are written to the append-only audit log with actor + timestamp.
2. **Kill switch**: seeds ENGAGED (default-deny). Engaging blocks every execution attempt platform-wide regardless of gate states; only a platform admin may re-CLEAR (audited).
3. **Operator env flag**: `TRADING_ENABLED=true` must exist in the process environment.

While gated: `POST /api/v1/trading/execute` is a hard no-op returning 403 `EXECUTION_GATED` with the full readiness payload; order *intents* (real Jupiter quotes persisted as records) are allowed and never sent to any execution provider.

Execution-path integrity (increment 3): intents are consumable only once via an atomic conditional claim (`ORDER_INTENT`+`GATED_EXECUTION_DISABLED` → `SWAP`+`SUBMITTED`); consumed/failed intents and expired quotes are rejected before any provider call. Open pre-enablement conditions (security review F-3/F-19): signed-transaction content binding (decode + verify mints/amount/slippage/signer against the intent) and a live `/order` drill.

Platform admin is grantable only via `ADMIN_BOOTSTRAP_EMAIL` at server boot (audited) — there is no self-service escalation.
