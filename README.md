# FoundrySignal

**See the builders. Verify the work. Understand the market.**

The intelligence layer for onchain venture capital — an evidence-driven research
platform for early-stage Solana ventures. Working name pending trademark clearance.

## What this is

A commercial-grade venture research terminal: researchers register real ventures,
collectors fetch real public data (websites, GitHub, Solana onchain, Jupiter markets),
every claim is traced to content-hashed evidence, and an AI analyst produces
citation-validated reports that say "insufficient evidence" instead of inventing facts.

## Quick start

```bash
bun install
bun run db:push        # schema
bun run dev            # http://localhost:3000
bun test               # 41 unit/integration tests
bash scripts/smoke-golden-path.sh   # full E2E golden path incl. trading gates + pricing
```

Optional capability env vars (honest states when absent — never simulated):
`GITHUB_TOKEN` (repository collection) · `SOLANA_RPC_URL` · `HELIUS_API_KEY` ·
`BILLING_PROVIDER` · `RESEND_API_KEY` · `TRADING_ENABLED=false` (execution gated
pending product/jurisdiction/provider/security review).

Registration asks who you are (investor/VC, founder, analyst, LP, other). Account
type tailors onboarding only — platform and workspace roles are assigned
server-side and cannot be self-selected.

## Documentation

- docs/IMPLEMENTATION_PLAN.md — audit + plan + dependency map
- docs/ARCHITECTURE.md · docs/DOMAIN_MODEL.md · docs/DATA_METHODOLOGY.md
- docs/SECURITY_MODEL.md · docs/PROVIDER_INTEGRATIONS.md · docs/DEPLOYMENT.md
- docs/ACCEPTANCE_CRITERIA.md · docs/KNOWN_LIMITATIONS.md · docs/DELIVERY_REPORT.md

## Research information only — not investment advice.

Trading execution is disabled pending review gates. No token launchpad is operated.
Trust classifications are never for sale.
