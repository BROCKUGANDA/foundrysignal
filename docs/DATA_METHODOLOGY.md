# FoundrySignal — Data Methodology

## Principles
1. **Provenance first.** Every persisted external datum carries: original source URL (where applicable), provider, source type, collection time, observation time, content hash (SHA-256), collector version, transformation version.
2. **Append-only observations.** Re-collection produces a new snapshot; nothing overwrites an original observation. Corrections (human or admin) create new auditable records referencing the original.
3. **No fabricated state.** Verification classification is derived exclusively from linked evidence by the evidence engine. Missing data is `UNKNOWN` / `INSUFFICIENT_EVIDENCE`, never invented.
4. **Providers are not interchangeable.** Data from different providers is never merged as if equivalent; each observation records which provider supplied it.

## Collection policies (starting values)

| Data category | Method | Freshness policy |
| --- | --- | --- |
| Venture website | Server-side fetch with SSRF guard, metadata extraction | On intake; re-check daily or on demand |
| Repository metadata | GitHub REST, rate-limit-header aware | On association; webhook in production; daily reconciliation |
| Releases/tags | GitHub REST | On repo observation |
| Commit/contributor activity | GitHub REST | On repo observation; periodic refresh |
| Onchain mint/authorities | `@solana/kit` JSON-RPC read calls | On token association; re-observe on change events |
| Market price/liquidity | Jupiter Price API V3 | On demand with TTL; snapshots recorded with `asOf` |
| Founder identity | Only evidence-backed links; never inferred from username equality | Manual + founder-response workflow |

## Rate limits and resilience (measured behavior)
- GitHub: unauthenticated 60 req/h per egress IP (observed exhausted on this sandbox IP); authenticated 5000 req/h. Adapter reads `x-ratelimit-remaining` / `x-ratelimit-reset` headers, honors secondary limits, backs off exponentially with jitter, and reports `RATE_LIMITED` as a first-class provider state.
- Solana public RPC: shared community rate limits; adapter performs bounded read calls, records slot + health, and exposes degraded state. Dedicated RPC (`SOLANA_RPC_URL`) raises throughput; Helius indexed provider is a config-gated upgrade.
- Jupiter Lite API: unauthenticated, low rate; suitable for on-demand quotes and snapshots, not polling loops.

## Verification classification rules (evidence engine)
- `INDEPENDENTLY_CORROBORATED` — ≥2 independent source types support the claim with no contradiction.
- `SOURCE_CONFIRMED` — 1 authoritative source (provider API observation) supports it.
- `SELF_ASSERTED` — claim originates from the venture's own material (website/README/social) only.
- `FOUNDER_PROVIDED` — submitted through issuer/founder response workflow.
- `DISPUTED` — evidence links include a CONTRADICTS relation.
- `STALE` — newest supporting evidence exceeds freshness policy for its category.
- `UNKNOWN` — no linked evidence. Recomputed on every evidence mutation.

## Change intelligence
Diffing two snapshots of the same source (repository metadata, mint authority, website content hash) produces change records; alerts are evaluated against these deltas.

## AI research grounding rules
- Retrieval restricted to evidence the requesting tenant may see.
- Prompt assembly separates instructions from untrusted source content (delimiter + instruction-stripping normalization); source content is data, never instructions.
- Model output citations must resolve to retrieved evidence ids; a report whose citations fail validation is marked `VALIDATION_FAILED`, not published.
- Absence of evidence produces explicit "insufficient evidence" statements.
- No investment advice, price predictions, or unverified claims are generated; risk sections are limited to documented, source-linked observations.

## Data retention
Snapshots are retained for research history. Workspace deletion cascades user-owned objects; original external observations may be retained anonymized per retention policy (documented, configurable).
