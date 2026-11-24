# COMMERCIALIZATION_LEGAL_PACK — operator & counsel work pack

**Purpose.** Turn the existing review evidence into a single, actionable pack for the
operator and qualified counsel before FoundrySignal is offered for public paid use.
This pack states **no legal conclusion**, claims **no legal sufficiency**, and invents
**no** entity name, registration number, VAT/TRN, audit result, processor contract,
or conformance claim. Where the repository does not contain a fact, the cell reads
`UNKNOWN` / `OPERATOR INPUT REQUIRED`.

**Source of truth.** All substantive findings come from:
`docs/LEGAL_SIGNOFF_CHECKLIST.md` (the checklist), `docs/KNOWN_LIMITATIONS.md`,
`README.md`, `docs/gate-reviews/README.md`, and the public page copy in
`src/components/fs/marketing/page.tsx`. This pack **points to** those documents;
it does not replace them. Only a human operator and licensed counsel can close an
item. All items below are `OPEN` as of this writing.

**Legal pages in scope:** `/terms`, `/security`, `/privacy`, `/legal`,
`/security-disclosure` (copy last marked updated `2026-11-17`).

---

## 1. Decision table — the 7 open sign-off items

Restatement of checklist §5 ("SIGN-OFF ITEMS REQUIRING OPERATOR INPUT"). The
"options" are the decision space; the "recommendation" is an operational next step,
**not** a legal opinion.

| # | Item | What is known from the code today | Options | Recommendation (operational) | Owner | Status |
|---|------|-----------------------------------|---------|------------------------------|-------|--------|
| 1 | **Legal entity identity** | `/terms` asserts UAE law as applied in Dubai; JSON-LD sets `addressCountry: AE`, `addressLocality: Dubai`, `sameAs: https://aiazimara.com/`. Footer and `/about` say "FoundrySignal is a working name pending professional name and trademark clearance." The legal entity name, commercial registration/licence number and full registered address are **NOT in the repo** (`src/lib/seo.ts:29` marks the address block as operator-declared geo targeting, to be updated when registration completes). No public page states them — `/terms` uses "the operator"; footer names only a city and country. | (a) Supply exact entity details and replace "the operator" in `/terms`, correct JSON-LD `PostalAddress` and footer line; (b) keep placeholders and defer public paid launch. | Supply legal name, registration/licence number, street/city/emirate/country before launch; counsel to confirm exact disclosure wording. Do not invent values. `OPERATOR INPUT REQUIRED`. | Operator (entity data) + counsel (wording) | **OPEN** |
| 2 | **Tax / VAT stance** | `/terms` says taxes/duties/withholdings are the customer's responsibility, the operator does not collect/withhold/remit tax, and **no tax invoice is issued today**; ask at `support@` for a transaction record. No `Invoice` model exists in the schema; no invoice/receipt generation (`docs/MONETIZATION_AUDIT.md` §211). Whether UAE digital services to UAE consumers are taxable, whether reverse charge applies to non-UAE business customers, and any TRN are **NOT in the repo**. | (a) No VAT registration / no invoices as today; (b) register for UAE VAT 5% and issue tax invoices (requires new code + process); (c) confirm reverse-charge treatment for non-UAE B2B. | Operator to confirm FTA registration status and whether invoices are legally required; tax advisor/counsel to confirm treatment. Any TRN = `OPERATOR INPUT REQUIRED`. | Operator + tax advisor / counsel | **OPEN** |
| 3 | **Refund policy decision** | **No refund code path exists.** Published behaviour: fees non-refundable by default; discretionary refund on written request to `support@foundrysignal.aiazimara.com` within **14 days**, repaid onchain in USDC to the paying wallet, entitlement possibly ended. The operator must confirm the payout wallet can actually send (sign) USDC. No stored payer-wallet field — the paying address is recoverable from the public transaction. | (a) None / discretionary only (current published position); (b) case-by-case inside a stated window (14 days is already published); (c) statutory/withdrawal model for consumers in specific markets. | Choose one and document a manual procedure (approver, source wallet with signing authority, time window). No refund can be promised in code until that process exists. Counsel to confirm EU/UK withdrawal rights. | Operator (policy/process) + counsel (consumer rights) | **OPEN** |
| 4 | **DPA requirement for EU/UK customers** | No DPA text and no processor list are published. `/privacy` states no third-party analytics/tracking; only session cookie + `fs-theme`; account deletion is a soft delete. No stated lawful basis, controller identity (blocked on item 1), international-transfer mechanism, or DSR timelines beyond "write to support@". Platform is largely a controller of its own account/research data. | (a) Controller-only posture, no DPA offered; (b) offer a DPA to EU/UK customers; (c) publish processor list + transfer mechanism regardless. | Counsel to confirm the controller/processor analysis and whether a DPA must be offered; operator to supply processor legal names, regions and contract status (see §3). | Counsel + operator | **OPEN** |
| 5 | **Uptime SLA for Team/Enterprise** | `/terms` states self-serve plans carry **no** uptime, latency or support-response SLA, service is best-effort, and any uptime commitment would require a written Enterprise order. No SLA monitoring/credits are implemented. | (a) No SLA for any tier (current); (b) defined SLA for Team/Enterprise: target, measurement window, credits, exclusions. | Keep "no self-serve SLA"; decide any Enterprise SLA per written order form and do not promise beyond measured capability. Counsel to review wording. | Product/operator + counsel | **OPEN** |
| 6 | **Country availability / sanctions stance** | **No geofencing, no sanctions screening and no KYC exist** (checklist §5.6; gate review `LEGAL_JURISDICTION_REVIEW.md` §3 Q3/Q4). USDC payers are wallet addresses, not verified persons; onchain payments are irreversible. `/terms` places sanctions/export-control compliance on the user under "lawful use", but no technical control backs it. | (a) Global availability, no screening, enhanced disclosures; (b) blocked-country list + IP gate; (c) user attestation gate; (d) screening/KYC vendor. | Counsel must decide whether wallet-only, unscreened, irreversible payment is acceptable before paid public launch. See §4 brief. No compliance claim in any option. | Counsel + operator | **OPEN** |
| 7 | **Trademark clearance for "FoundrySignal"** | README, footer and `/about` state "working name pending professional name and trademark clearance." No search/clearance result or filing decision is in the repo. | (a) Run clearance and file (classes 9/35/42 per checklist); (b) keep operating under the working name with the existing footer/`/about` disclosure retained. | Operator to obtain clearance decision; until cleared, retain the working-name disclosure. No filing or result may be asserted. `OPERATOR INPUT REQUIRED`. | Operator + trademark counsel | **OPEN** |

