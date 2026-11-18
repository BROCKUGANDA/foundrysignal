# LEGAL_SIGNOFF_CHECKLIST — FoundrySignal public legal pages

**Purpose.** A reviewer-facing inventory of what the deployed product actually does, followed by
the items that cannot be answered from this repository. It is prepared *for* qualified counsel and
an authorised operator; it states no legal conclusion and claims no legal sufficiency. Only human
reviewers can close the items below.

**Scope of this review.** The two legal-adjacent public pages (`/terms`, `/security`) plus the
`/privacy`, `/legal` and `/security-disclosure` pages that cross-reference them.

---

## 1. What the product does

FoundrySignal is a research and information service for early-stage Solana ventures. It collects
public data server-side — public websites, approved GitHub REST API data, read-only Solana RPC
reads and Jupiter market context — stores each observation as an immutable snapshot with a SHA-256
content hash, and classifies it with a deterministic verification engine. Users browse a venture
directory, open per-venture dossiers, and run a grounded AI research analyst whose citations are
validated server-side against evidence actually collected for that workspace. It is not investment
advice, not a broker-dealer, exchange or custodian, and token trading execution is implemented but
held behind a release gate that is OFF (`403 EXECUTION_GATED`). The service is operated from Dubai,
United Arab Emirates, and is marketed to a global research audience.

## 2. Money flow (as built)

| Step | What happens | Code |
|---|---|---|
| 1 | Authenticated workspace ADMIN requests checkout for a plan code. | `src/app/api/v1/billing/checkout/route.ts` |
| 2 | Server creates a payment intent: destination = `PAYOUT_WALLET`, exact amount = plan price in USDC base units, memo = `FS-<last 12 chars of a UUID>`, TTL 30 minutes. Failure to configure the wallet returns `CONFIGURATION_REQUIRED` with the missing env name — no simulated payment state. | `src/lib/domain/billing/crypto.ts` (`createCheckoutIntent`) |
| 3 | Payer sends that exact USDC amount on Solana mainnet (mint defaults to `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`) from their own wallet, including the memo. Fees are the payer's. | client wallet |
| 4 | Verification reads the destination wallet's last 25 signatures, matches on memo, then re-reads the transaction (`jsonParsed`, `confirmed`) and requires the USDC token movement to the destination to be **≥ the intent amount**. A memo alone never grants entitlement. | `verifyCheckoutIntent`, `scanForPayment`, `usdcReceived` |
| 5 | On a match, a `Subscription` is upserted idempotently on the unique `(provider, providerRef=memo)` key: `status=ACTIVE`, `currentPeriodEnd = now + 30 days`. An audit record `CHECKOUT_CONFIRMED` is written with the signature. | `src/lib/domain/billing/crypto.ts` |
| 6 | Entitlements resolve from an `ACTIVE` subscription whose `currentPeriodEnd` is in the future or unset. | `src/lib/domain/billing/entitlements.ts` |
| 7 | **Expiry, not renewal.** After 30 days the subscription is no longer active and the workspace falls back to the free plan. There is **no recurring charge, no scheduler, no stored payment credential, no invoice and no receipt**. | `docs/MONETIZATION_AUDIT.md` §272 |

Plans (from the plan catalog, `monthlyPriceMicros` in USD micros): Explorer $0, Researcher $39,
Professional $99, Team $299, Enterprise quoted by sales (negative price ⇒ no self-serve checkout).
`cancelAtPeriodEnd` exists in the schema but no self-serve cancel route sets it — cancellation is
implicit because nothing auto-bills. **Refunds: no code path exists.** The published behaviour is
operator discretion on a written request to `support@foundrysignal.aiazimara.com`, repaid onchain in
USDC to the paying wallet. The operator must confirm that wallet can actually send (sign) USDC.

_(Correction: the stored fields are `planCode`, `amountBaseUnits`, `destination` (the operator's
wallet), `memo`, `expiresAt`, `status`, `providerRef` (transaction signature) and `confirmedAt`.
There is no payer-wallet column — the paying address is recoverable from the public transaction.)_

## 3. Data categories collected and retention

