# LEGAL_FIX_REPORT — copy pass on /terms, /security, /privacy, /legal

**Date:** 2026-11-17 · **Scope:** public legal-adjacent copy only. No billing code, middleware,
rate limits, seeds, `.env` or marketing layout was modified. No legal validity is claimed anywhere.

## Files changed

| File | Change |
|---|---|
| `src/components/fs/marketing/page.tsx` | Rewrote the `privacy`, `security-disclosure`, `legal-terms` and `security` DOC_BLOCKS; added one block to `legal`; added `LEGAL_LAST_UPDATED` / `SUPPORT_EMAIL` / `DocBlock`; passed `updated` to every legal `DocSection`. |
| `src/components/fs/marketing/content.tsx` | `DocSection` takes an optional `updated?: string` and renders `Last updated: {date}` under the lede. Layout unchanged otherwise. |
| `docs/LEGAL_SIGNOFF_CHECKLIST.md` | New reviewer-facing checklist (product facts, money flow, data, jurisdiction, operator-input items, lawyer focus, engineering gaps). |

## What the old copy got wrong (fixed)

1. **Terms said renewal "unless renewal is offered and enabled at checkout."** The code has no
   recurring charge at all (`docs/MONETIZATION_AUDIT.md` §272) and no renewal path. Replaced with an
   explicit no-auto-renewal section plus a separate "Cancelling future periods" section.
2. **Terms had no payment mechanics.** Added the actual flow: intent → `PAYOUT_WALLET` + exact USDC
   amount + `FS-…` memo → onchain verification requires memo match *and* ≥ amount → idempotent grant
   → 30 days → expiry. Also documents the 30-minute intent TTL and that a late transfer grants
   nothing.
3. **No prices, no price-change policy, no tax clause, no availability disclaimer.** Added all four;
   prices are the catalog values ($39/$99/$299 per 30-day period).
4. **No termination path, no data-deletion contact.** Added Settings → Danger zone → Delete account
   (verified: `src/components/fs/settings-view.tsx:753`, soft delete at
   `src/lib/auth/service.ts:229`) and `support@` as the deletion contact.
5. **Refunds were vague ("at operator's discretion").** Now states the actual behaviour: no
   self-service refund process, no refund code path, onchain repayment only from the operator's
   wallet, 14-day request window, request by email with the transaction signature.
6. **"Trust classifications are never for sale"** was only in the README. Now a named Terms section.
7. **/security never said what it does not hold.** Added "What we do not hold" (no SOC 2 / ISO
   27001 / equivalent, best-effort posture, not an audit opinion) and a "Payments and custody"
   section (no custody, no stored payment credential).
8. **Privacy retention overstated deletion.** Copy now says plainly that account deletion is a soft
   delete, does not purge workspace objects, and that audit/evidence snapshots persist as the audit
   trail. Also added payment-data, no-third-party-analytics and retention blocks.
9. **No sibling links inside page bodies.** Terms now links /privacy, /security, /security-disclosure;
   security, privacy, security-disclosure and legal each link their siblings.
10. **No "Last updated" line.** `Last updated: 2026-11-17` now renders on /terms, /security,
    /privacy, /legal and /security-disclosure.

## Distinctive phrases added (greppable)

- `Last updated: 2026-11-17`
- `No automatic renewal` / `does not auto-bill`
- `The platform holds no customer funds and never custodies assets`
- `No SOC 2, ISO 27001 or other certification is held`
- `No self-service refund process exists`
- `Classifications are never for sale`
- `No third-party analytics or tracking`
- `Retention and deletion`
- `agreed in writing for an Enterprise order`

## Verification

```
bun x tsc --noEmit   → exit 0 (clean)
bun run build        → green: "[copy-build-assets] static + public -> .next/standalone"
```

Server `bun .next/standalone/server.js` on :3000, then:

| URL | Status | Bytes |
|---|---|---|
| `/terms` | 200 | 67,522 |
| `/security` | 200 | 52,407 |
| `/privacy` | 200 | 47,640 |
| `/legal` | 200 | 44,112 |
| `/security-disclosure` | 200 | 46,914 |

Phrase greps against the served HTML:

- `Last updated: 2026-11-17` — all five pages (1 match each).
- `/terms`: `No automatic renewal`, `No self-service refund process exists`,
  `Classifications are never for sale`, `Danger zone`, `The self-serve plans carry no uptime`.
- `/security`: `The platform holds no customer funds`, `SOC 2, ISO 27001 or equivalent
  certification`, `within two business days`, `within five business days`, `platform app and its API`.
- `/privacy`: `No third-party analytics or tracking`, `Retention and deletion`.
- `/legal`: `Related documents`.
- `/security-disclosure`: `ISO 27001 or other certification is held, and none is claimed`.
- Every legal page body renders real sibling anchors for `/terms`, `/privacy`, `/security`,
  `/security-disclosure` and `/legal` (`<nav aria-label="Related legal documents">`).

## Outstanding operator input (blocks sign-off)

See `docs/LEGAL_SIGNOFF_CHECKLIST.md` §5: legal entity name / registration number / registered
address, VAT-TRN stance, refund-policy decision, DPA + processor list for EU/UK, uptime-SLA decision
for Team/Enterprise, country and sanctions stance for USDC payers, and trademark clearance for
"FoundrySignal". None of these were invented, and no public page asserts an entity, certification or
refund right beyond what the code implements.