**Engineering status (checklist §7, for awareness, not sign-off items):**
`termsAcceptedAt` + `termsVersion` are now recorded for credential registrations,
but OAuth-created accounts still have no consent step; a checkout watcher now
settles pending intents server-side, but an intent paid after expiry still needs
operator discretion. Still absent: refund execution code, an invoice/receipt model,
geofencing/screening, and a re-acceptance flow on material terms changes. Stock
Stripe paths remain in the tree — counsel should confirm the
`/api/v1/billing/portal` route cannot be reached in production.

---

## 2. Counsel brief (concise; refer to the checklist for detail)

**Scope.** A research and information service for early-stage Solana ventures: public
data (websites, GitHub REST API, read-only Solana RPC, Jupiter market context) is
collected server-side, stored as immutable SHA-256-hashed snapshots, classified by a
deterministic engine, and summarised by a grounded AI analyst with server-validated
citations. It is stated to be **not** investment advice, broker-dealer, exchange,
custodian or launchpad. Trading execution exists in code but is held behind four
human release gates and a kill switch; the execute route returns `403
EXECUTION_GATED` until all gates are approved and the kill switch is clear.
`TRADING_ENABLED=true` is armed by explicit operator decision
(`docs/OPERATIONS_READINESS.md` §7) but grants no capability on its own. Operated
from Dubai, UAE, for a global research audience.

**Money flow (as built).** Workspace ADMIN requests checkout → server creates an intent
(destination `PAYOUT_WALLET`, exact USDC amount, memo `FS-<uuid tail>`, 30-minute TTL)
→ payer sends exact USDC on Solana mainnet with memo → server verifies destination +
memo + amount ≥ intent → idempotent 30-day `Subscription`. **No auto-renewal, no
stored payment credential, no invoice, no receipt, no refund code.** Plans: Explorer
$0, Researcher $39, Professional $99, Team $299, Enterprise quoted.
Full step table: checklist §2.

