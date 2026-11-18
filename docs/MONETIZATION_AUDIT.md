# FoundrySignal — Monetization Audit

Audit date: 2026-11-17
Scope: `D:/AI AZIMARA(AAA)/FoundrySignal` (read-only audit; no files other than this document were created or modified)
Method: full read of `package.json`, `src/lib/**`, `src/app/api/**`, `tests/crypto-checkout.test.ts`, `prisma/schema.prisma`, `docs/PROVIDER_INTEGRATIONS.md`, `docs/ACCEPTANCE_CRITERIA.md`, keyword sweep of `src/`, `.env` key-name inspection, plus SQLite inspection of the committed databases (`db/custom.db`, `prisma/db/custom.db`, `test-fs.db`).

---

## 1. Executive summary

**Can it earn money today? NO.**

One line why: the only path to revenue is USDC-on-Solana checkout, and the single variable it requires (`PAYOUT_WALLET`) is absent from `.env`, so every payment surface returns `CONFIGURATION_REQUIRED` and refuses to start — while the paid tiers that would be sold (`researchRunsPerMonth`, `apiAccess`, `reportExport`, `seats`, …) are stored as JSON but enforced nowhere in the codebase.

Confidence detail: the USDC code path is genuinely written (not a stub), it is config-gated rather than faked, and once one env var is set it can take real money. But **as deployed right now it cannot take a real payment of any kind** — no card, no wallet-connect payment, no credits, no invoice, no marketplace listing, no "contact sales" checkout. The only remaining alternatives are Stripe (code exists but is **unreachable** — see §4.2) or manually invoicing a customer off-platform.

---

## 2. What exists (every relevant piece, file:line)

### 2.1 Dependencies (`package.json`)

| Package | Version | Declared | Used for | Real? |
| --- | --- | --- | --- | --- |
| `@solana/kit` | `^8.6.0` (installed 8.6.0) | package.json:57 | Solana RPC reads + USDC checkout chain verification | Real, live code |
| `@wallet-standard/app` | `^1.1.1` | package.json:60 | Browser wallet *detection* only | Real, detection only |
| `@wallet-standard/base` | `^1.1.1` | transitive (bun.lock:845, via `@wallet-standard/app`) | Type import in `src/lib/client/wallet.ts:9` | Real, types only |
| `stripe` | `^23.1.0` (installed 23.1.0) | package.json:89 | Stripe checkout/portal/webhook module | Real code, **zero call sites** |
| `zod` | `^4.6.7` | package.json:96 | Request validation (incl. checkout body) | Real |
| `next-auth` | `^4.24.15` | package.json:75 | Declared; app uses its own session layer (`src/lib/auth/session.ts`) | Unused for billing |

Nothing else in `package.json` is a payment/web3/crypto dependency. There is **no** x402, MPP, Coinbase, PayPal, PayPal SDK, `web3.js`, `ethers`, `viem`, `@solana/web3.js`, `@solana/spl-token`, or Jupiter payments SDK. Swap execution deps are limited to `@solana/kit` + `@wallet-standard/app`; Jupiter is called over plain HTTP in `src/lib/providers/jupiter.ts`.

### 2.2 `src/lib` — payment / pricing / crypto code

| File:line | What it is | Status |
| --- | --- | --- |
| `src/lib/domain/billing/plans.ts:1-162` | Plan catalog. `PLAN_SEED` at :18-123, `ensurePlans()` at :126-146 (idempotent `db.plan.upsert`), `listActivePlans()` at :149-162 | **Real.** Prices and entitlements are DB configuration data |
| `src/lib/domain/billing/plans.ts:26-123` | The five plans and their entitlements (see §5) | **Real data** |
| `src/lib/domain/billing/plans.ts:3` | Comment claims "entitlements live here as data consumed by server-side limits" | **False as written** — no server-side limit reads `entitlementsJson` (verified: only `plans.ts` itself references the field) |
| `src/lib/domain/billing/crypto.ts:1-333` | USDC-on-Solana subscription checkout. `createCheckoutIntent` :110-159, `scanForPayment` :196-219, `verifyCheckoutIntent` :236-333 | **Real, complete logic**, gated on `PAYOUT_WALLET` |
| `src/lib/domain/billing/crypto.ts:23` | `DEFAULT_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"` (native Solana USDC) | Real constant |
| `src/lib/domain/billing/crypto.ts:38-40` | `destinationWallet()` → `process.env.PAYOUT_WALLET` | The single blocking config |
| `src/lib/domain/billing/crypto.ts:51-63` | `getCheckoutConfig()` — returns `configured/checkCheckoutReady` false and `missingEnv: ["PAYOUT_WALLET"]` | Real gate |
| `src/lib/domain/billing/crypto.ts:70-72` | `usdMicrosToUsdcBaseUnits()` — identity (1 USD micro = 1 USDC base unit, 6dp) | Real, correct |
| `src/lib/domain/billing/crypto.ts:80-82` | `buildMemo(id)` → `FS-<last12>` | Real |
| `src/lib/domain/billing/crypto.ts:173-188` | `usdcReceived()` — sums post−pre `uiTokenAmount` for (mint, owner) | Real chain-data arithmetic |
| `src/lib/domain/billing/crypto.ts:196-219` | `scanForPayment()` — `getSignaturesForAddress(destination, limit 25)`, filters by memo, then `getTransaction(jsonParsed)` and requires `received >= amount` | **Real chain verification** (memo alone never grants) |
| `src/lib/domain/billing/crypto.ts:236-333` | `verifyCheckoutIntent()` — expiry → scan → idempotent `Subscription` upsert keyed `(provider, providerRef=memo)` → intent marked `CONFIRMED` → audit | Real, idempotent |
| `src/lib/domain/billing/crypto.ts:291` | Entitlement period is hardcoded 30 days | Real but crude (no proration/cancel handling) |
| `src/lib/domain/billing/stripe.ts:1-370` | Full Stripe integration: status :43-63, client :66-75, `createCheckoutSession` :100-149, `createPortalSession` :152-176, `constructWebhookEvent` :180-193, `applySubscription` :205-236, `processWebhookEvent` :249-325, `resolveAllowedOrigin` :333-353, `getWorkspaceSubscription` :356-370 | **Real code but unreachable** (§4.2) |
| `src/lib/client/wallet.ts:16-46` | `useWalletAvailability()` — Wallet Standard registry detection | Real, detection only (no connect, no sign, no transfer) |
| `src/lib/client/wallet.ts:51-54` | `TRADING_GATE = { enabled: false }` | Static UI hint only |
| `src/lib/client/api.ts:74-97` | `Capabilities` type incl. `billing.{available,level,requiredEnv,mint,destination,plans}` | Real client type |
| `src/lib/providers/solana.ts` | Read-only Solana adapter (mint info, largest accounts, signature status) | Real; no transfer/signing code |
| `src/lib/providers/jupiter.ts:113-150` | Jupiter Swap V2 `/order` (unsigned tx) behind the trading gate | Real code, gated OFF |
| `src/lib/auth/context.ts:51-62` | `requirePlatformRole`, `requireWorkspaceRole` | Real authorization helpers |
| `src/lib/domain/trading/gates.ts:1-40` | Trading release-gate system | Real; unrelated to revenue today |

