# FoundrySignal — Provider Integrations

## Provider framework
Every external integration implements:

```ts
interface DataProvider {
  getHealth(): Promise<ProviderHealth>;           // HEALTHY | DEGRADED | RATE_LIMITED | UNAVAILABLE | MISCONFIGURED
  fetch<T>(req: ProviderRequest, opts?: ProviderOptions): Promise<ProviderResult<T>>;
  getRateLimitState(): Promise<RateLimitState>;
}
```

Adapters add: timeout, bounded retries (transient-only), exponential backoff + jitter, per-provider circuit breaker (5 consecutive failures → open for 30s → half-open probe), rate-limit header parsing, structured error taxonomy (`NETWORK`, `TIMEOUT`, `RATE_LIMITED`, `INVALID_RESPONSE`, `AUTH_FAILURE`, `PERMANENT`). Health states are surfaced in the admin console and rendered as honest UI states (never silently substituted).

## GitHub (`github-adapter`)
- REST API v3, `Accept: application/vnd.github+json`, UA header.
- Endpoints used: `GET /repos/{owner}/{repo}`, `/releases`, `/commits`, `/languages`, `/contributors`, `/orgs/{org}/repos`, rate-limit check `/rate_limit`.
- Auth: `GITHUB_TOKEN` (PAT, `repo:read` scope sufficient for public data). **Measured on this sandbox: unauthenticated quota for the shared egress IP is exhausted; without a token the adapter reports `RATE_LIMITED` honestly. With a token, full collection operates.**
- Rate-limit headers parsed per response; secondary rate limits honored; pagination via `Link` headers with bounded page caps.
- Contribution-role distinctions implemented: repo owner / maintainer (COLLABORATOR permission) / individual contributor / bot accounts (type=Bot or `[bot]` suffix) — founder attribution is never inferred from commits alone.

## Website (`website-adapter`)
- Server-side fetch through the SSRF-guarded fetch layer; redirects re-validated; content-type restricted to text/html, bounded size (512 KB), 10s timeout.
- Extracts: `<title>`, meta description, og: fields, JSON-LD where present; stored as EvidenceSnapshot with content hash.
- Sites that block server-side fetches (e.g., 429 from aggressive CDNs — observed for solana.com) produce honest `PROVIDER_BLOCKED` states; no retry storms.

## Solana (`solana-adapter`, `@solana/kit@8.6.0`)
- RPC: `SOLANA_RPC_URL` (default `https://api.mainnet-beta.solana.com`, measured healthy). Helius indexed provider: `HELIUS_API_KEY` config-gated upgrade (not available in sandbox — adapter contract + honest UNAVAILABLE state implemented, integration NOT claimed complete).
- Read paths implemented with kit: `getHealth`, `getSlot`, `getAccountInfo` (mint authority, freeze authority, decimals, extensions via SPL Token program data), `getSignatureForAddress` bounded history, `getTokenLargestAccounts`.
- Every observation records: data source, slot, observation time, provider limitations. Wallet associations only recorded when defensible evidence exists.

## Jupiter (`jupiter-adapter`)
- Price API V3 (`/price/v3?ids=`) for token prices + liquidity context — measured live in sandbox.
- Quote API V3 (`/quote?…`) for the trading preview surface. **Execution (`/order` + `/execute`) is implemented behind a release gate held OFF** pending product/jurisdiction/provider/security review per §8.11 — the adapter code exists but the capability flag is hard-off in this deployment.
- Quote expiry and slippage surfaced; market snapshots stored with `asOf`.

## AI engine (`ai-engine`)
- `z-ai-web-dev-sdk` (server-only) chat completions power the research analyst. Retrieval is evidence-grounded; citations validated; injection-stripping applied to source content. Model cost/failure logged per run.

## Email
- Not configured in sandbox. Verification/reset tokens are generated and stored; delivery endpoints return `EMAIL_UNAVAILABLE` honestly rather than simulating sends.

## Capability flags
| Flag | Default | Effect |
| --- | --- | --- |
| `GITHUB_TOKEN` | unset | GitHub collection runs → RATE_LIMITED honest state |
| `SOLANA_RPC_URL` | public RPC | Real onchain reads |
| `HELIUS_API_KEY` | unset | Indexed provider marked unavailable |
| `JUPITER_MODE` | `lite` | Real price/quote reads; execution gated |
| `TRADING_ENABLED` | `false` | Execution endpoints refuse + UI shows gated state |
| `BILLING_PROVIDER` | unset | Billing surfaces show configuration-required state |
| `EMAIL_*` | unset | Verification/reset delivery shows EMAIL_UNAVAILABLE |

## Billing provider (`src/lib/domain/billing/stripe.ts`, stripe@23)

Real Stripe integration, config-gated, built increment 3:
- **Checkout** `POST /api/v1/billing/checkout` (workspace ADMIN+): validates the plan is purchasable, requires `STRIPE_PRICE_<CODE>`, creates a subscription-mode Checkout Session with server-side metadata (`workspaceId` + `planCode`) so webhook binding never trusts client input. Redirect URLs come only from the origin allowlist (F-6 fix).
- **Portal** `POST /api/v1/billing/portal` (ADMIN+): Stripe Customer Portal via the workspace's stored subscription's customer.
- **Webhook** `POST /api/v1/billing/webhook` (public, no auth): timing-safe HMAC over the raw body; insert-first idempotency ledger (`BillingWebhookEvent`, unique event id); handles `checkout.session.completed`, `customer.subscription.created/updated/deleted` → `Subscription` upsert keyed `(provider, providerRef)`; transient failures release the claim so Stripe retries reprocess; permanent payload failures are recorded FAILED and acked (no infinite retry).
- **Status** `GET /api/v1/billing/status` + capability registry: honest CONFIGURATION_REQUIRED with the exact missing env names when unconfigured; no payment state is ever simulated.
- Unconfigured surfaces: Settings → Billing lists missing env vars (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_RESEARCHER|PROFESSIONAL|TEAM`); footer status reads "billing: not configured".

## GitHub token posture (increment 3 confirmation)
- `GithubAdapter` reads `GITHUB_TOKEN` (Bearer) — 5,000 req/h authenticated vs 60 req/h unauthenticated (shared egress quota measured exhausted).
- Surfaced in: `/api/v1/providers` (configured + rate-limit headers), capability registry (`githubCollection.level: AUTHENTICATED|UNAUTHENTICATED_RATE_LIMITED` with `requiredEnv`), admin overview (`integrations.githubToken`), sidebar footer.
- Adding the token is operator-only configuration: set `GITHUB_TOKEN` in the environment; no code change needed; the adapter picks it up at process start.