**Data categories.** Account (email hashed for lookup, display name, bcrypt hash,
status, `deletedAt`); sessions/audit (hashed opaque tokens, 7-day TTL, append-only
events); research (ventures, watchlists, notes, runs, reports); public founder/venture
data (immutable snapshots); payment (paying wallet address, signature, memo, plan,
period end); logs (no tokens/keys/wallet secrets/note bodies); cookies (session +
`fs-theme`). No third-party analytics/advertising/tracking. Account deletion is a
**soft delete**, not a purge. Full table: checklist §3; public copy: `/privacy`.

**Jurisdiction.** `/terms` asserts UAE law as applied in the Emirate of Dubai, exclusive
Dubai courts, with a carve-out where mandatory local consumer-protection law provides
otherwise. Geo signals declare Dubai / AE-DU primary market. **Entity identity UNKNOWN**
— see decision item 1. Full detail: checklist §4.

**Questions to answer.** Do **not** re-derive these here — work directly from
checklist §5 (the 7 items in §1 above) and checklist §6 ("LAWYER REVIEW FOCUS", 10
items: consumer-terms enforceability; no-auto-renewal clarity; refund/withdrawal
rights; liability cap and carve-outs; arbitration/governing law; crypto-payment
regulatory posture; data protection; accessibility statement gap; cookie/tracking
disclosure; payment-intent failure modes). Additional focus for this pack: §3
processor/DPA completeness, §4 sanctions posture, §5 accessibility scope.

---

## 3. Processor list disclosure table (draft — for counsel/operator completion)

**Status: DRAFT / NOT PUBLISHABLE AS-IS.** Every `Location` and `DPA status` cell is
`UNKNOWN` because the repository does not record processor legal entities, processing
regions, or executed DPAs. Do not publish this table as an accurate disclosure until
every cell is replaced with verified facts. "Data" describes what the repo shows is
sent to or stored by the processor; it is not a legal data-classification conclusion.

| Processor | Purpose (from code/docs) | Data (from code/docs) | Location | DPA status |
|-----------|--------------------------|-----------------------|----------|------------|
| Hosting / infrastructure | Serves the Next.js app, PostgreSQL 18 database, DB-backed queue and worker loop; stores account, research, evidence snapshots, audit and subscription records. Public copy says "dedicated infrastructure" but names no provider. | All stored categories: account, session/audit, research, immutable evidence snapshots, payment/subscription records, logs. | `UNKNOWN` — no named host or region in repo | `UNKNOWN / OPERATOR INPUT REQUIRED` |
| Solana RPC | Read-only onchain reads via `@solana/kit` (mint, metadata, authorities, token accounts, bounded tx history) and payment-intent verification reads. Default `SOLANA_RPC_URL = https://api.mainnet-beta.solana.com`. | Public onchain addresses, signatures, mint/authority/metadata, transaction history. No private keys. | `UNKNOWN` — endpoint default is public mainnet; legal entity/region not stated | `UNKNOWN / OPERATOR INPUT REQUIRED` (public RPC; confirm whether any DPA exists) |
| Helius (indexed provider) | Extended throughput and enhanced indexed Solana APIs. `HELIUS_API_KEY` is set in production (`KNOWN_LIMITATIONS.md` §7); the integration doc marks it unavailable in sandbox. | Same onchain reads plus API key; no user secrets. | `UNKNOWN` | `UNKNOWN / OPERATOR INPUT REQUIRED` |
| GitHub (REST API v3) | Repository/organisation/contributor collection, commit/release/language snapshots, signature-verified webhook reconciliation. Personal access token provisioned for this deployment. | Public repo/org/contributor data, account identifiers, PAT; no private user data collected. | `UNKNOWN` — no region in repo | `UNKNOWN / OPERATOR INPUT REQUIRED` |
| Jupiter | Market snapshots (Price API V3) and quote previews. `/order` + `/execute` adapter code exists but is behind the OFF trading gate. | Market/quote parameters. No personal data identified in repo docs. | `UNKNOWN` | `UNKNOWN / OPERATOR INPUT REQUIRED` |
| Resend / email | Verification and password-reset token delivery via `RESEND_API_KEY`. Without the key the UI says `EMAIL_NOT_CONFIGURED` (never simulates sends). | Email addresses and token-bearing delivery links. | `UNKNOWN` | `UNKNOWN / OPERATOR INPUT REQUIRED` |
| AI model provider | `z-ai-web-dev-sdk` (server-only) chat completions power the grounded research analyst; retrieval is evidence-grounded with citation validation and injection stripping; model cost/failure logged per run. Underlying model vendor is **not named** in the repo. | Research query text and collected evidence supplied as prompt context; run cost/failure metadata. No signing material. | `UNKNOWN` | `UNKNOWN / OPERATOR INPUT REQUIRED` (confirm vendor identity first) |

