# SECURITY_REVIEW — evidence package (machine phase complete)

**Gate state:** NOT_STARTED · **Kill switch:** ENGAGED · **TRADING_ENABLED:** unset
**Machine review completed:** 2026-11-15 · **Human sign-off:** REQUIRED (block below not signed)

## 1. Scope reviewed

- Trading execution path: `/api/v1/trading/*`, `src/lib/domain/trading/gates.ts`, `src/lib/providers/jupiter.ts`
- Billing (new this increment): `/api/v1/billing/{checkout,portal,status,webhook}`, `src/lib/domain/billing/stripe.ts`
- Auth/session/RBAC: `src/lib/auth/*`, tenant guards in service layer
- SSRF guards: `src/lib/providers/framework.ts` (`guardedFetch`), intake normalization
- HTTP contract/security headers: `src/lib/contracts/http.ts`, `next.config.ts`

## 2. Verification evidence (all run 2026-11-15)

| Check | Result |
| --- | --- |
| TypeScript strict (`tsc --noEmit`) | clean |
| Test suite (`bun test`) — authz, domain, evidence engine, SSRF v4+v6 | **54/54 pass** |
| Golden-path smoke (register → venture w/ real website+mint → collectors → research run → watchlist → quote → gates → cross-tenant probe → logout) | **PASS** |
| Dependency audit (`bun audit`) | **0 critical** (was 5) — Next.js 16.4.6 (4 RCE advisories fixed), next-auth 4.24.15, zod 4.6.7, prismjs 1.30.0 via override, unused next-intl removed; 58 remaining findings are dev-toolchain DoS/ReDoS classes or no-fix-yet (lodash via recharts, unreachable `_.template` path) |
| Secret scan (`sk_live/sk_test/ghp_/whsec_/AKIA/xox*/private keys` across src, scripts, tests, docs, .env) | clean — placeholders only |
| Security headers (CSP, nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy, COOP, HSTS prod, `poweredByHeader: false`) | verified via handler wrapper + `next.config.ts` on every route incl. error/passthrough paths |
| Kill-switch drill | execute route returns `403 EXECUTION_GATED` with live block reasons; kill switch ENGAGED default-deny; gate decisions require PLATFORM_ADMIN with mandatory notes; all decisions audited |

## 3. Verified controls (machine-verified in code)

- **Execution gate composition**: all four gates APPROVED **AND** kill switch CLEAR **AND** `TRADING_ENABLED=true` — checked at the top of the execute route **before any provider call**; no bypass path (grep-verified call graph).
- **Default-deny**: kill switch seeds ENGAGED; gate rows seed NOT_STARTED; the idempotent seeder never mutates states.
- **Session-bound execution**: `requireAuth` + per-user intent ownership with uniform NOT_FOUND (no enumeration); intent consumption is now an atomic conditional claim (`updateMany` on `kind=ORDER_INTENT AND status=GATED_EXECUTION_DISABLED`) — concurrent double-submission is structurally impossible; quote expiry enforced before submission.
- **No signing material server-side**: only client-signed transactions reach `/execute`; platform never signs; honest onchain status (CONFIRMED only after RPC confirmation; UNCERTAIN never fabricated).
- **Webhook integrity (billing)**: timing-safe HMAC over the **raw** body; missing signature → 400; bad signature → 403; insert-first idempotency ledger (unique event id) with release-on-transient-failure semantics; workspace/plan binding exclusively from server-set checkout metadata — client input cannot re-target entitlements.
- **Auth**: 256-bit opaque tokens, SHA-256 at rest, HttpOnly+SameSite=Lax+Secure(prod), server-side revocation, per-request membership re-verification, bcrypt cost 10, registration/login throttles, timing-equalized login failures, account deletion revokes all sessions.

## 4. Findings & remediation log (adversarial machine review)

