# PRODUCT_REVIEW — evidence package (machine phase complete)

**Gate state:** NOT_STARTED · **Product-owner sign-off:** REQUIRED

## 1. Trading surface inventory (as built)

- **While gated (current behavior, verified in browser + smoke):**
  - Markets view shows the live gate-status strip (gate states, kill switch,
    env flag, block reasons) — honest "disabled pending review" state, never a
    hidden feature.
  - "Record as order intent" flow: real Jupiter quote → persisted
    ORDER_INTENT (`GATED_EXECUTION_DISABLED`) with expiry — a research record,
    not an execution.
  - `POST /api/v1/trading/execute` → `403 EXECUTION_GATED` with readiness
    payload (verified); no provider call before the gate check (code-verified).
  - Capabilities registry + sidebar footer compute `tradingExecution` from the
    governance system (GATED + reasons), not constants.
  - Admin console: gate cards, decision dialog with mandatory notes, kill
    switch engage/clear, EXECUTION PERMITTED/BLOCKED banner, decision history
    from the audit log. PLATFORM_ADMIN only.
- **Post-gate pipeline (implemented, unreachable until gates pass):**
  execute route → intent ownership/status/expiry checks → atomic claim →
  Jupiter `/execute` → RPC confirmation → honest CONFIRMED/UNCERTAIN/FAILED
  record + audit event.
- **Deliberately NOT built yet (awaiting gate outcomes):** jurisdiction
  geofencing, execution ToS acceptance, KYC vendor, execution rate limiting,
  transaction-content binding (F-3), `/order` live drill.

## 2. Product questions the product owner must answer before APPROVED

1. Scope: which pairs/markets at launch (any Solana pair via Jupiter? curated
   list? amount caps per intent/user/day)?
2. Positioning: does trading stay outside the research core (separate surface,
   opt-in) as the marketing copy promises ("research first — market execution
   third")?
3. UX states: confirm the UNCERTAIN-state experience (what the user sees while
   confirmation is pending) and the FAILED-state recovery flow.
4. Slippage/impact affordances: default slippage, max-impact guardrail, expiry
   countdown presentation.
5. Records: are order intents + swap records user-visible in a "Trading
   history" surface? (Currently only via API/markets view lists.)
6. Support runbook ownership for UNCERTAIN/FAILED outcomes.

## 3. Verified product hygiene

- Honest-state rule holds across the trading surface (no simulated success, no
  hidden availability, no fabricated data).
- Evidence separation: trust classifications are not for sale; trading is not
  entangled with research credibility surfaces.
- Mobile: gate-status strip + order-intent flow usable at 390px (verified in
  browser E2E, see delivery report).
- a11y: gate banner and state changes announced (aria-live), controls ≥44px on
  mobile.

## 4. HUMAN SIGN-OFF (product owner — do not self-sign)

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