Operator must supply, per row: legal entity name, processing country/region, whether a
DPA is executed, transfer mechanism, and sub-processor notice path. Counsel then
decides controller/processor characterisation and disclosure wording (decision item 4).

---

## 4. Sanctions / geofencing posture decision brief

**Current state — stated explicitly, no ambiguity:**
- **No geofencing, no sanctions screening and no KYC exist anywhere in the product.**
  Source: checklist §5.6 and gate review `docs/gate-reviews/LEGAL_JURISDICTION_REVIEW.md`
  §3 Q3/Q4. The corresponding review gate remains **NOT_STARTED**; no licensed counsel
  has signed it (`docs/gate-reviews/README.md`).
- **USDC payers are wallets, not verified persons.** The checkout stores no payer-wallet
  column; the paying address is recoverable from the public transaction. There is no
  identity, nationality, residence or sanctions-list check at any point.
- **Onchain payment is irreversible.** There is no refund execution code and no
  screening-after-the-fact remedy: a transfer already confirmed cannot be unsent.
- The only control is **contractual**: `/terms` "lawful use" asks the user to comply with
  applicable law, including sanctions and export-control laws; "acceptable use"
  prohibits using the service to violate securities, sanctions or anti-fraud laws.
  There is no technical enforcement of either clause.
- The service is marketed to a global research audience while declaring UAE/Dubai as
  the primary market (`src/lib/seo.ts`).

**Decision required before public paid launch** — counsel to choose and document one
posture, with an explicit record of residual risk:

| Option | What it means | Constraint to record |
|--------|---------------|----------------------|
| A — No screening, global availability | Rely on contractual user undertakings only; enhanced disclosure. | Wallet-only, unscreened, irreversible payments accepted; no compliance claim. |
| B — Blocked-country / IP gate | Deny checkout/access from listed jurisdictions. | Blocked-country list = `OPERATOR INPUT REQUIRED`; IP geolocation is not a person check and is bypassable. |
| C — Attestation gate | Require a user attestation before checkout. | Attestation is self-declared, not verification. |
| D — Screening/KYC vendor | Third-party wallet/address screening before entitlement. | New processor, new data flow, new cost; no such integration exists today. |

**Questions counsel must answer:** Is wallet-only, unscreened, irreversible USDC payment
acceptable for a publicly sold self-serve research product from a UAE/Dubai entity?
Which markets, if any, must be excluded? Is an IP or attestation gate required, and if
so does it create privacy/consent obligations? Does the answer change for Enterprise
or API distribution? Any answer must be written into the record — **no compliance claim
may be added to public copy without it.**

---

## 5. Accessibility audit plan

**Current state.** A public `/accessibility` page now states what is implemented,
the known gaps and the audit plan, and explicitly makes **no conformance claim**.
No independent WCAG 2.2 AA audit has been performed; no result is asserted here.
The checklist (§6.8) notes the European Accessibility Act may apply by 2025-06-28
for in-scope e-commerce and that counsel must confirm scope; it also states this
needs **a copy addition and an audit — not copy alone**. The copy addition exists;
the audit does not.

**Scope to test (WCAG 2.2 AA target).**
- Public/marketing and legal pages (server-rendered RSC): `/`, `/product`,
  `/methodology`, `/evidence`, `/ecosystem`, `/api-docs`, `/pricing`, `/about`,
  `/contact`, `/faq`, `/legal`, `/privacy`, `/terms`, `/security`,
  `/security-disclosure`, `/accessibility`. Prioritise `/pricing` (plan grid, "most chosen" badge, CTA
  links) and the legal document pages (`DocSection` headings + sibling link nav).
- Authenticated flows (higher priority where money moves): sign-in/auth (OAuth
  buttons, MFA enrollment/challenge), `/settings` checkout panel (destination wallet,
  exact amount, memo copy, verify loop, EXPIRED/CONFIRMED states), `/research`,
  `/admin`.
