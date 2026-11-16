# FoundrySignal — Acceptance Criteria

## MVP golden journey (must work end-to-end with real collected data)
| # | Criterion | Verification |
| --- | --- | --- |
| A1 | Researcher can register and authenticate (real sessions, hashed credentials, revocable) | browser E2E + tests/authorization.test.ts |
| A2 | Researcher submits a real venture (website/GitHub URLs); collectors fetch real public data and persist evidence with provenance | browser E2E on a real public repo/org; verify DB rows carry provider+hash+timestamps |
| A3 | Discovery directory lists ingested ventures with search, category/ecosystem filters, sort, and explains result origin | browser E2E |
| A4 | Venture dossier renders header + Overview/Founders/Product/Development/Evidence/Onchain/Markets/History/Reports tabs; each tab loads independently and shows honest states when data is unavailable | browser E2E; deliberately open tabs for data with no provider coverage |
| A5 | Evidence records show source URL, provider, collection/observation times, content hash, verification class; claims are classified by the evidence engine only | unit tests (evidence-engine.test.ts) + dossier UI |
| A6 | AI analyst answers from retrieved evidence with resolvable citations; unsupported points return INSUFFICIENT_EVIDENCE; runs persist; reports exportable | browser E2E + tests/ai-citation-validation.test.ts |
| A7 | Watchlists persist; saved searches persist; alert rules evaluate on observation deltas | browser E2E + tests |
| A8 | Onchain tab performs real `@solana/kit` reads (health/slot/mint) when a mint is associated; observations record slot + provider | integration test against public RPC + UI |
| A9 | Markets tab shows real Jupiter price/liquidity snapshots with asOf timestamps; kept separate from evidence | integration test + UI |
| A10 | Every async surface implements loading/empty/error/degraded states; no unbounded spinners; provider outage cannot crash unrelated dossier tabs | browser E2E + component states |
| A11 | Protected endpoints reject unauthenticated and cross-tenant access | tests/authorization.test.ts |
| A12 | Admin console shows queue health, provider status, audit log; admin corrections create new records, never mutate originals | UI + tests |

## Sprint 7 gate
| # | Criterion |
| --- | --- |
| B1 | Wallet Standard detection surfaces honest "no wallets detected" in sandbox; @solana/react wiring compiles and is exercised |
| B2 | Quote preview uses real Jupiter quotes with expiry/slippage/price-impact display |
| B3 | Execution endpoints refuse while `TRADING_ENABLED=false`; UI shows gated state |
| B4 | Transaction record model handles uncertain submission states without replay |

## Definition of Done mapping
Frontend ✓ API contract ✓ backend logic ✓ persistence ✓ authorization ✓ provider integration (where credentials permit — honest otherwise) ✓ loading/empty/error states ✓ logging ✓ unit tests ✓ integration tests ✓ E2E (agent-browser golden path) ✓ accessibility (keyboard, labels, contrast, reduced motion) ✓ documentation ✓
