# Edge-Case Hardening Report

Scope: verification of ten edge-case audit targets touched during the hardening cycle
(mid-November 2026 working tree). This report records what was re-verified, what was
repaired, and where the design consciously accepts a known limit.

## Gate results (final run)

| Gate | Command | Exit | Notes |
| --- | --- | --- | --- |
| Types | `bun x tsc --noEmit` | **0** | clean |
| Tests | `bun test` | **0** | 181 pass / 0 fail, 338 expect() calls, 9 files |
| Build | `bun run build` | **0** | Next.js standalone + `copy-build-assets` succeeded |

The test suite was red on the first run (1 failure). See *Repairs* below.

## Target-by-target status

| # | Target | Status | Evidence / notes |
| --- | --- | --- | --- |
| 1 | Report export ordering (citation appendix, section order) | VERIFIED_OK | `src/app/api/v1/reports/[id]/export/route.ts` emits title → sections in stored array order → `## Sources` in stored citation-object order → venture footer. Tenant check precedes the entitlement gate so plan/tenant info does not leak. |
| 2 | Rate-limit window rollover | VERIFIED_OK | `src/lib/rate-limit.ts`: two passes of (atomic conditional increment) → (atomic expired-window reset) → (existence check → create). `P2002` on create loops once; exhausted passes return blocked. `remaining` is clamped to `[0, limit]`. |
| 3 | Rate-limit expired-bucket sweep | VERIFIED_OK | Bounded opportunistic sweep (`take: 250`, delete by key + `expiresAt < now`) runs on the write path; failures are swallowed so the sweep can never degrade availability. |
| 4 | Rate-limit fail-open on store error | VERIFIED_OK | Whole body wrapped; any Prisma error logs `rate-limit store error; failing open` and returns `{ allowed: true, remaining: limit, dbError: true }`. No 500 surface. |
| 5 | Client-IP malformed inputs | FIXED (test) | Implementation is correct; the test assertion at `tests/client-ip.test.ts:102` asserted `1.2.3.4` matched `10.0.0.0/8` (it does not — different network). Rewritten to use `10.9.8.7` so the line tests only what it claims: trailing-whitespace tolerance. |
| 6 | Client-IP hop cap | VERIFIED_OK | `MAX_XFF_HOPS = 16`, applied via `slice(-16)` after normalisation; right-to-left walk skips trusted hops and returns the first untrusted parsed address, else `"local"`. |
| 7 | Framework IPv6 handling | VERIFIED_OK | `src/lib/providers/framework.ts` expands hextets with `::` compression, re-checks IPv4-mapped/compatible/NAT64/no-longer-6to4 forms through the private-IPv4 checks; unparseable IPv6 fails safe (treated as blocked). |
| 8 | Framework connect-by-IP pinning | VERIFIED_OK | `validateHop` resolves with `{ all: true }`, rejects *any* record in a private range, then pins the first address; `pinnedLookupFor` hands that address to the transport's connect-time lookup so TLS SNI/Host keep the hostname while DNS cannot rebind. Covered by `tests/ssrf-pinning.test.ts`. |
| 9 | Entitlements: missing EXPLORER plan | VERIFIED_OK | `src/lib/domain/billing/entitlements.ts` looks up `EXPLORER` (`active: true`), retries after an opportunistic seed, and falls back to a synthetic Explorer entitlement set (`monthlyPriceMicros: 0`, empty parsed entitlements) when the plan cannot be seeded. No throw, no premium default. |
| 10 | Invitation seat TOCTOU | UNRESOLVED (accepted, documented) | `src/app/api/v1/workspaces/[id]/invitations/route.ts` counts members + pending invites, then creates. A concurrent pair can overshoot the seat cap by their counts. The code carries an explicit `NOTE (accepted TOCTOU)` block: closing it needs a serializable transaction or a counted seats column; seats self-reclaim on revoke/expiry and the overshoot is bounded to one seat per racing request. Not fixed in this cycle. |
| — | Tests for the above | VERIFIED_OK | `tests/client-ip.test.ts`, `tests/rate-limit.test.ts`, `tests/ssrf-pinning.test.ts`, `tests/crypto-checkout.test.ts`, `tests/entitlements.test.ts` all pass. |

## Repairs performed

1. `tests/client-ip.test.ts:102` — the only red assertion. The original line
   (`isTrustedProxy("1.2.3.4", ["10.0.0.0/8 ".trim()])` expecting `true`) contradicted its
   own neighbouring assertions: `1.2.3.4` is outside `10.0.0.0/8`. Changed the probe IP to
   `10.9.8.7` so the case still covers whitespace-trimmed CIDR entries. No production code
   and no other test line was touched; the file is new in this cycle, so there is no HEAD
   version to revert to.

No source file under `src/` was modified during verification.

## What was not inspected

- The `crypto-checkout` test logs a `prisma:error` about `AuditEvent_actorId_fkey` — the
  audit write fails inside a try/catch by design (`recordAudit` swallows errors) and the test
  passes; the FK failure comes from the test's synthetic actor not being persisted. Not
  investigated further.
- The seat-cap TOCTOU race is reasoned from the code, not reproduced with concurrent
  requests against the dev database.
- Marketing page content, SEO/JSON-LD output and the admin console were not part of the
  edge-case audit and were not reviewed for correctness here.
- IPv6 blocklist coverage was read, not fuzzed; only the listed test cases exercise it.
