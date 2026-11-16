# LEGAL_JURISDICTION_REVIEW — brief for qualified counsel (UAE/Dubai primary market)

**Gate state:** NOT_STARTED · **Counsel sign-off:** REQUIRED — this document is a
brief prepared for licensed legal review; it is not legal advice and contains no
legal conclusions. No compliance claim is made or implied anywhere in this
platform.

## 1. What the operator asks counsel to decide

Whether enabling **swap execution** (client-signed Jupiter Swap API V2
transactions relayed by this platform) for the operating entity —
geo-targeted UAE (Dubai), serving a global research audience — falls inside or
outside the entity's regulatory perimeter, and under which conditions
(restrictions, disclosures, geofencing, KYC thresholds) execution may be
enabled.

## 2. Platform facts relevant to the review (as built — verify in the code)

- The platform is a **research and information service**: evidence-graded
  venture dossiers, founder/repository/onchain intelligence, quote previews.
- **No custody**: the platform never holds signing material; transactions are
  signed client-side in the user's own wallet; the platform relays an
  already-signed transaction to Jupiter's `/execute` and records the outcome.
- **No brokerage or matching**: the platform does not route to specific
  counterparties for compensation, holds no client funds, and charges no
  commission on swaps.
- **Trading is OFF**: four-gate governance (this gate is one of them), an
  execution kill switch (ENGAGED), and an operator env flag (`TRADING_ENABLED`)
  must all align before the execute route does anything (verified:
  `403 EXECUTION_GATED` otherwise).
- **Paid subscriptions** (Stripe) sell research capability (dossiers, AI
  research runs, API metering) — not classifications, placement or
  trading features.
- Marketing/legal copy repeatedly states: research information only, not
  investment advice, not a broker-dealer/exchange/custodian/launchpad.
- Geo signals on the site declare UAE/Dubai targeting; there is **no user
  jurisdiction gating** implemented yet (see §4).

## 3. Topics counsel must assess (questionnaire)

1. **Regulatory perimeter**: under UAE federal law and the applicable free-zone
   regimes (e.g. VARA for Dubai's VASP activities, DFSA/ADGM for financial
   free zones as applicable): does relaying client-signed swap transactions
   constitute a regulated activity (broker-dealer, exchange operation, VA
   dealing/arranging) for the operating entity? Which entity/license structure
   is assumed?
2. **Information-services boundary**: are the paid research features
   (dossiers, AI research, API) clearly outside financial-advice /
   arrangement activities? Is the "research information only" disclaimer
   adequate as implemented?
3. **User jurisdiction gating**: which user geographies must be blocked or
   conditioned for swap execution? (Currently NO geofencing exists —
   implementing it is a post-approval engineering item, see §4.)
4. **KYC/AML**: does the assumed activity trigger AML/KYC obligations
   (onboarding, sanctions screening, transaction monitoring)? None is
   implemented; the platform only has email/password accounts.
5. **Marketing/financial-promotion rules**: which disclosures are required on
   swap surfaces, quote previews and research reports?
6. **Consumer protection**: quote-expiry/slippage disclosures, UNCERTAIN
   execution states, dispute handling for failed/uncertain swaps.
7. **Data protection**: UAE PDPL (+ GDPR for EU users) alignment of the
   privacy documentation already published.
8. **Sanctions exposure**: provider and chain interactions requiring screening.

## 4. Engineering items that depend on this gate's outcome

- Jurisdiction geofencing (IP-based allow/deny + user attestation) — to be
  specified by counsel's answer to Q3/Q5 before implementation.
- Terms-of-service acceptance flow specific to execution (currently absent).
- KYC vendor integration if counsel requires it (capability registry has an
  explicit NOT_CONFIGURED slot).
- Any additional disclosures on the markets/trading surfaces.

## 5. Disclosure inventory (current, all live in the product)

- Footer + Legal page: "Research information only — not investment advice";
  trading disabled pending review; no token launchpad.
- Pricing page: purchasing-availability note; paid research services and
  trading features require independent legal review gates.
- Capabilities registry: `tradingExecution` reports GATED with the real
  block reasons; billing reports NOT_CONFIGURED with required env names.
- Markets view: live gate-status strip; "Record as order intent" flow only.
- Quote previews: asOf timestamps, expiry, "research preview only" note.

## 6. HUMAN SIGN-OFF (licensed counsel only — do not self-sign)

```
Counsel name/firm:  ______________________
License/jurisdiction: ____________________
Review date:        ______________________
Decision:           APPROVED (with conditions: ____) / REJECTED / NOT READY
Conditions:         ______________________
Notes:              ______________________
Signature/ref:      ______________________
```

Record the decision via `PATCH /api/v1/admin/trading-gates` (audited) only after signing.