- Both light and dark themes (`fs-theme` cookie), and desktop + mobile breakpoints.

**Checks to run.**
- **Keyboard:** logical focus order, visible focus indicator, no focus traps, functional
  skip-to-content target (`<main id="fs-main">`), operable nav and mobile menu, all
  controls reachable and actionable without a pointer.
- **Screen reader:** semantic headings and landmarks, correct names/roles for buttons
  and links, form labels and error announcements, meaningful link text, `aria-hidden`
  used only on decorative elements (e.g. the pricing feature dots).
- **Contrast:** text and UI components against both themes — body/ink tokens, muted
  text, accent foreground, badges, alerts (`role="alert"`), disabled states, focus
  rings, and small "2xs" text; verify AA contrast ratios.
- **Mobile/reflow:** 320px width and 400% zoom without loss of content or function,
  touch-target sizing, no horizontal scrolling of core content, responsive grid
  behaviour at `sm`/`md`/`xl`.
- **Motion:** reduced-motion preference (design system notes a static frame under
  reduced motion); no flashing or auto-refresh that traps attention.

**Who signs off.** A qualified human accessibility auditor/tester performs the audit
and records findings; the operator accepts the residual issues and owns remediation;
counsel confirms legal scope and the published statement wording. No machine pass in
this repository constitutes an audit result.

**What can be published — today vs after audit.**
- **Today:** **no conformance claim of any kind.** The only publishable wording is a
  factual, non-conformance statement — e.g. "We aim to make FoundrySignal accessible;
  no formal WCAG conformance audit has been completed and no conformance level is
  claimed. Report accessibility barriers to `support@foundrysignal.aiazimara.com`."
  This still requires counsel review and a copy addition; it is **not** currently on
  the site. Do not write "WCAG 2.2 AA compliant/accessible."
- **After a completed audit:** publish only the conformance level the audit actually
  verified (e.g. "conforms to WCAG 2.2 AA", "partially conforms", or "does not
  conform") with the tested scope, date, known exceptions and a remediation contact.
  If the audit finds gaps, publish partial/non-conformance — never upgrade the claim
  without evidence. `AUDIT RESULT: UNKNOWN / OPERATOR INPUT REQUIRED`.

---

## 6. What an operator must supply before public launch

- [ ] Contracting legal entity: legal name, commercial registration/licence number, full registered address (street, city, emirate/free zone, country). `OPERATOR INPUT REQUIRED` (item 1).
- [ ] Tax position: VAT registration status/TRN (if any), treatment of UAE digital services and non-UAE B2B/reverse charge, and whether tax invoices can be issued. `OPERATOR INPUT REQUIRED` (item 2).
- [ ] Final refund policy + documented manual process: approver, source wallet with signing authority, time window, and confirmation the payout wallet can send USDC (no refund code exists) (item 3).
- [ ] Processor list completed: legal names, processing regions, DPA status, transfer mechanism, sub-processor notice path for all seven rows in §3. All currently `UNKNOWN`.
- [ ] Sanctions/geofencing decision and counsel sign-off, including the residual-risk record in §4.
- [ ] Accessibility scope decision, completed audit, and approved statement wording (§5). No conformance claim without audit evidence.
- [ ] Trademark clearance decision, or explicit retention of the working-name disclosure in footer and `/about` (item 7).
- [ ] Entity updates applied consistently: `/terms` "the operator" text, JSON-LD `PostalAddress`, footer line (item 1).
- [ ] Confirm the public mailboxes printed in copy (`support@`, `security@`, `product@`, `enterprise@foundrysignal.aiazimara.com`) are live and monitored. `OPERATOR INPUT REQUIRED`.
- [ ] Confirm `PAYOUT_WALLET` is configured and billing state is visible to paying customers (checkout surfaces `CONFIGURATION_REQUIRED` otherwise; see `docs/MONETIZATION_AUDIT.md`).
- [ ] Counsel sign-off recorded against checklist §5 (7 items) and §6 (10 review-focus items). No gate is approved by this pack; all remain `OPEN`.

---

**End of pack.** No application code was modified; no tests were run; no legal, tax,
audit or conformance conclusion is made. Close items only with signed human decisions.
