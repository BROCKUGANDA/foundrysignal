# FoundrySignal — Implementation Plan

**Status:** Active · **Generated:** 2026-11-15 · **Owner:** founding staff engineer

## 0. Repository audit summary (Phase Zero)

Executed audit of the existing repository before any modification, per Execution Rule 1.

| Aspect | Finding | Action |
| --- | --- | --- |
| Framework | Next.js 16 (App Router) + React 19 + TypeScript 5, Bun runtime | Retained. Not rebuilt. |
| Package manager | Bun 1.3.14 with lockfile | Retained |
| Styling | Tailwind CSS 4 + full shadcn/ui (New York) set, Lucide icons | Retained as base primitives |
| Data layer | Prisma 6, SQLite (`db/custom.db`), boilerplate `User`/`Post` models | Boilerplate replaced with FoundrySignal domain schema |
| Auth | next-auth v4 present but unconfigured | Replaced with first-party session auth (bcrypt + HttpOnly session cookies) — full control over RBAC, tenant isolation, and audit; no third-party dependency for the security-critical path |
| State/query | TanStack Query 5, Zustand 5, react-hook-form + zod | Retained (all are in the target stack) |
| Motion | framer-motion 12 | Retained |
| Existing routes | `/` page (boilerplate), `/api` health route | Replaced/extended |
| Tests | None | `bun test` adopted; tests written alongside features |
| Known deps risk | next-auth unconfigured, boilerplate Post model | Removed in schema rewrite |

### Live provider reachability (measured 2026-11-15, not assumed)

| Provider | Result | Consequence |
| --- | --- | --- |
| Solana public RPC (`api.mainnet-beta.solana.com`) | `getHealth → "ok"` | Real onchain intelligence ships via `@solana/kit` against public RPC; dedicated RPC/Helius becomes config-gated upgrade |
| Jupiter Lite API (`lite-api.jup.ag/price/v3`) | Live SOL price returned | Real market data adapter ships against Jupiter Lite; Pro API is config-gated |
| GitHub REST API | Reachable, but shared egress IP is unauthenticated-rate-limited | Adapter implements real rate-limit-header handling; meaningful throughput requires `GITHUB_TOKEN` (5000 req/h) — surfaced as honest capability state, never faked |
| Arbitrary websites | Reachable; some sites return 429/block | Website collector implements honest fetch-failure states |

## 1. Environment adaptation register (honest, documented)

The master directive targets PostgreSQL + pgvector and Redis + BullMQ. This sandbox provides a single Node/Bun process with SQLite. Deviations are explicit and carry a written migration path:

| Target | Sandbox implementation | Production migration path |
| --- | --- | --- |
| PostgreSQL + pgvector | Prisma + SQLite (same relational schema; vector storage deferred, tracked in KNOWN_LIMITATIONS) | Swap `datasource db` provider to `postgresql` in `prisma/schema.prisma`; regenerate migrations. Schema written to be PG-portable (no SQLite-only types except `String` JSON columns) |
| Redis + BullMQ | Durable DB-backed job queue with the full job contract (idempotency keys, bounded retries, exponential backoff + jitter, timeouts, dead-letter, failure classification) run by the in-process worker loop | Replace `src/lib/jobs/queue.ts` driver with BullMQ; job payloads and handlers are driver-agnostic by design |
| Multi-process workers | Single-process worker loop with DB job leases | Same handlers run in `apps/worker` process in production |
| Email delivery | Not configured | `RESEND_API_KEY`/SMTP required; email-verification and password-reset tokens generated and stored but delivery marked `EMAIL_UNAVAILABLE` |

## 2. Route topology constraint

The preview gateway exposes exactly one user-visible page route (`/`). Therefore the entire product — marketing site, authentication, and platform — is delivered as one Next.js page (`src/app/page.tsx`) hosting a client-side application shell with section-level navigation, backed by versioned REST APIs under `/api/v1/*`. This mirrors the spec's information architecture (marketing / auth / platform) inside a single-route shell. Production deployment restores the multi-route structure from the same view components.

## 3. Sprint plan (dependency-ordered, per §18)

- **Sprint 0 — Foundations:** domain schema + push, design tokens, fonts, logo/glyph family, API envelope + request IDs, session auth + RBAC + audit log, provider framework (circuit breaker, rate-limit tracking), durable job queue, `bun test` harness. ✅
- **Sprint 1 — Venture discovery:** venture registry service, ingestion intake (URL → real collectors), directory search/filter/sort, dossier data layer, persistent watchlists. ✅
- **Sprint 2 — Founder & development intelligence:** GitHub adapter (repos, commits, releases, contributors, languages, rate-limit headers), repository observations, founder–identity separation rules. ✅
- **Sprint 3 — Evidence engine:** claims, evidence sources, snapshots (content hash), verification classification state machine, freshness, evidence explorer. ✅
- **Sprint 4 — AI research:** retrieval over tenant-visible evidence, grounding-first prompt architecture, citation validation against retrieved records, contradiction detection, 11-section report, export. Real LLM via `z-ai-web-dev-sdk` (server-only). ✅
- **Sprint 5 — Solana intelligence:** `@solana/kit` RPC adapter, mint metadata/authority read paths, onchain observations (source, slot, observation time), Jupiter market snapshots. ✅
- **Sprint 6 — UX completion:** every-state coverage (loading/empty/partial/stale/error/degraded…), motion tokens, reduced motion, mobile responsiveness, exports, accessibility. ✅
- **Sprint 7 — Wallet & trading surface:** Wallet Standard detection, `@solana/react` integration, Jupiter quote preview, transaction record model; **execution release gate held OFF** per §8.11 and launch-gate P3. ✅ (gated)
- **Sprint 8 — Commercialization foundations:** plans/entitlements tables (prices configurable, not hardcoded), API keys + metering primitives, admin console (queues, provider health, audit, evidence review), runbooks. ✅

## 4. Dependency map

```
schema ─┬─ auth ──── rbac ─── admin
        ├─ envelope ─ every /api/v1 module
        ├─ providers(github/website/solana/jupiter) ─ collectors ─ evidence
        ├─ evidence ─┬─ dossier read APIs ─ dossier UI
        │            └─ retrieval ─ ai-research ─ reports UI
        └─ jobs ── all collectors + alert evaluation + snapshots
wallet(@solana/react) ── quote adapter ── trading (GATED OFF)
```

## 5. Verification policy

- `bun run lint` after every structural change.
- `bun test` unit/integration suites per domain service.
- Agent-browser E2E over the golden path (register → ingest real venture → dossier → evidence → AI report → watchlist) before delivery.
- dev.log inspected for runtime errors at every checkpoint.
- No test result is reported that was not actually executed and observed.