| Category | Content | Retention as implemented |
|---|---|---|
| Account | email (hashed for lookup), display name, bcrypt password hash, `status`, `deletedAt` | while the account exists; deletion sets `status=DELETED` + `deletedAt` |
| Sessions / audit | opaque session tokens stored hashed (7-day TTL), revocation timestamp, append-only audit events | rows persist after revocation; audit is the trail |
| Research | ventures registered, watchlists, saved searches, notes, research runs, reports | workspace-scoped; not cascaded by account soft delete |
| Public founder / venture data | publicly attributable profiles with source links, attribution confidence | immutable snapshots retained as research history; may be retained de-identified |
| Payment | paying wallet address, transaction signature, memo, plan, period end | persisted with the subscription/intent records |
| Logs | structured request/provider telemetry; excludes tokens, keys, wallet secrets, note bodies | operational retention |
| Cookies | session cookie (HttpOnly, SameSite=Lax), theme preference cookie `fs-theme` | session TTL / 1 year |

**No third-party analytics, advertising or tracking scripts or cookies are loaded** — verified by
searching `src/` and `package.json` for analytics vendors and by the absence of any `<Script>` tag
outside the inline theme bootstrap. Account deletion is a **soft delete**: it sets
`status=DELETED`, stamps `deletedAt` (`src/lib/auth/service.ts:229`) and revokes sessions; it does
not purge rows. The published privacy copy states exactly this and routes erasure requests to
`support@`.

## 4. Jurisdiction and entity

- Governing law asserted in `/terms`: **the laws of the United Arab Emirates as applied in the
  Emirate of Dubai**, exclusive jurisdiction of the Dubai courts, "except where mandatory local
  consumer-protection law provides otherwise".
- Geo signals (`src/lib/seo.ts`) declare Dubai / AE-DU as primary market; Organization JSON-LD
  carries `addressCountry: AE`, `addressLocality: Dubai`, `sameAs: https://aiazimara.com/`.
- **The legal entity name, registration number and registered address are NOT in the repository.**
  `src/lib/seo.ts:29` records the address block as operator-declared geo targeting, to be updated
  when entity registration completes. These must be supplied by the operator before sign-off; they
  were deliberately not invented, and no public page states them.
- Footer and `/about` state **"FoundrySignal is a working name pending professional name and
  trademark clearance."**

---

## 5. SIGN-OFF ITEMS REQUIRING OPERATOR INPUT

1. **Legal entity identity.** Exactly needed: legal name of the contracting entity, commercial
   registration / licence number, and full registered address (street, city, emirate/free zone,
   country). Needed to replace "the operator" throughout `/terms`, and to correct the JSON-LD
   `PostalAddress` and the footer "Dubai, United Arab Emirates" line, which currently name only a
   city and country.
2. **Tax / VAT stance.** Exactly needed: whether the entity is VAT-registered (UAE FTA TRN, 5%),
   whether digital services supplied to UAE consumers are taxable, whether the reverse-charge
   position for non-UAE business customers applies, and whether a tax invoice can be issued at all
   given that no invoice/receipt model exists in the schema. The public copy currently says only
   that taxes are the customer's responsibility and that no tax invoice is issued today.
3. **Refund policy decision.** Exactly needed: choose one — (a) none, discretionary only (current
   published position); (b) case-by-case inside a stated window (e.g. 14 days, as published today as
   the request window); (c) a statutory/withdrawal model for consumers in specific markets. The
   decision determines whether `/terms` "Refunds" can stand, and requires a documented operational
   process (who approves, from which wallet, within what time) because **no refund code exists**.
4. **DPA requirement for EU/UK customers.** Exactly needed: whether a Data Processing Agreement
   must be offered (and to whom — the platform is largely a controller of its own account/research
   data, so confirm the controller/processor analysis), plus the processor list to disclose
   (hosting/infra, Solana RPC provider, Helius if used, GitHub API, Jupiter, Resend for email, model
   provider for the AI analyst). No DPA text or processor list is published today.
5. **Uptime SLA for Team/Enterprise.** Exactly needed: decision on whether to offer one, and if so
   its target (e.g. 99.5% monthly), measurement window, service credits and exclusions. `/terms`
   currently states that the self-serve tiers carry **no** SLA and that an Enterprise order form
   could create one.
6. **Country availability / sanctions stance.** Exactly needed: the list of blocked or restricted
   countries, the OFAC/EU/UK/UAE screening stance for USDC payers, and whether an IP or attestation
   gate is required. **No geofencing, no sanctions screening and no KYC exist**
   (`docs/gate-reviews/LEGAL_JURISDICTION_REVIEW.md` §3 Q3/Q4). Onchain payments are irreversible
   and the payer is a wallet, not a verified person — counsel must say whether that is acceptable
   for a paid self-serve product before it is sold publicly.
7. **Trademark clearance for "FoundrySignal".** Exactly needed: search/clearance result and filing
   decision (jurisdiction, classes 9/35/42), or an explicit decision to keep operating under a
   working name with the current disclosure retained in the footer and `/about`.

