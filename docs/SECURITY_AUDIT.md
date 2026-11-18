# FoundrySignal — Security & Hardening Audit

Audit date: 2026-11-17
Scope: `src/` (169 files), `src/app/api/**/route.ts` (30 route modules), `src/lib/**`, `prisma/schema.prisma`, `next.config.ts`, `Caddyfile`, `.env`, `docs/SECURITY_MODEL.md`, `docs/KNOWN_LIMITATIONS.md`, tracked artifacts (`db/custom.db`, `upload/`, `tool-results/`, `.next/standalone/.env`).
Method: full read of every API route module, every file under `src/lib/auth`, `src/lib/contracts`, `src/lib/providers`, `src/lib/domain/billing`, plus targeted reads of the collectors, research engine, queue, and the client components that render URLs and gate admin UI. No code was modified.

Conventions: **CONFIRMED** = read the code with the cited line. **UNVERIFIED** = could not confirm from this checkout; the exact command to settle it is given.

---

## 1. Executive Summary

The application is architecturally stronger than typical for its stage: there is a real server-side session system (256-bit opaque token, SHA-256 at rest, HttpOnly/SameSite/Secure cookie), a single `handler()` wrapper that enforces an Origin/Host check on every mutating request, two-axis authorization (platform role + rank-based workspace role) with an explicit tenant guard, zod validation at every API boundary, and no raw SQL anywhere (`$queryRaw`/`$executeRaw`/`rawUnsafe` do not appear in `src/`, `prisma/`, or `scripts/` — verified by repo-wide grep). The two hardest external-input problems are handled deliberately rather than aspirationally: the SSRF guard re-validates scheme/host/DNS on every manual redirect hop (`src/lib/providers/framework.ts:299-345`), and the Stripe webhook verifies an HMAC over the raw body before touching state (`src/app/api/v1/billing/webhook/route.ts:9-19`). **However, the single most severe finding is not in application logic: `.env` is a git-tracked file (`.gitignore:34` is inert because the file is already in the index, `git ls-files -s .env` → mode `100755`) and it contains live, non-placeholder credentials for Resend, a GitHub PAT, Google OAuth client secret, and a Helius key.** Those four credentials must be treated as compromised and rotated; no application fix substitutes for that.

Beyond the secret exposure, the audit found 4 Critical, 9 High, 13 Medium, and 11 Low/Informational items. The Critical cluster is: (1) tracked `.env` with live secrets plus a copied `.env` inside the deployable `.next/standalone/`; (2) spoofable `X-Forwarded-For` used directly as the identity for both rate-limit counters and the audit trail; (3) a CSP that allows `'unsafe-inline' 'unsafe-eval'` in *every* response including production API responses, plus a second, conflicting CSP definition; (4) a broken-build defect in the payment path (`crypto.randomUUID()` with no `crypto` import) that would 500 every USDC checkout once `PAYOUT_WALLET` is set. High findings concentrate in authorization asymmetry (alert/saved-search PATCH/DELETE missing the role gate their sibling POST enforces; `POST /api/v1/ventures` requires only `requireAuth` while its sibling sub-routes require ANALYST+), resource-exhaustion endpoints with no rate limit, the documented-but-unfixed DNS-rebinding race in the SSRF guard, and a `console.error` sink that stringifies raw errors with no redaction despite `docs/SECURITY_MODEL.md:32` claiming the opposite.

Three items the assignment listed as suspected are **NOT** findings, and are recorded as verified-clean to prevent wasted effort: there are no API keys in the client bundle (no `process.env` reference inside any `"use client"` module; `NEXT_PUBLIC_SITE_URL` is the only `NEXT_PUBLIC_*` read in `src/`), there is no stack-trace leak to clients (both error boundaries render a digest only; the API handler returns a generic `INTERNAL` message), and there is no SQL injection surface (Prisma, no raw APIs). One documented control does not exist at all: `docs/SECURITY_MODEL.md:42` cites "Incident runbook placeholders in docs/runbooks" — there is no `docs/runbooks` directory.

Severity counts: **Critical 4 · High 9 · Medium 13 · Low/Info 11.**

---

## 2. Critical Findings

### C-1 — `.env` is git-tracked and contains live production credentials

**Evidence (repo state, CONFIRMED):**

```
$ git ls-files -s .env
100755 769ebf2805af57a8e66acf4a1d25a4e2a6be556d 0	.env
```
```
$ git check-ignore -v .env
(no output — NOT ignored)
```

`.gitignore:34` reads `.env*`, but the file was committed before that rule existed, so the rule is inert; ignoring does not untrack. `git log --all --oneline -- .env` returns 14 commits, so the exposure is historical and not removable by a single commit. `git show HEAD:.env` contains only `DATABASE_URL=file:/home/z/my-project/db/custom.db`, but the **working tree** (which is what a `git add -A` will publish, and what `git status` already reports as ` M .env`) contains:

```
5:RESEND_API_KEY=[REDACTED]
9:GITHUB_OAUTH_CLIENT_ID=[REDACTED]
10:GITHUB_OAUTH_CLIENT_SECRET=[REDACTED]
11:GOOGLE_OAUTH_CLIENT_ID=[REDACTED]
12:GOOGLE_OAUTH_CLIENT_SECRET=[REDACTED]
15:MFA_ENCRYPTION_KEY=[REDACTED]
16:GITHUB_TOKEN=[REDACTED]
17:HELIUS_API_KEY=[REDACTED]
```

Assessment of each value: **real, live-format credentials** — the Resend key (`re_` + 32 chars), the GitHub PAT (`ghp_` + 36 chars), the Google client secret (`GOCSPX-` + 28 chars) and the Helius UUID are all structurally valid and are consumed by live code paths (`src/lib/domain/email/service.ts:16` gates on `RESEND_API_KEY`; `src/lib/providers/github.ts:37` reads `GITHUB_TOKEN`; `src/lib/providers/solana.ts:47` reads `HELIUS_API_KEY`). **Placeholder-by-intent** — `MFA_ENCRYPTION_KEY=fs-mfa-configured-v1-change-in-production-kms` self-describes as a change-in-production value, and `DATABASE_URL` embeds `fs_local_2026`, a local-only password. Both are still unacceptable in a tracked file, but they are not evidence of a production compromise.

**Second exposure of the same material (CONFIRMED):** the standalone build copied the live file into the deployable artifact:

```
$ ls -la .next/standalone/.env
-rwxrwxr-x 1 somebody somegroup 864 Nov 16 21:54 .next/standalone/.env
```

`.next/` is gitignored (`.gitignore:17`), so this is not a git leak, but it means anything that ships the standalone directory — an image layer, a tarball, an object-store sync — ships the Resend key, the GitHub PAT and the Google secret. `package.json:8` (`"start": "NODE_ENV=production bun .next/standalone/server.js"`) is precisely that deployment shape.