### 2.3 `src/app/api` — payment, billing, subscription routes

| Route | Method | Auth | Behaviour | Real or stub |
| --- | --- | --- | --- | --- |
| `src/app/api/v1/billing/checkout/route.ts:12-27` | POST | `requireAuth()` + `requireWorkspaceRole(ctx,"ADMIN")` (:13-14) | Validates `{planCode}`, calls `createCheckoutIntent` (`crypto.ts:110`). Returns `{provider:"usdc", memo, destination, mint, amountBaseUnits, amountDisplay, planCode, expiresAt, status}`. No redirect, no hosted page. | **Real** (server + DB write). Currently always 4xx because `PAYOUT_WALLET` is unset |
| `src/app/api/v1/billing/verify/route.ts:12-25` | POST | `requireAuth()` only (no workspace role) | `{memo}` → `verifyCheckoutIntent`. Reads chain, may grant `Subscription`. | **Real** |
| `src/app/api/v1/billing/status/route.ts:8-36` | GET | `requireAuth()` + `requirePlatformRole(["PLATFORM_ADMIN","MODERATOR"])` (:9-10) | Returns provider config (`configured`, `checkoutReady`, `missingEnv`, `mint`, `destination`), purchasable plans, and current workspace subscription | **Real**, but admin-only — ordinary paying users cannot see their own billing state |
| `src/app/api/v1/billing/webhook/route.ts:8-27` | POST | **None** — Stripe HMAC over raw body | Missing `stripe-signature` → 400; bad signature → 403 via `constructWebhookEvent` | **Real Stripe webhook** — but nothing can create a Stripe subscription to notify it (§4.2) |
| `src/app/api/v1/billing/portal/route.ts:6-13` | POST | `requireAuth()` + `requireWorkspaceRole(ADMIN)` | `createPortalSession({workspaceId, origin, email: ""})` — note the **empty email string** (:11), so `customer_email` would be empty | **Real code, unreachable** (needs Stripe + a `provider="stripe"` Subscription row) |
| `src/app/api/v1/pricing/route.ts:9-23` | GET | None (public) | Serves `listActivePlans()`; `purchasingAvailable: !!process.env.BILLING_PROVIDER` | **Real**, but **not called by any UI** (see §4.5) |
| `src/app/api/v1/capabilities/route.ts:39-53` | GET | Public flags for non-admins, full detail for PLATFORM_ADMIN/MODERATOR | Exposes `billing.{available,level,mint,destination,requiredEnv}` | Real reporting |
| `src/app/api/v1/admin/overview/route.ts:35-50` | GET | PLATFORM_ADMIN/MODERATOR | Returns `integrations.billing = getBillingStatus()` (Stripe) + `tradingExecutionEnv` | Real server-side, **never rendered by the admin UI** (`src/components/fs/admin-view.tsx:41-48` has no `integrations` field) |
| `src/app/api/v1/trading/execute/route.ts:30-39` | POST | `requireAuth()` + gate check | Refuses with `EXECUTION_GATED` unless all release gates approved + kill switch clear + `TRADING_ENABLED=true` | Real, hard-gated — **not a revenue path** |
| `src/app/api/v1/trading/order-intents/route.ts` | POST/GET | `requireAuth()` | Real Jupiter quotes persisted as records | Real, not monetized |

There are **no** other checkout / payment / billing / subscription / invoice / order routes in `src/app/api`. The only `Order`-like model is `TransactionRecord` (trading), and the only `Order` strings are Jupiter swap orders behind the gate.

### 2.4 `src/app` UI surfaces

| Location | What it does | Status |
| --- | --- | --- |
| `src/components/fs/marketing/page.tsx:203-295` | `/pricing` server-rendered plan grid from the live DB catalog, prices formatted at :197-201, CTAs link to `/auth` or `/contact` (:272-281) | **Real**, but the CTA is *sign-up*, not *buy* |
| `src/components/fs/settings-view.tsx:126-313` | `BillingSection()` — queries `/api/v1/billing/status`, "Pay with USDC" button (:215-222), renders destination + memo to copy (:243-266), 6-second polling verify loop (:153-159), CONFIRMED/EXPIRED states (:268-297) | **Real, complete UI.** But gated at :446 `{isPlatformAdmin ? <BillingSection /> : null}` — only PLATFORM_ADMIN/MODERATOR see it |
| `src/components/fs/markets-view.tsx:446-515` | Wallet Standard detection panel ("no wallets detected", link to docs) | Real, honest, **no wallet connection or payment** |
| `src/components/fs/domain/trade.tsx:230-241` | "Connect wallet" button that only exists as a gated trading affordance | Not a payment path |

### 2.5 `tests/crypto-checkout.test.ts` — what it actually tests

81 lines, 5 `test()` cases. It is a **unit test file, not an end-to-end payment test**; the header (:1-3) says so explicitly: *"Chain verification is exercised against mainnet separately; these tests pin the properties that must hold without network access."*