---

## 6. LAWYER REVIEW FOCUS

1. **Consumer-terms enforceability.** UAE Federal Decree-Law No. 15/2020 (Consumer Protection) and
   its e-commerce rules, plus the consumer-law carve-out already written into the governing-law
   clause. Are clickwrap (no separate acceptance record is stored — accounts are created through
   `/auth`, and no `termsAcceptedAt` field exists) and the "as is" / liability-cap combination
   enforceable against consumers in the UAE and in the EU/UK?
2. **No-auto-renewal clarity.** The copy now says, explicitly and repeatedly, that nothing
   auto-bills, there is no stored payment method, and expiry returns the workspace to the free plan.
   Confirm nothing in the marketing or billing surfaces implies a subscription that renews, and
   confirm the wording satisfies disclosure rules for negative-option/recurring billing regimes
   where such rules could be argued to apply.
3. **Refund / withdrawal rights in target markets.** The published default is no refund with a
   discretionary exception. EU/UK consumers may hold statutory withdrawal rights for digital
   services where supply has begun; confirm whether a withdrawal notice, waiver-on-immediate-access
   or cooling-off text is required, and in which markets the discretionary model is defensible.
4. **Liability cap and carve-outs.** The cap is "fees paid in the twelve months preceding the
   event", with carve-outs for fraud, gross negligence and willful misconduct and for
   non-limitable liability. Confirm whether the cap survives consumer-protection scrutiny, whether
   it should exclude the free tier ("fees paid" = $0), and whether a super-cap is needed for data
   protection breaches.
5. **Arbitration / governing law.** Exclusive Dubai court jurisdiction with a mandatory-local-law
   carve-out. Confirm enforceability against consumers and small businesses abroad, whether
   arbitration would be preferable, and the language/notice requirements for dispute resolution.
6. **Crypto-payment regulatory posture.** USDC is used as a payment instrument, not held in
   custody: the platform takes no client funds, holds no signing material and grants entitlement
   only after verifying an onchain transfer. Confirm that receiving USDC for a research
   subscription is not a regulated activity for the entity (VARA / DFSA / ADGM as applicable), and
   that the marketing copy "not a custodian, exchange or broker-dealer" is accurate.
7. **Data protection.** No GDPR/UK-GDPR-specific text is published: no stated lawful basis, no
   controller identity (blocked on item 5.1), no international-transfer mechanism, no processor
   list, no DSR timelines beyond "write to support@". Confirm lawful-basis mapping (contract for
   account data, legitimate interests for research/logs), the transfer position for
   non-UAE infrastructure, and the retention justification for immutable snapshots containing
   personal data about founders.
8. **Accessibility statement gap.** No accessibility statement or conformance claim (e.g. WCAG 2.2
   AA) is published anywhere. If the service is offered to EU consumers, the European Accessibility
   Act may apply by 2025-06-28 for in-scope e-commerce; confirm scope and, if in scope, what
   statement and conformance level are required. This needs a copy addition **and** an audit — not
   copy alone.
9. **Cookie / tracking disclosure.** Current state: no consent banner, no analytics. Only the
   session cookie and the `fs-theme` preference cookie exist, and privacy copy discloses both. If
   analytics is added later, an EU/UK consent mechanism and cookie table become necessary; confirm
   whether the theme cookie alone needs consent in any target market.
10. **Payment-intent failure modes.** The published copy states the 30-minute intent TTL and that a
    late transfer grants no entitlement. Confirm the civil position on a payment sent after expiry
    or without the memo (no automatic refund path exists) and whether the copy should point to a
    refund request in that case.

---

## 7. Out of scope for this copy pass (needs engineering, not wording)

- A terms-acceptance record (`termsAcceptedAt`) and a re-acceptance flow on material change.
- Refund execution: no code path can send USDC back today; a manual, documented procedure is
  required before any refund is promised.
- Invoice / receipt generation (no `Invoice` model; `docs/MONETIZATION_AUDIT.md` §211).
- Jurisdiction geofencing and sanctions screening.
- A billing watcher: entitlement is granted only when the payer's session calls verify, so a paid
  transfer can sit unclaimed if the tab closes (`docs/MONETIZATION_AUDIT.md` §272).
- Stock Stripe paths (`src/lib/domain/billing/stripe.ts`, `/api/v1/billing/portal`, `/webhook`)
  remain in the tree. Not exercised by USDC checkout, but counsel should confirm the portal route
  cannot be reached in production; the gate review assumes offchain payment is not enabled.