**Exploit scenario.** Anyone with read access to the repository, a clone on a laptop, a CI log that echoes the diff, or a backup of the standalone directory can: send mail as `FoundrySignal <noreply@aiazimara.com>` via Resend (phishing from a domain the product's own users trust, and burning the sending reputation); read every private repository the GitHub PAT can see (`repo` scope PATs are not limited to public metadata, and the collector uses it as a Bearer token at `src/lib/providers/github.ts:62`); and consume the paid Helius quota. None of these require touching the application. The Google OAuth secret is currently inert only because no callback route exists — the moment OAuth is enabled, it becomes an account-linking attack surface.

**Fix (in this order, same day):**
1. Rotate now, before any code change: Resend key, GitHub PAT, `GOOGLE_OAUTH_CLIENT_SECRET`, `HELIUS_API_KEY`. Assume read access by anyone who has ever had the repo.
2. `git rm --cached .env` and add `!.env.example`; commit `.env.example` with key names only.
3. Rewrite history or, if the remote is shared, treat the exposure as permanent and rely on rotation. `git log --all --oneline -- .env` shows 14 commits touching the file, so a `--filter-repo` rewrite is required to purge it — and must be coordinated with every clone.
4. Exclude the env file from the build artifact (Next copies `.env` into `standalone/` by design); inject secrets at runtime and set `outputFileTracingExcludes`, or ship only the server bundle without `.env`.
5. Set `MFA_ENCRYPTION_KEY` from a KMS/secret manager, never from a file that can be committed.

---

### C-2 — `X-Forwarded-For` is trusted verbatim for rate-limit identity and audit records

**Evidence (CONFIRMED):**

`src/app/api/v1/auth/[action]/route.ts:6-8`
```ts
function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}
```

That value is the *only* identity used by both throttles and both audit records:

`src/lib/auth/service.ts:38-40`
```ts
function throttleKey(email: string, ip: string): string {
  return `${email.toLowerCase()}|${ip}`;
}
```
`src/lib/auth/service.ts:68-80` (registration throttle keyed on the same `ip`)
`src/lib/auth/service.ts:106` — `metadata: { ip, userType }`
`src/lib/auth/service.ts:133` — `metadata: { ip }`

**Why it is exploitable here.** `src/app/api/v1/auth/[action]/route.ts` takes the *first* comma-separated element of the header. The deployment's own reverse proxy overwrites the header (`Caddyfile:9`, `header_up X-Forwarded-For {remote_host}`), which is correct — but that only protects traffic that actually traverses Caddy. The Next server binds `:3000` directly (`server.log`: `Network: http://0.0.0.0:3000`), and there is no `middleware.ts` in `src/` and no `TRUSTED_PROXIES` check anywhere in `src/` (grep for `TRUSTED_PROXIES` returns nothing; `docs/SECURITY_MODEL.md:33` lists this as open item F-8). Any request that reaches port 3000 without passing Caddy controls the header completely.

**Exploit scenario.** Rotating `X-Forwarded-For: <random>` per request makes `throttleKey` unique every time, so `checkLoginThrottle` (`src/lib/auth/service.ts:42-47`) never trips: unbounded credential stuffing against any account, including the `ADMIN_BOOTSTRAP_EMAIL` account, at full bcrypt cost per attempt. The same rotation makes `checkRegisterThrottle` (`src/lib/auth/service.ts:68-80`) a no-op, allowing unlimited account creation (each of which creates a Workspace and a Membership row — `src/lib/auth/service.ts:101-104`). And because the audit log records attacker-chosen strings as `metadata.ip`, the append-only audit trail is poisoned: every `AUTH_LOGIN` / `AUTH_REGISTER` / `CHECKOUT_INTENT_CREATED` record can be attributed to an arbitrary address.

**Fix.** Parse the rightmost untrusted hop, not the leftmost: take `X-Forwarded-For`, walk from the right, skip addresses in a configured trusted set, and use the first non-trusted address. Gate on a `TRUSTED_PROXIES` CIDR list; if the immediate peer is not in it, ignore `X-Forwarded-For` entirely and use the socket address. Bind the app to `127.0.0.1:3000` and require Caddy as the only ingress. Independently, make the throttles not solely IP-keyed (see H-5).

---

### C-3 — CSP allows `'unsafe-inline' 'unsafe-eval'` on every response, and two conflicting CSPs are defined

**Evidence (CONFIRMED).** There are two independent CSP definitions, and the one applied to *every API response* is the weaker one.

`src/lib/contracts/http.ts:10-11`
```ts
const CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none'; object-src 'none'";
```
Applied unconditionally at `src/lib/contracts/http.ts:17` (`res.headers.set("Content-Security-Policy", CSP)`) for every route that goes through `handler()`, with no `isProd` branch and no nonce.

`next.config.ts:8-19` defines a second, production-aware policy:
```ts
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  ...
```
applied to `source: "/:path*"` at `next.config.ts:33-35`.

**Exploit scenario.** For API responses, the `next.config.ts` policy and the `http.ts` policy are both emitted, and the browser applies the intersection — but the strictest *document* policy is irrelevant to any JSON response consumed by `fetch`, while `'unsafe-eval'` in the API policy is a live weakening for any HTML the origin ever serves from a path that also passes through `handler()`. The concrete risk is not the JSON itself but the drift: a future change that returns HTML from a `handler()` route, or a proxy that forwards the API CSP to a document, inherits `'unsafe-eval'` in production. Even in the document policy, `script-src 'self' 'unsafe-inline'` (`next.config.ts:10`) means any HTML-injection primitive — and there are three `dangerouslySetInnerHTML` sinks in the app — becomes script execution with no nonce to fall back on. `docs/SECURITY_MODEL.md:26` acknowledges this as a known gap; it is nonetheless a production hardening blocker, and the *duplicate* definition is a maintenance hazard: a reviewer who fixes `next.config.ts` and not `http.ts` will believe the hole is closed.

**Fix.** Delete the `CSP` constant in `src/lib/contracts/http.ts:10-11` and the `res.headers.set("Content-Security-Policy", …)` at line 17; let `next.config.ts` own the single policy. Then implement nonce-based `script-src` (propagate a per-request nonce through `middleware.ts` to both the document and the bootstrap `<script>` at `src/app/layout.tsx:91`) and drop `'unsafe-inline'` from `script-src`. Until nonces land, at minimum gate the `http.ts` policy behind `isProd`-awareness so `'unsafe-eval'` cannot appear in production responses.

---

### C-4 — The USDC checkout path throws on every call: `crypto.randomUUID()` with no `crypto` binding

**Evidence (CONFIRMED).** `src/lib/domain/billing/crypto.ts:135`:
```ts
      memo: buildMemo(crypto.randomUUID()),
```
The module's imports (`src/lib/domain/billing/crypto.ts:14-18`) are:
```ts
import { createSolanaRpc, address } from "@solana/kit";
import { db } from "@/lib/db";
import { ApiHttpError } from "@/lib/contracts/http";
import { recordAudit } from "@/lib/domain/shared/audit";
import { ensurePlans } from "./plans";
```
There is no `import { randomUUID } from "crypto"` and no `import { webcrypto } from "node:crypto"`. Every other module in the codebase that needs a UUID imports it explicitly — `src/lib/contracts/http.ts:3` (`import { randomUUID } from "crypto"`), `src/lib/jobs/queue.ts:5`, `src/lib/auth/session.ts:2` — which makes this a straightforward omission rather than an intentional global. Grepping the whole of `src/` for a bare `crypto.` reference returns exactly this one line.

**Exploit scenario / impact.** Not an attacker primitive — a denial of the revenue path. Once `PAYOUT_WALLET` is set (`src/lib/domain/billing/crypto.ts:38-40`, `:116-122` is the only gate), `createCheckoutIntent` reaches line 135 and raises `ReferenceError: crypto is not defined` (or, on runtimes that expose the WebCrypto global, `crypto.randomUUID` exists only in secure contexts — so this is environment-dependent and untestable in the current tests). The route at `src/app/api/v1/billing/checkout/route.ts:20` does not catch it; the `handler()` wrapper converts it to a generic `500 INTERNAL` (`src/lib/contracts/http.ts:78`). Every paying-customer checkout fails, and the failure is indistinguishable from a transient server error, so it will be retried indefinitely. `tests/crypto-checkout.test.ts:56` calls `createCheckoutIntent` directly and would catch this — **UNVERIFIED whether the suite is currently green**; `bun test tests/crypto-checkout.test.ts` settles it. The test file also sets `PAYOUT_WALLET` at line 55, so a failure there is the signal.

**Fix.** Add `import { randomUUID } from "crypto";` and use `randomUUID()`, matching the other four call sites. This is a one-line change but it sits in the payment path, so verify with the existing test plus a manual checkout against a funded devnet/mainnet intent before enabling `PAYOUT_WALLET`.

---

## 3. High Findings

### H-1 — Authorization asymmetry: alert and saved-search mutation routes omit the role gate their POST enforces

**Evidence (CONFIRMED).** `src/app/api/v1/alerts/route.ts` — POST enforces ANALYST+ at line 36; PATCH enforces nothing:
```ts
54:export const PATCH = handler(async ({ req, requestId }) => {
55:  const ctx = await requireAuth();
56:  const body = await req.json().catch(() => ({}));        // ← no requireWorkspaceRole
...
61:  await db.alert.update({ where: { id: parsed.id }, data: { active: parsed.active } });
```
`DELETE` at lines 65-73 likewise calls only `requireAuth()` (line 66) with no role check. `src/app/api/v1/saved-searches/route.ts` POST enforces `VIEWER` at line 22; its `DELETE` at lines 33-40 calls only `requireAuth()` (line 34).

**Exploit scenario.** A workspace VIEWER — the lowest rank (`src/lib/auth/context.ts:8`, `ROLE_RANK = { VIEWER: 0, ... }`) — cannot create an alert, but can toggle any alert in its own workspace on or off, and can delete any saved search in its workspace. Both are integrity violations of a control the product explicitly models as role-gated; both pass the tenant check (lines 60 and 39) so this is purely a missing rank check, not a cross-tenant hole. The same shape applies to `POST /api/v1/alerts` requiring ANALYST while `PATCH` requires nothing — a reviewer reading only the POST handler would reasonably conclude the resource is ANALYST-governed.

**Fix.** Add `requireWorkspaceRole(ctx, "ANALYST")` to `PATCH`/`DELETE` in `src/app/api/v1/alerts/route.ts` (after line 55 and 66) and to `DELETE` in `src/app/api/v1/saved-searches/route.ts` (after line 34). Better: assert the role from the same helper used by POST, and add a route-level table test that enumerates `{method, minRole}` so the asymmetry cannot recur.

---

### H-2 — `POST /api/v1/ventures` requires only authentication while every sibling write requires ANALYST+

**Evidence (CONFIRMED).** `src/app/api/v1/ventures/route.ts:24-26`:
```ts
export const POST = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();
  const body = await req.json().catch(() => ({}));
```
No `requireWorkspaceRole`. Compare `src/app/api/v1/ventures/[slug]/[sub]/route.ts:76-77`, which does gate:
```ts
  const ctx = await requireAuth();
  requireWorkspaceRole(ctx, "ANALYST"); // write actions need ANALYST+
```
and `src/app/api/v1/watchlists/route.ts:27-28`, `src/app/api/v1/alerts/route.ts:35-36`, `src/app/api/v1/watchlists/[id]/items/route.ts:18-19`.

**Exploit scenario.** Any authenticated VIEWER can create ventures. `createVenture` (`src/lib/domain/ventures/service.ts:83-304`) writes a `Venture` row, up to three `VentureIdentity` rows, a `Claim`, an `EvidenceSource`, a `VentureHistoryEvent`, and enqueues up to three collector jobs (lines 234-283) — each of which performs outbound network I/O (GitHub API, website fetch, Solana RPC). A VIEWER can therefore drive unbounded server-side egress and DB growth, and can inject attacker-controlled identity data into the shared registry. Because the venture is created with `visibility` defaulting to `"PUBLIC"` (`prisma/schema.prisma:115`) and `listVentures` filters on `visibility: "PUBLIC"` (`src/lib/domain/ventures/service.ts:322`), the injected content is immediately visible to every other tenant's discovery view. This is a stored-content injection into a multi-tenant surface, gated only by "has an account".

**Fix.** Add `requireWorkspaceRole(ctx, "ANALYST")` immediately after line 25, matching the sibling route. Consider also requiring ANALYST+ for `POST /api/v1/ventures/[slug]/[sub]` `token` and `refresh` (currently gated at line 77, so covered) and confirm no other write path is `requireAuth`-only — a grep for `requireAuth` followed within three lines by `db.*create|update|delete|upsert` is the sweep that closes this class.

---

### H-3 — Write and quote endpoints have no rate limiting; three of them are unbounded resource amplifiers

**Evidence (CONFIRMED).** `docs/SECURITY_MODEL.md:27` already admits this ("write/quote endpoints are not yet rate-limited (open item F-11)"). Verified in code: the only throttles in the codebase are `checkLoginThrottle` and `checkRegisterThrottle` (`src/lib/auth/service.ts:42`, `:68`). Grepping every route module for a throttle call returns none outside the auth handler. There is no `middleware.ts` and no edge/proxy rate limit in `Caddyfile` (no `rate_limit` directive; the file contains only two `reverse_proxy` blocks).

The three amplifiers, in descending severity:

1. **`GET /api/v1/health`** — `src/app/api/v1/health/route.ts:6-15` is unauthenticated (one of four public routes) and performs **five** operations per request: two provider health probes, one RPC `getSlot()`, plus two full-table `count()`s:
```ts
14:  const ventureCount = await db.venture.count();
15:  const evidenceCount = await db.evidenceSource.count();
```
plus an outbound Solana RPC round trip (line 11) with no breaker in front of it (`SolanaAdapter.getSlot()` at `src/lib/providers/solana.ts:72-75` does not consult `breakerAllows`, unlike `createBaseProvider.fetch` at `framework.ts:124`). Each anonymous request therefore costs one external RPC call and two sequential scans. Cheap to flood, no cache header, no auth.

2. **`POST /api/v1/markets`** — `src/app/api/v1/markets/route.ts:37-72` calls `jup.getQuote(...)` (line 50) and then **unconditionally inserts a `TransactionRecord` row** (line 58) for an authenticated user, with no per-user quota. `src/app/api/v1/trading/order-intents/route.ts:69-120` does the same (line 103). The Jup adapter has a circuit breaker (`framework.ts:124`) but no per-caller budget; the DB insert has no cap. A single account can write unbounded rows and drive unbounded third-party quota consumption.

3. **`POST /api/v1/research/runs`** — `src/app/api/v1/research/runs/route.ts:34-47`. There is a *partial* guard (lines 42-45: at most 2 concurrent runs per workspace per venture), but it is per-venture, so one workspace can run 2 concurrent LLM jobs × every venture in the registry simultaneously. Each run costs a full LLM completion (`src/lib/domain/research/engine.ts:221-227`) with a 180 s timeout (line 326) and up to 24 evidence excerpts in the prompt (line 61). No monthly/quota enforcement exists: `grep` for `researchRunsPerMonth|entitlementsJson|reportExport` outside `plans.ts` and marketing returns nothing — the plan entitlements in `src/lib/domain/billing/plans.ts:29-37` (`researchRunsPerMonth`, `watchlists`, `reportExport`, `apiMonthlyCalls`) are **data only, never enforced anywhere**.

**Exploit scenario.** An attacker with one free account (registration is open, throttled at 10/hour per IP — itself spoofable per C-2) exhausts the platform's Jupiter/LLM/RPC quota and fills the `TransactionRecord` table, degrading service for all tenants and running up the operator's provider bill. The health endpoint achieves partial degradation with no account at all.

**Fix.** (a) Add a shared limiter in `handler()` keyed on `session.userId ?? clientIp`, applied to every method except GET-by-id reads; store counters in Postgres (the Redis/BullMQ swap is not done — `docs/KNOWN_LIMITATIONS.md:11`) so it survives restarts and works across processes. (b) Cache `/api/v1/health` for 15-30 s and drop the two `count()`s from the hot path or move them behind auth. (c) Enforce the plan entitlements that already exist as data — starting with `researchRunsPerMonth` and a `TransactionRecord` write quota. (d) Put a `rate_limit` block in `Caddyfile` as a coarse backstop.

---

### H-4 — SSRF guard has an unresolved DNS-rebinding race (documented, still open)

**Evidence (CONFIRMED).** The guard is genuinely well built for its class: scheme allowlist, hostname blocklist, IPv4+IPv6 private-range checks, manual redirect following with per-hop revalidation (`src/lib/providers/framework.ts:299-345`, `MAX_REDIRECTS = 3` at line 265). The residual flaw is the classic validate-then-connect split:

```ts
252:    const records = await dns.lookup(hostname, { all: true, verbatim: true });
...
306:      res = await fetch(current.toString(), {
```
The hostname is resolved at line 252 to prove it is public, then `fetch` at line 306 resolves it **again** at connect time. Between the two lookups a hostile authoritative DNS server can return a public address first and `127.0.0.1` / `169.254.169.254` second. The code documents this at `framework.ts:276-280` ("Full mitigation requires connect-by-IP pinning or an egress proxy — tracked as a known limitation") and `docs/KNOWN_LIMITATIONS.md` records it as open. Reachability is confirmed: `POST /api/v1/ventures` with `websiteUrl` → `enqueue({kind: "collect_website"})` (`service.ts:236-244`) → `collectWebsite(url)` (`src/lib/jobs/collectors.ts:25`) → `guardedFetch(url, …)` (`src/lib/providers/website.ts:37`). Additionally, `validateHop` returns early for IP literals (`framework.ts:245-250`) without any allowlist, so a raw public IP is always fetchable — intended, but it means the *only* barrier for internal targets is the DNS check.

**Exploit scenario.** A venture submission pointing at an attacker-controlled domain whose authoritative server round-robins `1.2.3.4` (public, passes line 252) and `169.254.169.254` (link-local, the cloud metadata endpoint) causes the line-306 connection to land on the metadata service. The response body is capped at 512 KB (`website.ts:37`) and only `text/*` is accepted (`framework.ts:348`), and the output is hashed and stored as evidence rather than returned verbatim — so this is a blind/limited SSRF, not a full read primitive. It is still a real path to internal service interaction and to `169.254.169.254` metadata theft on any cloud that exposes credentials there.

**Fix.** Pin the connection: resolve once, then connect to that IP with `Host`/SNI preserved (Node: `http.request` with a custom `lookup` returning the validated address, or `undici` `Agent` with a `connect.lookup` override). If pinning is impractical, route collector egress through a proxy that only permits public destinations and document that as the enforcement point. Add a regression test that serves a rebinding DNS name and asserts the guard blocks hop 2.

---

### H-5 — Login lockout is trivially bypassable and has unbounded memory growth

**Evidence (CONFIRMED).** `src/lib/auth/service.ts:33-58`:
```ts
34:const loginAttempts = new Map<string, { count: number; until: number }>();
35:const MAX_ATTEMPTS = 8;
36:const LOCKOUT_MS = 15 * 60 * 1000;
38:function throttleKey(email: string, ip: string): string {
39:  return `${email.toLowerCase()}|${ip}`;
40:}
```
Two defects. (a) The key is `email|ip`, and `ip` is attacker-controlled per C-2 — so rotating the header yields a fresh bucket per request and `checkLoginThrottle` (line 42) never blocks. (b) Even with a trustworthy IP, `loginAttempts` is never swept: `clearLoginThrottle` (line 60) only deletes on *success*, and there is no size cap or TTL expiry pass — the registration map has one (`service.ts:72`, `if (registerByIp.size > 10_000) registerByIp.clear()`) but the login map does not. An attacker who sends `MAX_ATTEMPTS` failures against many distinct email addresses grows the map without bound until OOM. It is also per-process, so the moment a second instance exists the effective limit halves — `docs/KNOWN_LIMITATIONS.md:14` concedes "One process runs API + worker loop".

**Exploit scenario.** Unbounded online password guessing against any known address (the bootstrap admin address is in `docs`/env, and `ADMIN_BOOTSTRAP_EMAIL` is documented at `docs/SECURITY_MODEL.md:57`), plus a slow memory-exhaustion vector. Note the *positive* control that does work: unknown-email timing is equalized with a real bcrypt compare against a throwaway hash (`service.ts:117-125`), so account enumeration via latency is closed.

**Fix.** Key the throttle on a trusted client IP (C-2) plus a *global per-email* counter so rotation cannot reset it; bound the map with a sweep on every insert (drop entries whose `until < now`, then cap at N with oldest-first eviction); move counters to Postgres or Redis so they are shared across instances.

---

### H-6 — `console.error` logs raw error strings with no redaction, contradicting the documented control

**Evidence (CONFIRMED).** `src/lib/contracts/http.ts:75-77`:
```ts
      console.error(
        JSON.stringify({ level: "error", requestId, path: req.nextUrl.pathname, message: String(err) })
      );
```
The same pattern appears at `src/lib/jobs/queue.ts:167`, `src/lib/domain/research/engine.ts:312`, `src/lib/domain/shared/audit.ts:25`, and `src/lib/domain/email/service.ts:52` (`reason: String(err)`). `docs/SECURITY_MODEL.md:32` states: "No tokens, keys, or wallet secrets logged. Structured logs redact `authorization`, `cookie`, `token` fields." Grepping `src/` for `redact` returns **no matches** — the redaction layer does not exist. The log statement does not log headers, so the *specific* fields named are not in fact emitted today, but `String(err)` on a Prisma error includes the failing query and, for connection errors, the connection target; `String(err)` on an undici/`fetch` failure includes the full URL, which for the Resend call is the fixed endpoint and for the collector path can embed a user-supplied host. `server.log` is written by `package.json:8` (`| tee server.log`) with no rotation, and `.gitignore:46` (`*.log`) covers it.

**Fix.** Add a single `logError(component, err, meta)` helper that (a) classifies known error types, (b) replaces `message` with a stable error code for unknown types, (c) scrubs `DATABASE_URL`/`Authorization`/`Set-Cookie`/token-shaped substrings, and route every `console.error` through it. Rotate `server.log` and ship logs off-host.

---

### H-7 — Webhook and public endpoints are unthrottled, and the webhook path re-parses the body without a size cap

**Evidence (CONFIRMED).** `src/app/api/v1/billing/webhook/route.ts:8-19`:
```ts
 8:export const POST = handler(async ({ req, requestId }) => {
 9:  const raw = await req.text();
10:  const signature = req.headers.get("stripe-signature");
```
`await req.text()` buffers the **entire** body into memory before signature verification, and no route in the app checks `Content-Length` or caps body size (repo-wide grep for `content-length` / `bodyParser` / `MAX_BODY` returns nothing). An unauthenticated caller can therefore force an arbitrarily large allocation per request on the one route that is deliberately exempt from `verifyMutationOrigin` (server-to-server, no Origin — `src/lib/contracts/http.ts:28-48`). The same unbounded-body pattern exists at `src/app/api/v1/auth/[action]/route.ts:12` and every `await req.json()` call site.

**Exploit scenario.** Memory exhaustion via a single large POST to `/api/v1/billing/webhook`; no credentials needed, no rate limit (H-3), no body limit. Signature verification happens *after* the read, so the attacker does not need a valid `whsec` to force the allocation.

**Fix.** Reject bodies over a small cap (e.g. 256 KB) by inspecting `content-length` and/or streaming with an early abort before `req.text()`; apply the cap inside `handler()` so every route inherits it. Then add per-IP throttling to the webhook route keyed on a fixed identity (it has no session) — Stripe retries from a small, stable set of source addresses, so a tight allowlist plus a token bucket is safe.

---

### H-8 — Order-intent execution path has a pre-claim read-then-act window, and unsigned-transaction content is not bound to the intent

**Evidence (CONFIRMED).** `src/app/api/v1/trading/execute/route.ts` is well guarded for its gated state: it refuses when `!readiness.executionAllowed` (lines 34-39), validates the body with zod (line 42), checks the wallet address (line 47), binds the intent to `userId` (line 52), requires `status === "GATED_EXECUTION_DISABLED"` (line 57), rejects expired quotes (line 60), and performs an **atomic conditional claim** (lines 66-72) whose `claim.count !== 1` branch closes the double-submit race. That part is correct and is the strongest concurrency control in the codebase.

Two residual gaps, both documented as pre-enablement conditions at `docs/SECURITY_MODEL.md:55`:

(a) **No content binding.** The route accepts `signedTransaction` (line 14, base64, 256-8192 chars) and forwards it to `jup.executeSwapOrder` (line 77) without decoding it to verify that mints, amounts, slippage and signer match `intent.inputMint` / `intent.outAmount` / `intent.slippageBps` / `walletAddress`. A caller who owns an intent for 1 USDC→SOL can submit a *different* signed transaction (e.g. a large approval or a swap of a different pair) under that intent. The `userId` check proves the intent is theirs; it does not prove the transaction is the one they quoted.

(b) **`intent.status` is not re-checked inside the claim predicate's transaction.** The claim is atomic on `(id, userId, kind, status)` — that is sound — but the subsequent `db.transactionRecord.update` at line 111 is an unconditional write by `id`. Combined with (a), the record's `status`/`signature` can be overwritten by a racing execution of the same intent if a second caller wins a later transition. In practice line 66's guard makes the window very narrow; it is recorded as a hardening item rather than a live exploit.

**Exploit scenario.** Post-gate only. A user with a legitimate intent submits a transaction the platform never quoted; the platform records `CONFIRMED` against an intent whose amounts do not match, and the audit log at lines 120-127 records `intentId` + `walletAddress` as if the intent had been honoured. Financial misreporting and a plausible deniability problem for dispute resolution.

**Fix.** Before line 77, decode the VersionedTransaction, assert `signer === walletAddress`, and assert the instruction set references `intent.inputMint`/`intent.outputMint` with `intent.inAmount` and a slippage bound consistent with `intent.slippageBps`; reject otherwise with `VALIDATION_FAILED`. Make the line-111 update conditional on the claimed status. Do both before `TRADING_ENABLED` is ever set.

---

### H-9 — `assertTenant` is bypassed by a cast in the watchlist-items route

**Evidence (CONFIRMED).** `src/app/api/v1/watchlists/[id]/items/route.ts:9-15`:
```ts
async function resolveWatchlist(req: NextRequest, ctx: { workspaceId: string }) {
  const id = req.nextUrl.pathname.split("/")[4]; // /api/v1/watchlists/{id}/items
  const wl = await db.watchlist.findUnique({ where: { id } });
  if (!wl) throw new ApiHttpError("NOT_FOUND", "Watchlist not found.", false);
  assertTenant({ ...ctx } as never, wl.workspaceId);
  return wl;
}
```
`assertTenant` expects an `AuthContext` (`src/lib/auth/context.ts:68-72`) and only reads `.workspaceId`, so the cast is *behaviourally* harmless — the comparison at line 69 is correct and the tenant check does run. It is recorded as High only because a `as never` cast on an authorization primitive is exactly the kind of construct that survives review and then breaks silently when `assertTenant` is extended to read another field (e.g. `platformRole`). The same route also parses the watchlist id from `pathname.split("/")[4]` rather than using the typed `params` — a pattern repeated at `src/app/api/v1/reports/[id]/route.ts:14`, `src/app/api/v1/research/runs/[id]/route.ts:8`, and `src/app/api/v1/ventures/[slug]/[sub]/route.ts:24,78,231`. Manual index arithmetic is correct today but silently returns `undefined` if the route shape ever gains a segment.

**Fix.** Change the signature to `ctx: AuthContext`, pass `ctx` through, and delete the cast. Prefer the framework's typed `params` (Next 16 provides them) or a small `parseIdFromPath(pathname, expectedSegments)` helper that asserts the segment count.

---

## 4. Medium Findings

### M-1 — `POST /api/v1/billing/verify` lacks the ADMIN role gate that checkout and portal enforce

**Evidence (CONFIRMED).** `src/app/api/v1/billing/checkout/route.ts:13-14` and `src/app/api/v1/billing/portal/route.ts:7-8` both call `requireWorkspaceRole(ctx, "ADMIN")`. `src/app/api/v1/billing/verify/route.ts:12-13` calls only:
```ts
13:  const ctx = await requireAuth();
```
then `verifyCheckoutIntent({ workspaceId: ctx.workspaceId, userId: ctx.userId, memo })`. This route is the one the assignment listed as already fixed by another worker ("billing verify workspace-role gate"); in the tree I read it is **not** fixed. **RE-VERIFIED after writing:** `grep -n "requireAuth\|requireWorkspaceRole" src/app/api/v1/billing/verify/route.ts` still returns only `requireAuth` (line 2 import, line 13 call), and `git status --porcelain` reports `?? src/app/api/v1/billing/verify/route.ts` — the file is *untracked*, i.e. newly added and never committed. The gap is real and current; a fix, if one is in flight, has not landed. To be certain after any concurrent edit, re-run that grep.

### M-2 — Billing status endpoint is MODERATOR-gated, but the client billing UI is not

**Evidence (CONFIRMED).** `src/app/api/v1/billing/status/route.ts:10`:
```ts
  await requirePlatformRole(ctx, ["PLATFORM_ADMIN", "MODERATOR"]);
```
while the client billing panel unconditionally queries it for every authenticated user — `src/components/fs/settings-view.tsx:134`:
```ts
  const billing = useQuery({ queryKey: ["billing", "status"], queryFn: () => api.get<BillingStatus>("/api/v1/billing/status") });
```
**Impact.** Every ordinary user's Settings page issues a request that will 403, so the billing section is permanently in an error state for all non-admins; and if the intent was "plans visible to all, subscription to admins", the split is not implemented. Either way the entitlement surface is inconsistent with `GET /api/v1/pricing` (`src/app/api/v1/pricing/route.ts:9-22`), which is fully public and returns the same plan list. Fix by splitting the response: public plan list + `subscription` gated on platform role, and let the client render the 403 honestly.

### M-3 — Plan entitlements are data-only; no limit is enforced anywhere

**Evidence (CONFIRMED).** `src/lib/domain/billing/plans.ts:29-37` defines `savedVentures`, `researchRunsPerMonth`, `watchlists`, `reportExport`, `apiAccess`, `seats`; `ensurePlans` persists them to `Plan.entitlementsJson` (lines 126-145). Repo-wide grep for any consumer of those keys outside `plans.ts` and the marketing components returns nothing. Concretely: `POST /api/v1/research/runs` has a per-venture concurrency cap (line 42) but no monthly cap; `POST /api/v1/watchlists` hard-codes 12 lists (line 32) rather than reading the plan; `POST /api/v1/saved-searches` hard-codes 20 (line 26). **Impact.** The paid tiers do not constrain anything, so there is no functional reason to buy one — a business-integrity defect with a security dimension (unbounded resource consumption, H-3).

### M-4 — `createCheckoutSession` and `resolveAllowedOrigin` are dead code with a known-vulnerable shape

**Evidence (CONFIRMED).** `src/lib/domain/billing/stripe.ts:100` defines `createCheckoutSession`; grep for callers across `src/` returns only the definition. `resolveAllowedOrigin` (line 333) is called once, from `src/app/api/v1/billing/portal/route.ts:10`. If `createCheckoutSession` were wired up as-is, the redirect URLs at lines 130-131 interpolate `input.origin` directly:
```ts
130:      success_url: `${input.origin}/settings?billing=success&session_id={CHECKOUT_SESSION_ID}`,
131:      cancel_url: `${input.origin}/settings?billing=cancelled`,
```
`resolveAllowedOrigin` does include `requestOrigin` in the allowlist (line 338) and `requestOrigin` is derived from `new URL(req.url).origin` (`portal/route.ts:10`) — so the allowlist is only as trustworthy as the `Host` header. **Impact.** Latent open-redirect / token-leak-into-URL if this path is enabled without also hardening `Host` handling. Also note `docs/SECURITY_MODEL.md:28` describes this control as active, which it is not for the checkout path (nothing calls it).

### M-5 — `prisma/db push --accept-data-loss` is the schema workflow

**Evidence (CONFIRMED).** `package.json:10-13`:
```json
"db:push": "prisma db push --accept-data-loss",
"db:migrate": "prisma migrate dev",
"db:reset": "prisma migrate reset",
```
`--accept-data-loss` is a legitimate dev convenience but is one flag away from being run against a production `DATABASE_URL`; `prisma/migrations/` exists, so versioned migrations are available and `db:push` should be dev-only. **Impact.** A single mistyped invocation against production silently drops columns/rows with no backup gate.

### M-6 — A legacy SQLite database with real user data is committed

**Evidence (CONFIRMED).** `db/custom.db` is tracked (`git ls-files db/custom.db`; blob size 856,064 bytes; `file` reports "SQLite 3.x database"). `prisma/schema.prisma:11` now declares `provider = "postgresql"`, and `docs/KNOWN_LIMITATIONS.md:10` states no SQLite dependency remains — so this file is a leftover from the pre-Postgres era. `strings db/custom.db` yields 104 `@` characters and two plausible personal addresses (`heaveykevin2@gmail.com`, `senddageeand4get@gmail.com`). `test-fs.db` (628 KB, repo root) is untracked but present in the working directory. **Impact.** Historical personal data (emails, and possibly bcrypt hashes — `strings | grep -c '\$2[aby]\$'` returned 0, so probably no hashes) published to the repo; also an unqueried, unencrypted artifact that will be included in any naive backup.

### M-7 — Internal prompt/spec documents are committed to the repository

**Evidence (CONFIRMED).** `upload/Pasted Content_1794753376653.txt` (38,043 bytes), `upload/Pasted Content_1794753575583.txt` (35,664), `upload/Pasted Content_1794807978100.txt` (60,545), and `tool-results/read_1794761704216_79ab26e94e58.txt` (44,391) are all tracked. Their contents are the product's master engineering directive, internal architecture tree, and stack decision tables — including statements like "Never log access tokens, private keys, complete wallet secrets". **Impact.** Information disclosure: a public reader learns the full intended architecture, internal conventions, and the operator's security posture. No credentials found inside (grep for `ghp_`/`GOCSPX`/`re_` returned only false positives from prose).

### M-8 — `ensurePlans()` force-overwrites the plan catalog on every pricing read

**Evidence (CONFIRMED).** `src/lib/domain/billing/plans.ts:126-146` upserts with `update: { name, monthlyPriceMicros, entitlementsJson, sort, active: true }`, and `listActivePlans` (line 150) calls `ensurePlans()` on every invocation. `GET /api/v1/pricing` (public, unauthenticated, `src/app/api/v1/pricing/route.ts:9-10`) therefore performs five `upsert` round trips per request. **Impact.** Two problems: (a) any operator price change made directly in the database is silently reverted on the next anonymous pricing-page view — the code comment claims prices are "configuration data", but the seed is authoritative; (b) an unauthenticated endpoint issues five writes per hit, a cheap write-amplification vector with no rate limit (H-3). Cache `ensurePlans()` behind a module-level promise, and make it adopt existing rows rather than overwrite them.

### M-9 — Session has no rotation, no sliding expiry, and no privilege-change invalidation

**Evidence (CONFIRMED).** `src/lib/auth/session.ts:6-7` (`SESSION_TTL_DAYS = 7`), cookie options at lines 45-51 (HttpOnly, SameSite=Lax, Secure in production, 7-day expiry, `path: "/"`), `resolveSession` at lines 75-84 validates token hash + revocation + expiry + user status on **every** request (good — this is the control that makes the other gaps survivable). There is no rotation on login (a new session row is created, but any pre-existing session for the same user stays valid), no rotation on privilege change, and no sliding renewal. `docs/SECURITY_MODEL.md:9` discloses this. **Impact.** A stolen session token is valid for up to 7 days with no user-visible signal; a demoted admin keeps their session until expiry (roles are re-read per request, so authorization is correct, but the session itself is not invalidated).

### M-10 — `ApiKey` model exists but is entirely unused

**Evidence (CONFIRMED).** `prisma/schema.prisma:684-690` defines `ApiKey` (with `prefix`, `keyHash`, presumably expiry). Grep for `apiKey`/`ApiKey` across `src/` returns only the unrelated `heliusApiKey` constructor parameter in `src/lib/providers/solana.ts:45-47`. **Impact.** Either dead schema (confusing, and a future "API access" entitlement has no implementation — note `plans.ts:52` advertises `apiAccess: false` for RESEARCHER) or a half-built feature that will be implemented without a threat model. Decide and document.

### M-11 — `requestId` is taken from a client-supplied header

**Evidence (CONFIRMED).** `src/lib/contracts/http.ts:59`:
```ts
    const requestId = req.headers.get("x-request-id") ?? randomUUID();
```
**Impact.** A caller can set `x-request-id` to any string, including a newline-bearing or extremely long value, and it is echoed into the response header (line 14) and into error logs (line 76). Low direct impact, but it lets an attacker poison log correlation and forge cross-request traces during incident response.

### M-12 — `POST /api/v1/saved-searches` accepts an arbitrary JSON object with no depth/size bound

**Evidence (CONFIRMED).** `src/app/api/v1/saved-searches/route.ts:24`:
```ts
  const parsed = z.object({ name: z.string().min(1).max(80), query: z.record(z.string(), z.unknown()) }).parse(body);
```
`z.record(z.string(), z.unknown())` has no key-count or nesting limit, and the parsed object is `JSON.stringify`-ed into `queryJson` (line 28) and echoed back verbatim on GET (line 14). Combined with the unbounded request body (H-7) and the 20-row cap (line 26) this is a modest storage-amplification and stored-JSON-injection surface: the value is later consumed by client code that renders it as a query summary.

### M-13 — Provider adapters log and persist raw error strings; `getSlot()` bypasses the circuit breaker

**Evidence (CONFIRMED).** `src/lib/providers/solana.ts:72-75` calls `this.rpc.getSlot().send()` directly, with no `breakerAllows` check, unlike every `createBaseProvider.fetch` call site (`framework.ts:124`). `src/lib/providers/framework.ts:318` builds `new ProviderError("NETWORK", \`Fetch failed: ${String(err)}\`)` from the raw error, and that string is persisted to `JobRecord.lastError` (`queue.ts:130`) and surfaced in the admin overview (`src/app/api/v1/admin/overview/route.ts:27-28`). **Impact.** Degraded-provider conditions are amplified: `/api/v1/health` (public) calls `getSlot()` on every hit with no breaker, so a slow RPC endpoint becomes an unauthenticated latency amplifier.

---

## 5. Low / Informational

- **L-1 — `docs/runbooks` does not exist.** `docs/SECURITY_MODEL.md:42` claims "Incident runbook placeholders in docs/runbooks (auth compromise, provider outage, data corruption, AI failure)". `ls -R docs/runbooks` → no such directory. Either create it or strike the claim. (Documentation integrity is a security control: it is what an on-call engineer reads at 03:00.)
- **L-2 — `next-auth` is a dependency but unused.** `package.json` lists `"next-auth": "^4.24.15"`; grep for `next-auth` across `src/` returns nothing. Unused auth libraries are a standing supply-chain and confusion risk (`next-auth` v4 has a known migration path to v5/Auth.js). Remove it or adopt it — do not leave both `next-auth` and the bespoke session layer in the tree.
- **L-3 — `src/components/ui/chart.tsx` is dead code containing a `dangerouslySetInnerHTML` CSS sink.** Lines 82-100 interpolate `id` and color values into a `<style>` body; `ChartContainer` renders it at line 63. Nothing imports `ui/chart` (repo-wide grep: no importers). Delete the file — a `dangerouslySetInnerHTML` sink with no owner is a liability that only needs one future caller.
- **L-4 — `reactStrictMode: false`.** `next.config.ts:29`. Not a security control, but it disables the double-invoke checks that surface effect bugs; worth a comment explaining why it is off.
- **L-5 — `server.log` is written with `tee` and never rotated.** `package.json:8`. `.gitignore:46` covers `*.log`, so it is not committed, but it will grow without bound on the host.
- **L-6 — `db/custom.db` and `test-fs.db` coexist with a Postgres-only schema.** See M-6; the untracked 628 KB `test-fs.db` at repo root should be deleted so it cannot be picked up by a stray `git add -A`.
- **L-7 — The `robots.ts` disallow list is inconsistent.** `src/app/robots.ts:11-21` disallows `/api/` for `*`, and lines 53-56 add a second `*` rule for `/admin`, `/settings`, `/api/v1/admin`, `/api/v1/trading`. Redundant, and `robots.txt` is advisory only — do not treat it as an access control (it is not one here: the real controls are `requireAuth` at the route level).
- **L-8 — `.env` file mode is `100755` (executable) in the index.** Cosmetic, but it signals the file was added carelessly; `git ls-files -s .env` shows `100755`.
- **L-9 — `POST /api/route.ts` is a leftover scaffold.** `src/app/api/route.ts:3-5` returns `{"message":"Hello, world!"}` with no auth, no `handler()` wrapper, and therefore none of the security headers or the Origin check. Remove it.
- **L-10 — `docs/SECURITY_MODEL.md:41` claims CI-based dependency scanning; there is no `.github` directory.** `ls .github` → no such directory. `bun audit` may be run manually (there is no `package-lock.json`, only `bun.lock`, so `bun audit` is the right tool), but "configured in CI" is not true of this repo. Correct the claim or add the workflow.
- **L-11 — Password reset / email verification are documented and stubbed but unreachable.** `docs/KNOWN_LIMITATIONS.md:13` says verification and reset tokens "are generated and delivered through it [Resend]"; `src/lib/domain/email/service.ts:66-88` implements `sendVerificationEmail`, `sendPasswordResetEmail`, `hashToken` — and grep finds **no caller** for any of them, and no route or schema field writes `emailVerifiedAt` (`User.emailVerifiedAt` exists at `prisma/schema.prisma:25` and is only ever *read*, at `service.ts:156`). There is also no change-password endpoint (`grep passwordHash` in `src/app` returns nothing). The UI copy at `src/components/fs/auth-view.tsx:4` references reset delivery. **Impact:** users cannot recover an account, and `emailVerified` is permanently false — an honest gap, but it should be stated in `KNOWN_LIMITATIONS` rather than implied as working.

---

## 6. What Is Already Done Well

Recorded explicitly so these are not "fixed" a second time or regressed during remediation.

1. **Session design.** 256-bit `randomBytes(32)` token, only `sha256(token)` persisted (`src/lib/auth/session.ts:39-42`, unique index at `prisma/schema.prisma:41`), `timingSafeEqual` helper available and used where it matters, HttpOnly + SameSite=Lax + Secure-in-production cookie (lines 45-51). Server-side revocation checked on every request including a deleted-user check (lines 75-84).
2. **Uniform, timing-equalized login failure.** Unknown emails still run a full bcrypt compare against a throwaway hash (`src/lib/auth/service.ts:117-125`), closing the latency side-channel for account enumeration. This is a control most teams miss.
3. **Single mutation-safety chokepoint.** Every route except three goes through `handler()`, which enforces an Origin/Host match and rejects `Sec-Fetch-Site: cross-site` (`src/lib/contracts/http.ts:28-48`) on top of SameSite=Lax. That is genuine defence-in-depth against CSRF, and it is applied uniformly rather than per-route.
4. **Two-axis authorization with a real tenant guard.** `requirePlatformRole` (rank-less allowlist) and `requireWorkspaceRole` (rank comparison via `ROLE_RANK`, `src/lib/auth/context.ts:8,51-62`) plus `assertTenant` (lines 68-72). Roles are re-read from the database on every request, so a demotion takes effect immediately.
5. **No SQL injection surface.** Zero occurrences of `$queryRaw`, `$executeRaw`, `$queryRawUnsafe`, `$executeRawUnsafe` in `src/`, `prisma/`, or `scripts/`. Every query is the Prisma query builder with typed inputs.
6. **Zod at every API boundary.** Every route module imports and uses `z` on request bodies (e.g. `billing/checkout/route.ts:16-18`, `alerts/route.ts:6-10`, `trading/execute/route.ts:11-15`, `trading/order-intents/route.ts:10-15`). No route reads `req.json()` into a Prisma call without parsing.
7. **Stripe webhook is the correct shape.** Signature verified over the raw body via the SDK (`src/lib/domain/billing/webhook/route.ts:9,18`; `stripe.ts:180-193`), timing-safe by construction, with an insert-first idempotency ledger (`stripe.ts:249-268`, unique `eventId` at `prisma/schema.prisma:654`) and deliberate transient-vs-permanent failure semantics (release the claim on transient, keep it on permanent). This is better than most production integrations.
8. **Trading execution is genuinely default-deny.** Three independent conditions — four APPROVED human review gates, an ENGAGED-by-default kill switch, and `TRADING_ENABLED=true` (`src/lib/domain/trading/gates.ts:1-54`, `execute/route.ts:32-39`) — with an atomic conditional claim preventing double-submission (`execute/route.ts:66-72`) and quote-expiry enforcement (line 60). The route is a hard no-op while gated.
9. **SSRF guard, structurally.** Scheme allowlist, hostname blocklist including `metadata.google.internal`, IPv4 *and* IPv6 private/link-local/ULA/NAT64/6to4 checks, IPv4-mapped re-checked as IPv4, manual redirect following with full per-hop revalidation and a 3-hop cap (`src/lib/providers/framework.ts:185-263, 299-345`). The residual gap (H-4) is documented in both the code and `KNOWN_LIMITATIONS`.
10. **No secrets in the client bundle.** Grep for `process.env` inside every `"use client"` module returns nothing. The only `NEXT_PUBLIC_*` reads in `src/` are `NEXT_PUBLIC_SITE_URL` (`stripe.ts:336,352`, `email/service.ts:24`, `seo.ts:11`) — all non-secret. No `sk_`/`ghp_`/`re_` pattern in `.next/static`.
11. **No stack traces to clients.** `src/app/error.tsx` and `src/app/global-error.tsx` render a digest and a generic message; `src/lib/contracts/http.ts:78` returns a fixed `"An unexpected error occurred."` for unknown errors. `ignoreBuildErrors: false` (`next.config.ts:27`) means type errors fail the build rather than shipping.
12. **Prompt-injection handling for AI research.** External content is delimited as `DATA-BEGIN`/`DATA-END` with an explicit instruction to treat it as data, obvious injection markers are stripped, and **citations are validated server-side against retrieved evidence ids** (`src/lib/domain/research/engine.ts:119-146, 158-192`). Unsupported claims are flagged as `VALIDATION_FAILED`. This is a genuinely thoughtful implementation of a problem most teams ignore.
13. **Reasonable security-header baseline.** `next.config.ts:32-42` sets CSP, `nosniff`, `X-Frame-Options: DENY`, a strict `Referrer-Policy`, a `Permissions-Policy`, COOP, and HSTS in production; `poweredByHeader: false`.
14. **Audit trail on the security-relevant events.** `recordAudit` is called for register/login/logout, venture creation and dedup, founder attribution, checkout intent creation and confirmation, gate decisions, trading execution, and account deletion. Gaps are documented (best-effort writes, `src/lib/domain/shared/audit.ts:24-26`).
15. **No CORS wildcard, no `OPTIONS` handler, no server actions.** Grep for `Access-Control-Allow-Origin` returns nothing and there is no `"use server"` directive anywhere — the attack surface is exactly the 30 route modules, all of which are same-origin by construction.

---

## 7. Recommended Fix Order

Sequenced by (exploitability × blast radius) ÷ effort. P0 items are all reachable without an account or with a free account.

**Reconciliation with concurrent worker fixes (checked at write time).** The assignment named several items as already fixed by other workers. I verified each against the working tree rather than assuming, so the list below separates *confirmed present* from *claimed-but-absent*:

| Item the assignment says is fixed | My observation | Status |
|---|---|---|
| Billing verify workspace-role gate | `src/app/api/v1/billing/verify/route.ts` still has only `requireAuth` at line 13; file is untracked (`??`) | **NOT PRESENT** — still M-1, still P1 |
| Admin integrations panel rendering | Not in my scope; I read only the route behind it (`admin/overview/route.ts:35-50`, which renders `getBillingStatus()` at line 43) | **OUT OF SCOPE — UNVERIFIED** |
| Alert badge wired | Client-side; not in my scope (I audited the API contract, `alerts/route.ts:12-32`) | **OUT OF SCOPE — UNVERIFIED** |
| `/auth ?verify=` / `?reset=` consumption | `docs/KNOWN_LIMITATIONS.md:13` and `src/lib/domain/email/service.ts:66-88` generate tokens; I found **no caller** and no `emailVerifiedAt` writer | **STILL OPEN** — see L-11 |
| `.env.example` | Present at repo root (5,101 bytes, created 11:24 today) — good, but `.env` itself is still tracked (C-1) | **PARTIALLY PRESENT** — the template exists, the leak does not stop until `.env` is untracked |
| `/` + `.example` contacts | Not in my scope (SEO/marketing surface) | **OUT OF SCOPE — UNVERIFIED** |

So of the six, one is confirmed landed (`.env.example`, partial), one is confirmed **not** landed (billing verify), one is still open (auth token consumption), and three I did not audit. Nothing here contradicts another worker's report — it only means the P0/P1 list above must not assume those fixes are in.

### P0 — this week, before any further feature work

1. **C-1 — rotate the four live credentials, then untrack `.env`.** Rotation first because history rewrite takes coordination: Resend key, GitHub PAT, `GOOGLE_OAUTH_CLIENT_SECRET`, `HELIUS_API_KEY`. Then `git rm --cached .env`, commit `.env.example` (key names only, no values), and exclude `.env` from the standalone artifact. Add `MFA_ENCRYPTION_KEY` to a secret manager, not a file.
2. **C-2 — fix client-IP derivation.** Add `TRUSTED_PROXIES` parsing; ignore `X-Forwarded-For` when the peer is not trusted; use the rightmost untrusted hop. Bind Next to `127.0.0.1:3000`. Without this, every other rate limit in the app is decorative.
3. **C-3 — collapse the two CSPs into one and remove `'unsafe-eval'` from production.** Delete `src/lib/contracts/http.ts:10-11,17`; make `next.config.ts` the single owner; add nonces for `script-src` (this also covers L-3's `dangerouslySetInnerHTML` sinks at `layout.tsx:91` and `content.tsx:52`).
4. **C-4 — add `import { randomUUID } from "crypto"` to `src/lib/domain/billing/crypto.ts`.** One line; the payment path is currently broken. Verify with `bun test tests/crypto-checkout.test.ts`.
5. **H-7 — cap request bodies and throttle the webhook.** Reject >256 KB before `req.text()`; add per-IP throttling to `/api/v1/billing/webhook`.
6. **H-1 + H-2 — close the role-gate asymmetries.** `requireWorkspaceRole(ctx, "ANALYST")` on `alerts` PATCH/DELETE and `saved-searches` DELETE; `requireWorkspaceRole(ctx, "ANALYST")` on `POST /api/v1/ventures`. Add a table-driven route-authorization test so this class cannot recur.

### P1 — next 2 weeks, before commercial launch (all are launch blockers per the repo's own docs)

7. **H-3 — real rate limiting** in `handler()`, Postgres-backed, keyed on `session.userId` with IP fallback: tighten `/api/v1/health` (cache + drop the two `count()`s), `/api/v1/markets`, `/api/v1/trading/order-intents`, `/api/v1/research/runs`, `/api/v1/ventures` POST. Add a `Caddyfile` `rate_limit` backstop.
8. **M-3 — enforce the plan entitlements** that already exist as data (`researchRunsPerMonth`, `watchlists`, `savedSearches`, `reportExport`). This is what makes the paid tiers real and simultaneously closes the worst of H-3.
9. **M-1/M-2 — reconcile the billing authorization model.** Add the missing `requireWorkspaceRole(ctx, "ADMIN")` to `billing/verify` (still absent — see the reconciliation table above), and split `billing/status` into public plans + role-gated subscription so the Settings page stops 403-ing for ordinary users.
10. **H-4 — close the DNS-rebinding race** with connect-by-IP pinning or an egress proxy. Add a rebinding regression test.
11. **H-5 — re-key and bound the login throttle**; move counters out of process memory.
12. **H-6 — one redaction-aware logging helper**; route all five `console.error` sites through it; rotate `server.log`.
13. **H-9 — remove the `as never` cast** in `watchlists/[id]/items/route.ts:13`; adopt typed route params instead of `pathname.split("/")[n]` in the four routes that do it.
14. **M-6/M-7 — purge `db/custom.db` and the tracked `upload/`+`tool-results/` spec dumps** from the repo and from history if the remote is shared.

### P2 — hardening / hygiene (tracked, not launch-blocking)

15. **H-8 — bind signed-transaction content to the intent** (decode, verify signer + mints + amounts + slippage) and make the post-execution update conditional. Must land before `TRADING_ENABLED` is ever set.
16. **M-4 — delete or harden `createCheckoutSession`** (dead code that interpolates a client-influenced origin); make `Host` handling authoritative for `resolveAllowedOrigin`.
17. **M-5 — make `db:push` dev-only**; document `prisma migrate deploy` as the production path.
18. **M-8 — cache `ensurePlans()`** and make it non-destructive.
19. **M-9 — session rotation** on login and privilege change; add sliding expiry or shorten the TTL.
20. **M-10 — decide the `ApiKey` model's fate** (implement with a threat model, or drop it).
21. **M-11 — ignore client-supplied `x-request-id`** or validate it against `^[A-Za-z0-9_-]{8,64}$`.
22. **M-12 — bound `saved-searches` query JSON** (key count, depth, total size).
23. **M-13 — respect the breaker in `SolanaAdapter.getSlot()`**; stop persisting raw provider error strings.
24. **L-1/L-10 — create `docs/runbooks/`** and correct the CI claim in `SECURITY_MODEL.md:41` (or add the workflow).
25. **L-2/L-3/L-9 — delete `next-auth`, `ui/chart.tsx`, and `src/app/api/route.ts`**; update L-4/L-5/L-7/L-8/L-11 doc/claim drift.

---

## 8. Verification Notes / Open Items

Items I could not settle from the files I read, with the command that settles each. None of these block the P0 list.

| # | Claim to verify | Command |
|---|---|---|
| U-1 | Is `.env` still tracked right now? (assignment asked specifically) | **ANSWERED: yes.** `git ls-files -s .env` → `100755 769ebf2805af57a8e66acf4a1d25a4e2a6be556d 0	.env`, and `git check-ignore -v .env` produces no output. Also `git status --porcelain` shows ` M .env`, so the working tree holds live secrets that are one `git add -A` from being published. |
| U-2 | Is the `billing/verify` ADMIN gate present? (assignment says fixed) | **ANSWERED: no.** `grep -n "requireAuth\|requireWorkspaceRole" src/app/api/v1/billing/verify/route.ts` → only `requireAuth` (line 2 import, line 13 call). The file is untracked (`??` in `git status`), so it is a newly added route that has never been through review. |
| U-3 | Does the checkout test currently pass (C-4)? | `bun test tests/crypto-checkout.test.ts` |
| U-4 | Is the whole suite green? | `bun test` (I did not run it; `tests/` is excluded from `tsconfig.json`, so `tsc` will not catch these) |
| U-5 | Is `db/custom.db` free of password hashes? | `strings db/custom.db \| grep -c '\$2[aby]\$'` → I observed `0`. |
| U-6 | Does the deployed host actually front `:3000` with Caddy? (decides C-2 severity) | `ss -tlnp` on the host; confirm `:3000` is not publicly bound. My sandbox had no `ss`/`sshd`, so this is unverified from here. |
| U-7 | Is a `TRUSTED_PROXIES` implementation present in another branch? | `git grep -n TRUSTED_PROXIES $(git rev-list --all)` |
| U-8 | Are the secrets in `.env` actually live? | Do **not** test them. Rotate on the assumption that they are; only the provider dashboards can confirm prior use (Resend → API key last-used; GitHub → Settings → Developer settings → token activity; Google → Credentials; Helius → dashboard usage). |
| U-9 | Is `next/standalone/.env` shipped anywhere? | Inspect the deploy pipeline / Dockerfile (none found in this repo; `Caddyfile` is the only deploy artifact present). |

---

*Report ends. No source files were modified. The only file created is `docs/SECURITY_AUDIT.md`.*