| Line | Test | Real or mocked |
| --- | --- | --- |
| :23-29 | `getCheckoutConfig()` reports unconfigured and lists `PAYOUT_WALLET` | Real (env deletion, no mock) |
| :31-37 | Config reports configured once `PAYOUT_WALLET` is set; provider `usdc`; mint is native USDC | Real |
| :41-45 | USD micros ↔ USDC base units 1:1, display `"39.000000"` | Real (pure math) |
| :49-52 | `buildMemo` shape `/^FS-[a-z0-9]{12}$/` | Real |
| :54-66 | `createCheckoutIntent` against a **real plan row** in the DB, asserting `amountBaseUnits === 39_000_000`, `status === "PENDING"`, `expiresAt` set | Real DB write (Prisma → test DB). No mock of Prisma, no mock of RPC |
| :68-73 | `ENTERPRISE` rejected with /quoted by sales/ | Real |
| :75-80 | Unconfigured deployment refuses with /CONFIGURATION\|not configured/ | Real |

Cleanup at :16-20 deletes `CryptoPaymentIntent` rows whose memo starts with `FS-` after each test.

**Not covered anywhere:** `scanForPayment()`, `verifyCheckoutIntent()`, memo matching, amount matching, the idempotent subscription upsert, the expiry transition, or any Stripe function. There is no mocked chain and no recorded-signature fixture — the security-critical half of the checkout (does a transfer actually grant the entitlement?) has **zero automated coverage**.

### 2.6 `prisma/schema.prisma` — money-adjacent models

| Model | Line | Fields |
| --- | --- | --- |
| `Plan` | :623-632 | `id`, `code @unique`, `name`, `monthlyPriceMicros Int`, `currency @default("USD")`, `entitlementsJson String`, `active`, `sort` |
| `Subscription` | :634-648 | `id`, `workspaceId`, `planId`, `status @default("TRIALING")` (TRIALING/ACTIVE/PAST_DUE/CANCELED), `provider @default("none")` (none/stripe/usdc), `providerRef String?`, `currentPeriodEnd DateTime?`, `cancelAtPeriodEnd Boolean`, timestamps; `@@unique([provider, providerRef])`, `@@index([workspaceId])` |
| `BillingWebhookEvent` | :652-660 | `id`, `eventId @unique`, `type`, `payloadJson`, `status` (PROCESSED/SKIPPED/FAILED), `error String?`, `createdAt` |
| `CryptoPaymentIntent` | :664-682 | `id`, `workspaceId`, `userId`, `planCode`, `amountBaseUnits Int`, `mint`, `destination`, `memo @unique`, `status @default("PENDING")` (PENDING/CONFIRMED/EXPIRED), `provider @default("usdc")`, `providerRef String?` (tx signature), `expiresAt`, `confirmedAt`, `createdAt`; indexes on `(workspaceId,status)` and `(destination,status)` |
| `TokenAsset` | :423-441 | Token metadata per venture (`mint @unique`, `symbol`, `decimals`, `mintAuthority`, `freezeAuthority`, `supply`, `association`) — **not** a balance/credit ledger |
| `WalletAssociation` | :443-454 | `ventureId`, `address`, `label` (TREASURY/TEAM/PROGRAM/UNKNOWN), `confidence`, `evidenceId` — **not** a user wallet |
| `OnchainObservation` | :456-471 | Raw chain read payloads |
| `TransactionRecord` | :602-621 | **Trading** records only: `kind` QUOTE_PREVIEW/SWAP, `status`, `inputMint`, `outputMint`, `inAmount`, `outAmount`, `slippageBps`, `priceImpactPct`, `quoteId`, `signature` — no fiat amounts, no payer |
| `ApiKey` / `ApiUsage` | :684-707 | `prefix`, `keyHash @unique`, `scopes`, `revokedAt`, usage rows — **defined but never written or read by any route** |

**Absent models:** no `Invoice`, `Order`, `Payment`, `Charge`, `Ledger`, `Credit`/`CreditBalance`, `Balance`, `Entitlement`, `Price` (pricing is `Plan.monthlyPriceMicros`), `Refund`, `Payout`, `Customer`, `TaxRate`.

Database reality check (`db/custom.db`, `prisma/db/custom.db`, both 5 rows): plans are seeded — Explorer 0, Researcher 39,000,000 µ, Professional 99,000,000 µ, Team 299,000,000 µ, Enterprise −1 — and `Subscription` is **empty** in both. `test-fs.db` has `Plan`/`Subscription`/`BillingWebhookEvent` tables but **no `CryptoPaymentIntent` table at all** (the `20261116_usdc_checkout` migration has not been applied there).

### 2.7 `docs/PROVIDER_INTEGRATIONS.md`

- :44-53 capability-flag table — `BILLING_PROVIDER` "unset → Billing surfaces show configuration-required state". Accurate.
- :55-62 a whole **"Billing provider (`src/lib/domain/billing/stripe.ts`, stripe@23)"** section describing checkout, portal, webhook, status as live Stripe capabilities. **Materially misleading as deployed**: those routes exist but cannot be reached (§4.2). It also documents Stripe as *the* billing provider while the product's actual checkout route uses USDC (`crypto.ts:20 BILLING_PROVIDER = "usdc"`).
- **Undocumented anywhere in this file:** `PAYOUT_WALLET` and `USDC_MINT`, i.e. the only variables that actually gate revenue today. The Solana section (:28-31) covers read-only adapters only.
- No mention of Stripe prices in the DB, no mention of the 30-day hardcoded entitlement, no mention that `PAYOUT_WALLET` must be a hot wallet holding the receiving key.

### 2.8 `docs/ACCEPTANCE_CRITERIA.md`

28 lines. A1-A12 (MVP golden journey) and B1-B4 (Sprint 7 trading gate). **No criterion mentions payment, checkout, subscription, revenue, billing, or monetization at any point.** Monetization is entirely absent from the acceptance contract, which explains why it was never end-to-end tested. `docs/DELIVERY_REPORT.md:29` is the honest summary — "Billing | SCHEMA + PLAN MODEL ONLY" — but :120 contradicts it by calling the Stripe path a "full real integration built config-gated".

### 2.9 `.env` — key names only (values redacted, never read into this report)

