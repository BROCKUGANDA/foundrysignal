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

Requires PostgreSQL 18 (local container shown):

```bash
bun install
docker run -d --name fs-pg -e POSTGRES_PASSWORD=fs_local_2026 \
  -e POSTGRES_USER=foundrysignal -e POSTGRES_DB=foundrysignal -p 5433:5432 postgres:18
# .env: DATABASE_URL=postgresql://foundrysignal:fs_local_2026@127.0.0.1:5433/foundrysignal
bun x prisma migrate deploy
bun run dev            # http://localhost:3000
bun run test           # 244 unit/integration tests (bun test --isolate)
bash scripts/smoke-golden-path.sh   # full E2E golden path incl. trading gates + pricing
```

`bun run test` maps to `bun test --isolate`. The flag is required: Bun's
`mock.module()` is process-global, so the checkout boundary suite's in-memory
`db` mock would otherwise leak into every other test file in the same process.
Each file gets a fresh module registry under `--isolate`.

Two-factor authentication (TOTP) is implemented under Settings → Security when
`MFA_ENCRYPTION_KEY` is set: authenticator enrollment with QR/secret, single-use
recovery codes, and a login step-up challenge. The secret is AES-256-GCM encrypted
at rest with the user id as AAD; a single-use challenge and replay-protected time
step prevent bypass and reuse. Enrollment requires re-entering the password.
`bun scripts/smoke-mfa.ts` exercises the full flow over HTTP against a running
server.

GitHub/Google OAuth sign-in is also implemented: authorization-code + PKCE S256,
single-use state, and account linking only through a provider-verified email.
Buttons appear only for configured providers; register the callback URLs shown
in `.env.example` with each provider. `bun scripts/smoke-oauth.ts` checks the
routes over HTTP. Accounts with TOTP still require the second factor after OAuth.

Registration records explicit Terms of Service acceptance with a version stamp;
OAuth-created accounts still need a consent step before public launch. A
checkout watcher settles pending USDC intents server-side so a payment is not
lost when the payer closes the tab. The public `/accessibility` page states the
current state honestly and does not claim WCAG conformance before an audit.
See `docs/COMMERCIALIZATION_LEGAL_PACK.md` and `docs/OPERATIONS_READINESS.md`
for the remaining commercialization and operational gates.

**Operator decision on trading:** `.github/workflows/deploy.yml` sets
`TRADING_ENABLED=true` by explicit operator decision (commit `f3cf2d1`). That
flag alone does not enable execution — all four review gates must be APPROVED
and the kill switch CLEAR. Verify with `GET /api/v1/trading/gates` before any
public launch.

Optional capability env vars (honest states when absent — never simulated):
`GITHUB_TOKEN` (repository collection) · `SOLANA_RPC_URL` · `HELIUS_API_KEY` ·
`PAYOUT_WALLET` + `USDC_MINT` (onchain USDC checkout) · `RESEND_API_KEY` ·
`TRADING_ENABLED=false` (execution gated pending product/jurisdiction/provider/
security review).

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
