# FoundrySignal — Rebuild & Deploy Report

Date: 2026-11-17

## Gate results

| Step | Result |
|---|---|
| 1. git status --porcelain | clean (untracked docs/FINAL_STATUS.md pre-existing) |
| 2. bun install --frozen-lockfile | exit 0 |
| 3. bun x tsc --noEmit | exit 0 |
| 4. bun test | 181 pass, 0 fail (338 expect calls) |
| 5. bun run build | exit 0 |
| 6. Existing server on :3000 | none |
| 7. Production server start | ready |
| 8. Smoke routes | all 200 |
| 9. CSP header | exactly 1; contains nonce-; no unsafe-inline in script-src |
| 10. Rate limiting (65 rapid POSTs) | 429s observed (5) |
| 11. Server stopped | port free |

## Smoke routes
- GET / → 200
- GET /pricing → 200
- GET /faq → 200
- GET /terms → 200
- GET /security → 200
- GET /api/v1/health → 200 HEALTHY
- GET /api/v1/capabilities → 200
- GET /sitemap.xml → 200
- GET /.well-known/security.txt → 200

## Notes
- /api/v1/health reports HEALTHY for solanaRpc and jupiter.
- Port 3000 free at end.