```
1  DATABASE_URL            postgresql://…@127.0.0.1:5433/foundrysignal
2  NEXT_PUBLIC_SITE_URL
4  # Email (Resend)
5  RESEND_API_KEY
6  EMAIL_FROM
8  # OAuth
9  GITHUB_OAUTH_CLIENT_ID
10 GITHUB_OAUTH_CLIENT_SECRET
11 GOOGLE_OAUTH_CLIENT_ID
12 GOOGLE_OAUTH_CLIENT_SECRET
14 # MFA
15 MFA_ENCRYPTION_KEY
16 GITHUB_TOKEN
17 HELIUS_API_KEY
```

**Payment-relevant keys present: NONE.** Absent: `PAYOUT_WALLET`, `USDC_MINT`, `SOLANA_RPC_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `BILLING_PROVIDER`, `TRADING_ENABLED`, `JUPITER_MODE`, `ALLOWED_ORIGINS`. There is no `.env.example`, so there is no documented contract for operators either.

---

## 3. Keyword sweep of `src/` (USDC / SPL / solana / wallet / stripe / checkout / price / plan / upgrade / credits)

**USDC** — all real code, no placeholders:
`src/lib/domain/billing/crypto.ts:1,3,7,22,23,43,48,49,66,119,145,172,192,286,320` · `src/app/api/v1/billing/checkout/route.ts:10` · `src/app/api/v1/billing/status/route.ts:29,30` · `src/app/api/v1/billing/verify/route.ts:7` · `src/app/api/v1/capabilities/route.ts:43,50,51` · `src/components/fs/settings-view.tsx:127,221,234`

**SPL** — read-only token metadata decoding, real:
`src/lib/providers/solana.ts:17,78,100` · `src/components/fs/domain/token.tsx:36,135` · `src/components/fs/design-system-view.tsx:1037` (demo fixture)

**solana / Solana** — real reads plus marketing copy:
Real code: `src/lib/domain/billing/crypto.ts:14,85` · `src/lib/providers/solana.ts:1,2,6,38,118` · `src/lib/jobs/collectors.ts:9,15,315,320,322,336` · `src/lib/domain/ventures/service.ts:9,271` · `src/app/api/v1/trading/{execute,order-intents}/route.ts` · `src/app/api/v1/health/route.ts:2,7,21` · `src/app/api/v1/providers/route.ts:4,13,40,45` · `src/app/api/v1/capabilities/route.ts:27` · `src/app/api/v1/ventures/[slug]/[sub]/route.ts:7,150,151,161,203`
Copy/SEO only (not logic): `src/components/fs/marketing/page.tsx:62,67,79,80,89,122,128,142,144,383` · `src/lib/seo.ts:226,242` · `src/app/layout.tsx:22` · `src/app/manifest.ts:9` · `src/app/opengraph-image.tsx:67` · `src/components/fs/marketing/content.tsx:137` · `src/components/fs/discover-view.tsx:322,354` · `src/components/fs/dossier-view.tsx:809` · `src/components/fs/markets-view.tsx:177,494`

**wallet / Wallet** — detection and trading affordances only:
Real detection: `src/lib/client/wallet.ts:3-46` · `src/components/fs/markets-view.tsx:40,149,446-515` · `src/components/fs/app.tsx:19,111`
Wallet **address** validation only: `src/app/api/v1/trading/execute/route.ts:13,25,44,46,47,48` · `src/app/api/v1/trading/order-intents/route.ts:7,74,75` · `src/app/api/v1/ventures/[slug]/[sub]/route.ts:7,150,151`
Payout wallet (server config): `src/lib/domain/billing/crypto.ts:38,52` · `src/app/api/v1/billing/status/route.ts:30` · `src/app/api/v1/billing/checkout/route.ts:9`
Copy/UI: `src/components/fs/domain/trade.tsx:90,92,186,230-241` · `src/components/fs/dossier-view.tsx:559` · `src/components/fs/marketing/page.tsx:142` · `src/components/fs/domain/graphs.tsx:518` · `src/components/fs/domain/venture.tsx:194`
No wallet **payment/transfer** code exists anywhere (no `signAndSendTransaction`, no `transfer`, no `createTransferCheckedInstruction`).

**stripe / Stripe** — real code, but no caller reaches the paid path:
`src/lib/domain/billing/stripe.ts:1,4,13,19,24,57,69,77,79,82,165,166,167,174,186,188` · `src/app/api/v1/billing/portal/route.ts:3,12` · `src/app/api/v1/billing/status/route.ts:3` · `src/app/api/v1/billing/webhook/route.ts:3,10,13` · `src/app/api/v1/admin/overview/route.ts:5,43` · `src/components/fs/ui/table.tsx:29` (unrelated `striped` prop)

**checkout / Checkout** — real:
`src/lib/domain/billing/crypto.ts:110,115,119,142,236,317` · `src/app/api/v1/billing/checkout/route.ts:4,20` · `src/app/api/v1/billing/status/route.ts:4,11,22,29,30` · `src/app/api/v1/billing/verify/route.ts:4,18` · `src/app/api/v1/capabilities/route.ts:3,40,45,50,51` · `src/app/api/v1/pricing/route.ts:17,18` · `src/lib/domain/billing/stripe.ts:100,102,103,119,130,135,138,141` · `src/components/fs/settings-view.tsx:50,60,64,127,138,139,144,185,194,207,208,210,212,217,218,236` · `src/lib/client/api.ts:84` · `src/components/fs/marketing/page.tsx:289`

**price / Price** — billing (real) vs market data (real but different concern):
Billing: `src/app/api/v1/billing/status/route.ts:13,14` · `src/app/api/v1/pricing/route.ts:5,10,14,18` · `src/lib/domain/billing/plans.ts:11,21,28,44,60,79,102,127,133,139,156` · `src/lib/domain/billing/crypto.ts:92,125` · `src/lib/domain/billing/stripe.ts:32,34,35,50,51,52,111,113,114` · `src/components/fs/settings-view.tsx:53,168,212` · `src/components/fs/marketing/page.tsx:197,200,258`
Market data (not revenue): `src/app/api/v1/markets/route.ts:15,27,29,68,84` · `src/app/api/v1/trading/order-intents/route.ts:26,34,46,113` · `src/lib/providers/jupiter.ts` · `src/components/fs/domain/token.tsx:51,53,61,62,83,91,201,203,220,221,224,236` · `src/components/fs/domain/trade.tsx:62,79,336,340`

**plan / Plan** — real catalog; **no enforcement anywhere**:
`src/lib/domain/billing/plans.ts` (whole file) · `src/lib/domain/billing/crypto.ts:18,88,90-95,104,113,124,125,131,145,155,224,250,263,282,290,295,300,320,327` · `src/app/api/v1/pricing/route.ts:2,10,14` · `src/app/api/v1/billing/status/route.ts:5,12,13,14,27` · `src/app/api/v1/billing/checkout/route.ts:17,23` · `src/components/fs/marketing/page.tsx:30,84,87,88,89,151,189,204,207,212,218,224,229,233,234,239,240,243,250,258,278,279` · `src/components/fs/settings-view.tsx:64,71,81,89,139,185,207,208,210,212,217,218,236` · `src/lib/client/api.ts:89` · `src/app/[[...fs]]/page.tsx:19`
**Zero** references to `plan.monthlyPriceMicros` or `entitlementsJson` in any route that gates a feature.

**upgrade** — no monetization meaning; only provider/env hints and one marketing verb:
`src/app/api/v1/capabilities/route.ts:27` (RPC upgrade) · `src/lib/client/api.ts:76` (same) · `src/components/fs/marketing/content.tsx:180` (WebGL upgrade) · `src/components/fs/marketing/page.tsx:321` ("never upgrades trust classification") · `src/lib/domain/ventures/service.ts:223` (trust claim upgraded by evidence) · `docs/DELIVERY_REPORT.md:45` (`BILLING_PROVIDER` "optional upgrade")

**credits** — **no credit system exists**:
`src/components/fs/design-system-view.tsx:161,704,992` — marketing placeholder copy ("onchain credit markets") · `src/lib/domain/billing/crypto.ts:172,192` — the verb "credited to destination". No `Credit` model, no balance, no purchase-credits endpoint.

---

## 4. What is stubbed, fake, or unreachable

1. **Stripe billing is dead code in practice (most important finding).** `createCheckoutSession` (`stripe.ts:100`) has **zero call sites** — verified by repo-wide grep across `src`, `tests`, `scripts`. `/api/v1/billing/checkout` (the only checkout route) calls `createCheckoutIntent` from `crypto.ts` and hardcodes `provider: "usdc"` (`checkout/route.ts:26`). Therefore: no Stripe `Subscription` row is ever created with `provider="stripe"`, so the real webhook (`webhook/route.ts`), the real portal (`portal/route.ts:152-176`, which requires `provider="stripe"` and `providerRef`), and the real `applySubscription` are all **unreachable**. The Stripe code is not fake — it is *orphaned*. `docs/PROVIDER_INTEGRATIONS.md:55-62` and `docs/DELIVERY_REPORT.md:120` describe it as the live billing provider, which is not what the routing actually does.
2. **`src/app/api/v1/billing/status` is admin-only** (`requirePlatformRole(["PLATFORM_ADMIN","MODERATOR"])`, :10). A normal OWNER/ADMIN user who could pay (`checkout` requires workspace ADMIN, :14) can never read their own subscription state, and the Settings UI that renders the payment panel is itself gated to `isPlatformAdmin` (`settings-view.tsx:446`). Net effect: **the paying customer cannot see the product they paid for.** Only a platform operator can use the checkout UI at all.
3. **The pricing page sells sign-ups, not subscriptions.** `/pricing` CTAs (`marketing/page.tsx:272-281`) point at `/auth` and `/contact`. There is no "buy" anywhere on the public marketing surface; no `Upgrade` button exists (the `upgrade` hits are all unrelated).
4. **`GET /api/v1/pricing` has no consumer.** `purchasingAvailable` is derived from `BILLING_PROVIDER` (`pricing/route.ts:15`), which is *not* the variable the USDC path reads (`PAYOUT_WALLET`). The note tells visitors "checkout opens once a billing provider is configured" even when USDC checkout is live. No file imports this route; the SSR pricing page queries the DB directly (`marketing/page.tsx:207`).
5. **Entitlements are decorative.** `entitlementsJson` is seeded with `researchRunsPerMonth`, `apiAccess`, `seats`, `watchlists`, `reportExport`, `alerts`, `priorityCollection`, `apiMonthlyCalls`, … but no route reads it. Verified: the only files mentioning any of those keys are `src/lib/domain/billing/plans.ts` and comments. Concrete evidence: `POST /api/v1/research/runs` (the paid AI product) enforces only a 2-concurrent-run cap (`research/runs/route.ts:41-45`) — **no plan check, no monthly quota**; `GET /api/v1/reports/[id]/export` (a paid feature per plan `reportExport`) has no plan check; `ApiKey`/`ApiUsage` (metering for the TEAM plan's 50k calls/month) are **never written or read** by any route; watchlists cap at a hardcoded 12 (`watchlists/route.ts:31-32`) rather than per-plan `watchlists` values.
   **Consequence: paying is optional today.** Every capability is already free, so the only reason to buy is cosmetic. This is as damaging to revenue as the missing `PAYOUT_WALLET`.
6. **The test DB cannot even store an intent.** `test-fs.db` has no `CryptoPaymentIntent` table; the `20261116_usdc_checkout` migration exists in `prisma/migrations/` but was never applied there. Tests that touch `db.cryptoPaymentIntent` (`tests/crypto-checkout.test.ts:19`) would fail against it.
7. **`CryptoPaymentIntent.amountBaseUnits` is `Int` (32-bit, max 2,147,483,647)** (`schema.prisma:669`, migration `20261116_usdc_checkout`). 2.1M USDC is the ceiling — fine for today's $39–$299 plans, a latent defect for enterprise/annual pricing.
8. **No watcher / cron job.** Verification only happens when a human polls `POST /billing/verify` (UI polls every 6 s, `settings-view.tsx:153-159`). If the payer closes the tab, the entitlement is granted only when someone remembers to verify, and intents silently `EXPIRED` after 30 min (`crypto.ts:26,258-269`). `src/lib/jobs/*` registers collectors/handlers only — no billing job (`instrumentation.ts` boots collectors + governance).
9. **Verification is weak against high-volume wallets.** `scanForPayment` reads only the **last 25** signatures of the destination (`crypto.ts:27,204`) and then matches memos client-side. On a busy payout wallet the matching transfer falls outside the window and a genuinely paid invoice is reported unpaid. There is no index, no `confirmed` archive, no per-intent address.
10. **`verifyCheckoutIntent` requires only `requireAuth()`** (`verify/route.ts:13`) — no workspace-role gate — while `checkout` requires workspace ADMIN. A VIEWER/ANALYST member of a workspace can confirm/expire a pending intent belonging to that workspace.
11. **Messaging/claims mismatch.** `docs/PROVIDER_INTEGRATIONS.md:55-62` (Stripe as *the* provider) vs `crypto.ts:20` (`BILLING_PROVIDER = "usdc"`); `docs/DELIVERY_REPORT.md:29` ("SCHEMA + PLAN MODEL ONLY") vs `:120` ("full real integration built"); `settings-view.tsx:306-307` promises "Entitlements change only when a matching onchain transfer is verified" — true, but nothing *consumes* the entitlement.
12. **No invoice, receipt, refund, chargeback, tax, or accounting surface.** `Subscription` has no `amountPaid`, no `currency`, no `invoicedTo`, no `tax`. There is no `Invoice`/`Payment` model at all, so a finance/tax trail for revenue cannot be produced from the database.
13. **No revenue telemetry.** `ApiUsage`, `ResearchRun.tokensIn/tokensOut` (`schema.prisma:499-500`, written at `research/engine.ts:302-303`) exist, but no cost-per-run, margin, MRR, or plan-mix metric is computed anywhere. Nothing tells the operator what they earned.

---

## 5. Pricing model present in code

Source of truth: `src/lib/domain/billing/plans.ts:18-123` (`PLAN_SEED`), persisted by `ensurePlans()` into `Plan` (`schema.prisma:623-632`), served by `GET /api/v1/pricing` and rendered at `/pricing`. Prices are **integer USD micros** (`monthlyPriceMicros`, 1 µ = 10⁻⁶ USD). Seeded and confirmed live in `db/custom.db` and `prisma/db/custom.db` (5 active rows each).

| Code | Name | monthlyPriceMicros | USD / month | `sort` | Self-serve? | Notable entitlements |
| --- | --- | --- | --- | --- | --- | --- |
| `EXPLORER` | Explorer | `0` | **$0** | 10 | n/a (free) | `dossierAccess: PUBLIC`, `savedVentures: 10`, `researchRunsPerMonth: 0`, `watchlists: 1`, `alerts/reportExport/apiAccess: false`, `seats: 1` |
| `RESEARCHER` | Researcher | `39_000_000` | **$39** | 20 | yes | `dossierAccess: FULL`, `savedVentures: 100`, `researchRunsPerMonth: 25`, `watchlists: 5`, `alerts/reportExport: true`, `apiAccess: false`, `seats: 1` |
| `PROFESSIONAL` | Professional | `99_000_000` | **$99** | 30 | yes | `savedVentures: 500`, `researchRunsPerMonth: 100`, `watchlists: 20`, `comparativeResearch: true`, `savedSearches: 50`, `priorityCollection: true`, `apiAccess: false` |
| `TEAM` | Team | `299_000_000` | **$299** | 40 | yes | `savedVentures: 2000`, `researchRunsPerMonth: 400`, `watchlists: 100`, `researchRooms/rolePermissions/auditExports: true`, `apiAccess: true`, `apiMonthlyCalls: 50_000`, `seats: 5` |
| `ENTERPRISE` | Enterprise | `-1` | **Custom** (quoted by sales) | 50 | **no** — `crypto.ts:92-94` and `stripe.ts:107-108` both refuse | unlimited (`-1` everywhere), `ssoScim: "ROADMAP"`, `customCollectionScopes`, `dedicatedSupport` |

Marketing formatting: `formatPlanPrice` (`marketing/page.tsx:197-201`) → `$0`, `$39/mo`, `$99/mo`, `$299/mo`, `Custom`; the Professional tier is flagged "most chosen" (`marketing/page.tsx:212,251-255`). Settings renders `$${(micros/1e6).toFixed(2)}/month` (`settings-view.tsx:168,212`).

Other prices in the system: **none**. There is no credit pack, no one-off report price, no API overage rate, no seat price, no annual discount, no trial length (`Subscription.status` has a `TRIALING` default but no code ever sets `TRIALING` deliberately — `crypto.ts:301` writes `ACTIVE`, `stripe.ts:215` maps from Stripe).

---

## 6. Payment flow status

### USDC (the implemented, currently-unavailable path)

**Status: implemented end to end; BLOCKED at step 0 by missing `PAYOUT_WALLET`; and unfinishable in practice because only platform admins can see it.**

```
[0] Operator sets PAYOUT_WALLET=<platform USDC wallet>        ← MISSING (.env has no such key)
[1] UI: Settings → Billing (PLATFORM_ADMIN/MODERATOR only)     ← settings-view.tsx:446
[2] POST /api/v1/billing/checkout {planCode}                    ← auth + workspace ADMIN
      → getCheckoutConfig() throws CONFIGURATION_REQUIRED if   ← crypto.ts:115-122
        PAYOUT_WALLET unset (TODAY: every call dies here)
      → loadPlan(planCode) (rejects ENTERPRISE, unknown, inactive)
      → db.cryptoPaymentIntent.create({amountBaseUnits = monthlyPriceMicros,
          mint = USDC_MINT||EPjFW…Dt1v, destination = PAYOUT_WALLET,
          memo = "FS-"+rand12, expiresAt = now+30min, status PENDING})
      → recordAudit(CHECKOUT_INTENT_CREATED)
      → 200 {provider:"usdc", memo, destination, mint, amountBaseUnits,
             amountDisplay:"39.000000", planCode, expiresAt, status:"PENDING"}
[3] UI shows destination + memo + exact amount, copy buttons        ← settings-view.tsx:228-266
[4] Payer sends USDC (native mint) to destination, memo in tx      ← outside the app (wallet)
[5] UI polls POST /api/v1/billing/verify {memo} every 6 s          ← settings-view.tsx:153-159
      → intent lookup by (memo, workspaceId)
      → CONFIRMED → short-circuit (idempotent)
      → expired?  → status EXPIRED, no grant
      → scanForPayment: getSignaturesForAddress(dest, limit 25),
        memo substring match, getTransaction(jsonParsed),
        require post-pre USDC delta to dest >= amountBaseUnits
      → no match → status unchanged, "keep this memo in the payment"
      → match    → db.subscription.upsert(key = (usdc, memo))
                    {status ACTIVE, currentPeriodEnd = now + 30d}
                  → intent status CONFIRMED, providerRef = tx signature
                  → recordAudit(CHECKOUT_CONFIRMED)
[6] UI shows "Payment confirmed onchain — subscription active"     ← settings-view.tsx:268-276
[7] Entitlement consumed by … nothing. No route reads Subscription
    or Plan.entitlementsJson.                                      ← §4.5
```

Known defects in this flow even after `PAYOUT_WALLET` is set: 25-signature scan window (misses payments on busy wallets), 30-minute expiry with no re-issue path, no watcher (grant requires an open tab), 32-bit amount column, no receipt/invoice, no renewal (the subscription simply expires after 30 days and nothing charges again — there is **no recurring billing of any kind**), no `USDC_MINT` verification that the receiving wallet is a token account for that mint.

### Stripe (code-complete, unreachable)

`stripe.ts` implements Checkout Session creation (subscription mode, server-set `metadata.workspaceId/planCode`, origin allowlist), portal sessions, and a signature-verified, insert-first-idempotent webhook handling `checkout.session.completed` / `customer.subscription.*`. But **no route calls `createCheckoutSession`**, so no Stripe subscription ever exists; the webhook and portal therefore have nothing to act on. Activating Stripe requires a new route + UI wiring, not just env vars.

### Trading / swaps (not a revenue path)

Real Jupiter quote → persisted `TransactionRecord` (`order-intents`), execution refused with `EXECUTION_GATED` unless all four review gates are APPROVED + kill switch CLEAR + `TRADING_ENABLED=true` (`trading/execute/route.ts:34-39`). Even if lifted, it is user self-custody swapping — **zero platform revenue** (no fee, no commission, no spread anywhere in `jupiter.ts` or `execute/route.ts`).

### Other

No credits, no invoices, no donations/"buy me a coffee", no paid API tier enforcement, no marketplace fees, no affiliate/referral, no ad surface. Contact page is a static marketing section with no form submission handler found in `src/`.

---

## 7. Required to earn — exact files to create / change

Ordered by dependency. Paths are relative to the repo root.

1. **Change `.env`** — add `PAYOUT_WALLET=<Solana address of the receiving USDC wallet>` (optionally `USDC_MINT`, `SOLANA_RPC_URL`). This single line is the difference between "cannot take money" and "can take money". Also create **`.env.example`** documenting every key the code reads (`PAYOUT_WALLET`, `USDC_MINT`, `SOLANA_RPC_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_RESEARCHER|PROFESSIONAL|TEAM`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `BILLING_PROVIDER`, `TRADING_ENABLED`, `ALLOWED_ORIGINS`) — none are documented today.
2. **Create `src/lib/domain/billing/entitlements.ts`** — the missing consumer: `getEntitlements(workspaceId)` (loads `Subscription` → `Plan.entitlementsJson`), `requireEntitlement(ctx, key, limit)`, `assertPlanAllows(ctx, capability)`, and `currentPlan(workspaceId)`. Without this file, revenue and product capability are decoupled (see §4.5) and customers have no reason to pay.
3. **Change `src/app/api/v1/research/runs/route.ts`** — enforce `researchRunsPerMonth` from `entitlements.ts` (monthly counter via `db.researchRun.count({where:{workspaceId, createdAt:{gte: monthStart}}})`), replacing/augmenting the hardcoded 2-concurrent cap at :41-45. This is the metered AI cost center (`ResearchRun.tokensIn/tokensOut`, `schema.prisma:499-500`).
4. **Change `src/app/api/v1/reports/[id]/export/route.ts`** — gate on `entitlements.reportExport` (paid feature per `plans.ts:35,51,67,86,109`).
5. **Change `src/app/api/v1/watchlists/route.ts`** — replace the hardcoded `count >= 12` at :31-32 with the plan's `watchlists` limit; same for saved searches (`savedSearches`), alerts (`alerts`), and venture saves (`savedVentures`) in their respective routes (`src/app/api/v1/saved-searches/route.ts`, `src/app/api/v1/alerts/route.ts`, `src/app/api/v1/ventures/route.ts`).
6. **Create `src/lib/domain/billing/apikey.ts` + change every `/api/v1/*` route (or add middleware)** — actually issue/validate `ApiKey` rows and write `ApiUsage` (`schema.prisma:684-707`, currently dead) so the TEAM `apiAccess`/`apiMonthlyCalls: 50_000` entitlement is real and enforceable.
7. **Change `src/app/api/v1/billing/status/route.ts:10`** — drop `requirePlatformRole`, return only the caller's own workspace subscription + a purchasable plan list. A paying customer must be able to see their plan, status, period end, and an "extend/cancel" affordance.
8. **Change `src/components/fs/settings-view.tsx:446`** — render `<BillingSection />` for every authenticated user (workspace ADMIN+ for the purchase button, everyone for read-only state), not `isPlatformAdmin` only. Currently the buyer cannot buy or see what they bought.
9. **Change `src/components/fs/marketing/page.tsx:272-281`** — replace the `Start with <plan>` → `/auth` CTA with a real `Choose <plan>` → `/settings?checkout=<code>` (or `/checkout/<code>`) deep link that opens the USDC intent flow; keep `Contact us` for ENTERPRISE.
10. **Change `src/app/api/v1/pricing/route.ts:15-18`** — derive `purchasingAvailable` from `getCheckoutConfig().checkoutReady` (`PAYOUT_WALLET`), not `BILLING_PROVIDER`, and add `checkoutUrl`/`provider` so the client can route correctly. Align the note with reality.
11. **Create `src/lib/jobs/billing-watcher.ts` and register it in `src/instrumentation.ts`** — periodic `verifyCheckoutIntent` sweep over `PENDING` intents (and a `renewal` job that extends/charges before `currentPeriodEnd`), so payment is detected without an open browser tab and subscriptions actually renew. Today there is no recurring billing and no watcher.
12. **Change `src/lib/domain/billing/crypto.ts:27,196-219`** — replace the 25-signature window with a per-intent deposit-account or memo-indexed scan (or Helius `getSignaturesForAddress` with `until`/pagination) so a real payment cannot be missed on a high-volume destination wallet.
13. **Change `src/lib/domain/billing/crypto.ts:236-333` + `src/app/api/v1/billing/verify/route.ts:13`** — require workspace ADMIN+ on verify (currently any authenticated member, including VIEWER, can confirm/expire a workspace intent) and add a `reissue` path for expired intents instead of forcing a new purchase.
14. **Change `prisma/schema.prisma:669` + new migration `prisma/migrations/<ts>_money_as_bigint/migration.sql`** — widen `CryptoPaymentIntent.amountBaseUnits` to `BigInt`/`Decimal` (32-bit `Int` caps at ~2.1M USDC) and add an `Invoice` (or `PaymentRecord`) model with `workspaceId`, `planCode`, `amountBaseUnits`, `currency`, `provider`, `providerRef`, `periodStart`, `periodEnd`, `status` — required for receipts, refunds, tax, and MRR reporting. Then apply the existing `20261116_usdc_checkout` migration to `test-fs.db` (it has no `CryptoPaymentIntent` table today).
15. **Create `src/app/api/v1/admin/billing/route.ts`** — operator view: intents by status, confirmed signatures, MRR, plan mix, failed verifications. Nothing today surfaces revenue to an operator (`admin/overview` returns `integrations.billing` but the admin UI ignores it — `admin-view.tsx:41-48`).
16. **Either delete or wire the Stripe path.** `src/lib/domain/billing/stripe.ts` (370 lines) + `src/app/api/v1/billing/{webhook,portal}/route.ts` are unreachable: `createCheckoutSession` has no caller. Choose one: (a) delete `stripe.ts`, the webhook and portal routes, and the `stripe`/`BillingWebhookEvent` dependencies, and correct `docs/PROVIDER_INTEGRATIONS.md:55-62` + `docs/DELIVERY_REPORT.md:120`; or (b) add `src/app/api/v1/billing/checkout-stripe/route.ts` and a UI switch, which also requires `STRIPE_PRICE_*` per plan and real Stripe price objects matching `monthlyPriceMicros`.
17. **Change `docs/PROVIDER_INTEGRATIONS.md`, `docs/ACCEPTANCE_CRITERIA.md`, `docs/DELIVERY_REPORT.md`** — document `PAYOUT_WALLET`/`USDC_MINT` as the billing config contract; add acceptance criteria for "a real USDC transfer grants exactly one entitlement", "an expired intent never grants", "a payment missed by the scan window is recoverable", "a non-paying workspace is denied a paid capability". Monetization is absent from the current acceptance contract entirely.
18. **Create `tests/crypto-checkout-chain.test.ts` (or extend `tests/crypto-checkout.test.ts`)** — the security-critical half has zero coverage: memo mismatch must not grant, underpayment must not grant, double-verify must not double-grant, expiry must not grant. Mock at the `createSolanaRpc` boundary (or use a recorded mainnet signature fixture) so it runs without network.

Minimum subset to *start earning at all* (one-time USDC payments): **items 1, 2, 7, 8, 9**. Everything else is either recurring-revenue, enforcement, or correctness work.

---

## 8. Recommended first revenue path

**Sell one thing, onchain, at $39/month, to strangers who already want it: the "Researcher" tier's AI research run on a single venture.**

Concretely — *a single-use research report sold as a USDC payment intent, no subscription machinery, no Stripe, no new UI framework*:

1. **Create `src/app/api/v1/billing/oneoff/route.ts`** — `POST`, auth + workspace ADMIN+, body `{ventureId}`. It creates a `CryptoPaymentIntent` with `planCode = "RESEARCHER"`-priced amount (`monthlyPriceMicros` 39_000_000 → `39.000000 USDC`) but with a new `kind = "RESEARCH_REPORT"` column and a `deliverableId = ventureId` reference. Reuses `createCheckoutIntent`'s intent/verify machinery verbatim (`crypto.ts:110` / `:236`) — no new chain code.
2. **Change `src/lib/domain/billing/crypto.ts:295-308`** — on `kind = "RESEARCH_REPORT"`, also enqueue the existing `research_run` job (`src/lib/jobs/handlers.ts:6`) bound to `deliverableId`, instead of (or in addition to) upserting a `Subscription`. The report is delivered only after onchain confirmation, which is the honest, auditable version of "pay → get output".
3. **Change `src/components/fs/research-view.tsx`** (or a new `src/components/fs/checkout-report-view.tsx`) — one "Generate report — 39.000000 USDC" button that calls the new route, shows destination + memo, and polls `verify` exactly as `settings-view.tsx:153-159` already does.
4. **Change `src/lib/domain/research/engine.ts:220`** — `ZAI.create()` currently relies on the ambient SDK default; assert an explicit `ZAI_API_KEY`/equivalent env var exists, so a paying user's run cannot fail after payment for a missing credential (cost control: check `tokensIn/tokensOut` at :302-303 against the $39 price before starting, and record cost per run).
5. **Set `PAYOUT_WALLET` in `.env`** and add it to a new `.env.example`.

Why this and not the subscription: it uses the *already-working* half of the checkout (intent → memo → chain verify → idempotent grant), needs **one new route** rather than a billing subsystem, has a clean unit of value (one grounded report, citations validated — `docs/ACCEPTANCE_CRITERIA.md` A6), no proration/cancel/renewal semantics to get wrong, and no entitlement enforcement to build first because the deliverable is gated by the payment itself, not by a plan flag. It also sidesteps the two structural blockers that make subscriptions unattractive today — no recurring charge exists anywhere in the codebase, and no route consumes `entitlementsJson`.

Guardrails before charging a stranger: put a real USDC amount check + memo-match test in place (§7 item 18) — the transfer-grants-entitlement path is currently **untested** — and make sure `PAYOUT_WALLET` is a wallet you can actually sign/refund from, since there is no refund or dispute code today.

---

### One-line answer

**No — FoundrySignal cannot earn money today: the only revenue path is USDC-on-Solana checkout, which is fully written but hard-blocked by the absent `PAYOUT_WALLET` variable, and even once set it is invisible to the paying user (admin-only UI) and buys nothing enforceable, because plan entitlements are stored but never checked anywhere.**