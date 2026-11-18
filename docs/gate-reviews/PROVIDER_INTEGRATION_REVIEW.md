# PROVIDER_INTEGRATION_REVIEW — evidence package (machine phase complete)

**Gate state:** NOT_STARTED · **Integration-owner sign-off:** REQUIRED

## 1. Integration under review

Jupiter Swap API V2 managed flow: `POST /order` → client wallet signing →
`POST /execute`, plus the read-side integrations used while gated (Price API
V3 snapshots, Lite quote previews) and Solana RPC status resolution.

## 2. Machine verification evidence (2026-11-15)

| Check | Result |
| --- | --- |
| Jupiter health (live) | `HEALTHY` via `/api/v1/health` |
| Live quote preview (SOL→JUP, 0.1 SOL) | real quote returned: `outAmount 27376379`, `slippageBps 50`, expiry ~60s — recorded as QUOTE_PREVIEW with asOf + expiry |
| Quote expiry handling | `QUOTE_EXPIRED` code exists; execute route now rejects intents past `quoteExpiresAt` before any provider call |
| Solana RPC (live) | `HEALTHY`, slot 469813579; signature-status resolution implemented (CONFIRMED/UNCERTAIN/FAILED honest states) |
| Failure taxonomy | ProviderError kinds NETWORK/TIMEOUT/RATE_LIMITED/INVALID_RESPONSE/AUTH_FAILURE/PERMANENT/PROVIDER_BLOCKED; circuit breaker per provider (5 failures/30s open); timeouts on all provider fetches |
| Rate-limit posture | header-driven RateLimitState on GitHub + Jupiter probes; surfaced in `/api/v1/providers` + admin overview |
| Request injection | fixed URL roots; URLSearchParams/JSON bodies; mints validated via `@solana/kit address()`; amounts `^\d+$`; zod on all inputs |

## 3. Open items the reviewer must condition on

1. **`/order` path unexercised** (`createSwapOrder` implemented, never called —
   execution is gated). The gate drill must include a live `/order` round-trip
   with a throwaway wallet on mainnet (or the agreed test surface) before
   APPROVED.
2. **Slippage/impact affordances**: quote previews carry slippageBps +
   priceImpactPct; the post-gate execution UI must surface both plus expiry
   countdown (product gate dependency).
3. **Jupiter API version pinning**: confirm V2 endpoints and SLA/rate limits
   with Jupiter's current terms; document a provider-break runbook (breaker
   opens → honest UNAVAILABLE states; no synthetic fallback exists).
4. **RPC submission reliability**: single-RPC submission today; consider a
   fallback RPC for post-gate execution reliability (Helius slot is wired but
   `HELIUS_API_KEY` is unset — honest MISCONFIGURED state).
5. ** UNCERTAIN-state runbook**: post-gate, UNCERTAIN outcomes (submission ok,
   confirmation unknown) need a reconciliation job + support procedure.

## 4. HUMAN SIGN-OFF (integration owner — do not self-sign)

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
