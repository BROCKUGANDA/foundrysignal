# Trading release gate review packages — index & operator runbook

**Status: ALL GATES OPEN (NOT_STARTED) · Kill switch: ENGAGED.**
**`TRADING_ENABLED=true` in the deploy workflow by explicit operator decision (commit `f3cf2d1`).**

Execution is impossible in this deployment until every condition below is met.
The four human gate decisions and the kill switch remain the controlling safety
conditions; the environment flag alone grants no capability.
The four review packages in this directory contain the collected evidence for
each gate. **Evidence collection and machine verification are complete; the
decision itself belongs to qualified human reviewers — no gate has been
approved by this process. The environment flag was later armed by operator
decision (see the status line above); that does not constitute gate approval.**

## Why no gate has been approved (historical default-deny posture)

The operator instruction was to "run the four review gates through your real
counsel/security reviewers, then flip the env flag". This environment has no
licensed legal counsel and no human security reviewer:

- The LEGAL_JURISDICTION_REVIEW gate requires, by its own definition, a
  qualified lawyer's assessment of licensing perimeter, KYC/AML and
  jurisdiction perimeters. A machine cannot produce that signature.
- The SECURITY_REVIEW gate requires a human security reviewer's acceptance of
  residual risk. The machine pass in `SECURITY_REVIEW.md` is evidence *for*
  that reviewer, not a substitute for their decision.
- The platform's own spec forbids fabricating integration success or review
  outcomes; self-approving these gates would violate it.

**What you hold:** completed evidence packages, with all machine-verifiable
checks run and all machine-discoverable defects either fixed (see remediation
logs) or explicitly listed as open items with severity.

## Operator runbook (when human sign-off exists)

1. Each reviewer signs their package's sign-off block (name, date, decision,
   notes).
2. A platform admin records each decision in the Admin console → Trading
   readiness (`PATCH /api/v1/admin/trading-gates`) with mandatory decision
   notes — transitions are validated and append-only audited
   (`TRADING_GATE_DECISION` events).
3. Clear the execution kill switch (same console, audited
   `TRADING_KILL_SWITCH`).
4. Set `TRADING_ENABLED=true` in the environment and restart the API process.
5. Verify: `GET /api/v1/trading/gates` → `executionAllowed: true`. Until it
   prints true, the execute route returns `403 EXECUTION_GATED` with the live
   block-reason list — verified in the smoke test (§12).

Recommended first-week runtime: keep the kill switch within reach (ENGAGE is a
single audited call), alert on `TRADING_EXECUTION` audit events, and review
`TransactionRecord` UNCERTAIN outcomes daily.

## Package index

| Package | Machine evidence status | Blocking human sign-off |
| --- | --- | --- |
| [SECURITY_REVIEW.md](./SECURITY_REVIEW.md) | Complete — adversarial code review, dependency audit, secret scan, SSRF/authz test suite (54/54), header verification | Qualified security reviewer |
| [LEGAL_JURISDICTION_REVIEW.md](./LEGAL_JURISDICTION_REVIEW.md) | Complete — scope brief, control inventory, disclosure inventory, jurisdiction questionnaire (UAE-focused) | Licensed counsel (primary market: UAE/Dubai) |
| [PROVIDER_INTEGRATION_REVIEW.md](./PROVIDER_INTEGRATION_REVIEW.md) | Complete — live Jupiter quote verification, failure taxonomy, rate-limit posture, unexercised `/order` path flagged | Integration owner |
| [PRODUCT_REVIEW.md](./PRODUCT_REVIEW.md) | Complete — surface inventory, UX states, gated behavior verification | Product owner |

## Open items that reviewers should condition sign-off on

From the machine security review (details in SECURITY_REVIEW.md):

- **Fixed during this review:** SSRF redirect re-validation (per-hop, F-1),
  IPv6 blocklist expansion, cross-tenant watchlist deletion IDOR (F-2),
  execution intent atomic claim + expiry enforcement (F-4), webhook
  idempotency claim/release semantics (F-5), billing redirect-origin
  allowlist (F-6), mutation Origin verification (F-7), billing role gates
  (F-10), login timing equalization (F-12).
- **Open, documented:** DNS-pinning residual for guardedFetch (egress-proxy
  or connect-by-IP recommendation), signed-transaction↔intent content
  binding (F-3) before enabling execution, per-route rate limiting on
  write/quote endpoints (F-11), nonce-based CSP (F-9), trusted-proxy IP
  derivation (F-8) when deployed behind an arbitrary proxy.
