# FoundrySignal Repo Hygiene Report — C-1 (2026-11-17)

## Commit
- `af56027` `chore: untrack local env, secrets and legacy artifacts (C-1)` on `main` (local only; no remote configured, nothing pushed).
- Note: an intermediate local commit `f85f71b` was created then immediately undone via `git reset --soft HEAD~1` because `git commit -- <pathspec>` re-materialized the working-tree `.env` into a commit. It was never pushed and is orphaned; final commit contains only deletions + `.gitignore` + `docs/DEPLOYMENT.md`.

## Untracked (kept on disk, `git rm --cached` only)
- `.env` (contained live credentials; PAYOUT_WALLET was set/updated locally, value never printed/logged)
- `db/custom.db` (856 KB SQLite, personal data)
- `upload/` (3 spec dumps, ~135 KB)
- `tool-results/read_1794761704216_79ab26e94e58.txt` (44 KB)
- No tracked `*.log`, `test-fs.db`, `server.log`, `dev.log`, `dev.out.log`, `build.log` found.

## .gitignore
Added `# FoundrySignal operator artifacts` block: `db/custom.db`, `upload/`, `tool-results/`, `test-fs.db`, `*.log`. Existing `.env*` + `!.env.example` retained.

## Verification
- `git ls-files | grep -E '^(\.env|db/|upload/|tool-results/)'` → empty.
- `git ls-files | grep -Ei '(personal|secret|\.db$|\.log$|ghp_|re_|GOCSPX|\.env)'` → empty.
- `.next/standalone/.env` is not tracked (`.next/` ignored).

## DEPLOYMENT.md
Added under "Build & run (sandbox)": `bun x prisma migrate deploy` (includes 20261117_roles_invitations_verification).

## Honest status / required operator action
- Secrets are untracked going forward but REMAIN in git history and in any prior clones/build artifacts (e.g. `.next/standalone/.env` on disk). They must be considered compromised until rotated.
- Rotate at each provider dashboard: RESEND_API_KEY, GITHUB_TOKEN, GITHUB_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_CLIENT_SECRET, HELIUS_API_KEY, MFA_ENCRYPTION_KEY.
- History was NOT rewritten; keys were NOT rotated (not possible from this environment).
- ~75 pre-existing uncommitted WIP files from other workers were left untouched and NOT committed.
- Working tree still contains `.env` and `db/custom.db` on disk (intentionally kept).