| # | Severity | Finding | Status |
| --- | --- | --- | --- |
| F-1 | HIGH | SSRF: redirects followed without re-validation; weak IPv6 checks | **FIXED** — `guardedFetch` now follows redirects manually with full per-hop re-validation (scheme/blocklist/DNS), expanded IPv6 blocklist (mapped/NAT64/6to4/ULA/link-local/discard), 13 new unit tests |
| F-2 | HIGH | Cross-tenant watchlist-item deletion (IDOR, no tenant check) | **FIXED** — watchlist must belong to caller's workspace; role raised to ANALYST |
| F-3 | MEDIUM | Signed transaction content not decoded/bound to intent (audit integrity; onchain safety intact) | **OPEN** — required post-gate condition: decode tx, verify mints/amount/slippage match intent, and verify signer == `walletAddress` before submission |
| F-4 | MEDIUM | No intent concurrency guard / status check / expiry enforcement | **FIXED** — atomic claim + status + expiry checks |
| F-5 | MEDIUM | Webhook idempotency race; FAILED events permanently skipped | **FIXED** — insert-first claim with P2002 duplicate handling; transient failures release the claim for Stripe retry; permanent failures recorded FAILED + acked |
| F-6 | MEDIUM | Client-controlled Origin drove payment redirect URLs | **FIXED** — `resolveAllowedOrigin` allowlist (SITE_URL + ALLOWED_ORIGINS + deployment origin); non-allowlisted origins rejected |
| F-7 | MEDIUM | Documented Origin/Host verification did not exist | **FIXED** — `verifyMutationOrigin` in the shared handler (Origin-host match + Sec-Fetch-Site cross-site rejection); webhook pass-through preserved |
| F-8 | MEDIUM | Spoofable XFF (without Caddy) + in-memory throttles | **OPEN (documented)** — deploy behind Caddy (repo Caddyfile normalizes XFF) or add TRUSTED_PROXIES config; throttles are single-instance |
| F-9 | MEDIUM | CSP allows inline scripts (`script-src 'unsafe-inline'`) | **OPEN (documented)** — adopt nonce-based CSP; interim mitigations: React auto-escaping, no dangerouslySetInnerHTML on user data |
| F-10 | LOW | Billing actions lacked workspace role gate | **FIXED** — checkout/portal require ADMIN+ |
| F-11 | LOW | No rate limiting on write/quote endpoints | **OPEN (documented)** — add per-session/IP token buckets on writes + quote/intent endpoints before commercial launch |
| F-12 | LOW | Login timing enumeration | **FIXED** — timing-equalized dummy-hash verify |
| F-13 | LOW | Session claims vs code (fixed 7-day expiry, no rotation) | **OPEN (documented)** — roles re-read per request mitigates rotation risk |
| F-14 | LOW | VIEWER can start research runs (cost) / toggle alerts | **OPEN (documented)** — recommend ANALYST gate on research-run start |
| F-15 | LOW | Account deletion without re-auth | **OPEN (documented)** — recommend password re-entry |
| F-16 | INFO | Unauthed health/capabilities disclose posture (no secrets) | Accepted — needed by honest-state UX; review before commercial launch |
| F-17 | INFO | SECURITY_MODEL.md doc/code divergence | **FIXED** — doc updated this increment to match implemented controls |
| F-18 | INFO | `recordAudit` best-effort (DB failures logged, not raised) | **OPEN (documented)** — gate decisions/execution audit rows should be transactional |
| F-19 | INFO | Jupiter `/order` (createSwapOrder) implemented but unexercised | **OPEN** — must be live-verified during the gate drill before enabling execution |

## 5. Residual risks accepted by machine phase (human reviewer must re-assess)

1. DNS rebinding race window in guardedFetch (validation vs connection resolve) — recommend connect-by-IP pinning or egress proxy.
2. Dev-toolchain advisory surface (eslint/prisma CLI chains) — build-time only.
3. lodash advisory via recharts (no fixed version; `_.template` unreachable in our usage).
4. In-memory throttles + best-effort audit persistence (single-instance assumptions).

## 6. HUMAN SIGN-OFF (required before gate approval — do not self-sign)

```
Reviewer name:      ______________________
Role/title:         ______________________
Review date:        ______________________
Decision:           APPROVED / REJECTED / CHANGES REQUIRED
Conditions:         ______________________
Notes:              ______________________
Signature/ref:      ______________________
```

Record the decision via `PATCH /api/v1/admin/trading-gates` (audited) only after signing.
