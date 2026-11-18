# Deploy Run — 2026-11-17

> Evidence-only record. Every value below was captured from a command run in
> this session against `D:/AI AZIMARA(AAA)/FoundrySignal`.

## 1. Environment (discovered, not assumed)

| Fact | Value |
|---|---|
| Git HEAD | `84a9149 chore: ignore local prisma/db copy and stray debug script` |
| Working tree at start | clean (`git status --porcelain` returned nothing) |
| OS / shell | win32 10.0.26300, bash 5.3 |
| Container runtime | Docker 29.6.2 (no podman) |
| Containers | one: `fs-pg` (`postgres:18`), `0.0.0.0:5433->5432/tcp` — the dev DB |
| App container | **none** — no image serves this app |
| Dockerfile / compose | **none in repo** (searched `Dockerfile*` and `*compose*.y*ml`, depth 2) |
| pm2 / ecosystem file | none |
| Serving process at start | **none** — nothing listening on :3000, :3100 or :81 |
| Caddy | not installed, not running (only the Caddyfile template exists) |
| Runtime mechanism | host Bun process running the Next.js standalone server |
| Documented start | `"start": "NODE_ENV=production bun .next/standalone/server.js"` (package.json) |
| Repo deploy scripts | `.zscripts/{build,dev,start}.sh` — written for a Linux `/home/z/my-project` sandbox + Caddy; not applicable to this host |
| DATABASE_URL reachability | ok (Prisma `$queryRaw select 1` succeeded) |
| DB (from `prisma migrate status`) | PostgreSQL database `foundrysignal`, schema `public` at `127.0.0.1:5433` |

Conclusion: the real runtime is a **single host Bun process serving
`.next/standalone/server.js` on :3000**, with Postgres in the `fs-pg`
container. No container-based app deployment exists to restart, so no
Dockerfile was invented.

## 2. Migrations

`bun x prisma migrate status` **before** any action:

```
4 migrations found in prisma/migrations
Database schema is up to date!
```

Per-row check of `_prisma_migrations`:

| migration | finished | rolled back |
|---|---|---|
| 20261116_init | yes | no |
| 20261116_usdc_checkout | yes | no |
| 20261117_roles_invitations_verification | yes | no |
| 20261117091122_rate_limit_buckets | yes | no |

**Both migrations named in the ticket were already applied to this database
before this run**, contrary to the ticket's premise. `bun x prisma migrate
deploy` was still executed (idempotent) and returned `No pending migrations
to apply.` with exit 0. No `db push`, no `reset`, no `--accept-data-loss`, no
migration files edited.

`bun x prisma generate` → `✔ Generated Prisma Client (v6.19.2)`.

Target tables present (`information_schema.tables`, schema `public`):
`MembershipInvitation, RateLimitBucket, VerificationToken`.

## 3. Build & test gates

| Gate | Command | Result |
|---|---|---|
| Install | `bun install --frozen-lockfile` | exit 0, `Checked 914 installs across 980 packages (no changes)` |
| Types | `bun x tsc --noEmit` | exit 0 |
| Tests | `bun test` | `181 pass`, `0 fail`, 338 assertions, 9 files |
| Build | `bun run build` | exit 0; `.next/standalone/server.js` produced; `copy-build-assets` succeeded |

One transient failure is worth recording: the first rebuild after the code fix
died with
`EPERM: operation not permitted, unlink '.next/standalone/node_modules/.prisma/client/query_engine-windows.dll.node'`
because the **still-running** server held the Prisma engine DLL open. After
stopping the server the rebuild exited 0. There was **no** stale
`.next/lock` — that failure mode did not occur.

`tsc`, `test` and `build` were re-run after the code change in §5 and were
green again (181/181).

## 4. Restart

Nothing was serving the app at the start of the run, so the documented path
was used:

```
NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 bun .next/standalone/server.js
```

- First start was a session-managed background job (`fs-app-3000`). That job
  was reaped when the session supervisor released it (exit code 0), taking
  the server down — see "Durability" below.
- Final start is **detached from the supervisor**: `Start-Process` on
  `C:\Users\HP\.bun\bin\bun.exe` with the script path quoted (the project
  directory contains a space, `D:/AI AZIMARA(AAA)/FoundrySignal/...`, which
  bun otherwise splits into `D:/AI`), cwd = project root, stdout/stderr
  redirected to `server.log` / `server.err.log`, hidden window.
- PID **30988**; `server.err.log` empty.
- Next.js 16.4.6, `Ready in 0ms`, `Running next.config took 5ms`,
  `Worker loop registered and started`.
- Listener: `TCP 0.0.0.0:3000 LISTENING PID 30988` — **exactly one** bound
  listener on :3000, no orphan duplicate and no second process from the
  earlier start/stop cycles (all earlier attempts exited on
  `Module not found`).
- Process left running at the end of the run.

## 5. Defect found and fixed during the run

The rate-limit burst test returned **500** for the first 60 requests instead
of a 4xx. Root cause: 10 call sites use raw `Schema.parse(...)`
(e.g. `src/lib/auth/service.ts:173`, `loginUser`). A `ZodError` is not an
`ApiHttpError`, so `handler()` in `src/lib/contracts/http.ts` fell through to
the generic `INTERNAL` branch and answered 500 for what is a caller error.

Fix (single central point, no per-call-site churn): `handler()` now maps
`ZodError` to the existing `VALIDATION_FAILED` envelope (→ 422), matching what
explicit `ApiHttpError("VALIDATION_FAILED", …)` throws already produced.

```
if (err instanceof ZodError) { … fail("VALIDATION_FAILED", message, …) }
```

No test depended on the 500 behaviour. After the fix: same request returns
`422` with `{"code":"VALIDATION_FAILED","message":"email: Invalid input: …"}`.

## 6. Smoke results (real HTTP, `127.0.0.1:3000`)

| Request | Status | Body bytes |
|---|---|---|
| `/` | 200 | 65,817 |
| `/pricing` | 200 | 61,998 |
| `/faq` | 200 | 67,017 |
| `/terms` | 200 | 66,287 |
| `/security` | 200 | 51,165 |
| `/api/v1/health` | 200 | 352 |
| `/api/v1/capabilities` | 200 | 357 |
| `/sitemap.xml` | 200 | 2,654 |
| `/.well-known/security.txt` | 200 | 247 |

Health payload: `solanaRpc.health = HEALTHY`, `jupiter.health = HEALTHY`
(slot 470498582 observed on the first probe).

`/api/v1/capabilities` — `billing` says exactly:

```json
"billing": {"available": true}
```

Full capability object: `public: true`, `tradingExecution: {available:false}`,
`githubCollection/solanaOnchain/marketData/email: {available:true}`. Grep for
`key|secret|token|passw` over the response body: **0 matches** — no secrets
leaked.

`/sitemap.xml` contains `/terms`, `/security`, `/security-disclosure`, `/faq`.

`/.well-known/security.txt`:
```
Contact: mailto:security@foundrysignal.aiazimara.com
Expires: 2027-11-17T00:00:00.000Z
Preferred-Languages: en
Canonical: https://foundrysignal.aiazimara.com/.well-known/security.txt
Policy: https://foundrysignal.aiazimara.com/security-disclosure
```

### CSP

Exactly **one** `content-security-policy` header, contains a per-request
nonce, and `script-src` has **no** `unsafe-inline`:

```
content-security-policy: default-src 'self'; script-src 'self' 'nonce-vjQhySnwEBkyKPYHW1HjJw==' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'
```

(`unsafe-inline` appears only in `style-src`, which the ticket does not
constrain.)

### Rate limiting

65 × `POST /api/v1/auth/login` with `-d '{}'`:

```
422 ×56 then 429 ×9
422 422 … 422 429 429 429 429 429 429
```

The write limiter is 60 mutations / 60 s per key (`RATE_LIMITED_MAX = 60` in
`src/lib/contracts/http.ts`); the 429s begin at the 57th request of this run
because 4 earlier requests had already been counted in the same window by the
preceding probe. Note the first 56 are **422** (validation), not 500 — the §5
fix in place.

A second burst with a **well-formed but wrong** credential body
(`{"email":"nobody@example.com","password":"wrongpass123"}`) showed the
endpoint's own throttle layered on top:

```
401 ×8 then 429 ×55
```

That matches `MAX_ATTEMPTS = 8` per `email|ip` in
`src/lib/auth/service.ts` — the documented intent (8 attempts, then
lockout), not a defect.

### RateLimitBucket persistence

```
RateLimitBucket rows: 1
key = write:local  count = 60  windowStart = 2026-11-17T10:25:22.259Z  expires = 2026-11-17T10:26:22.259Z
```

Read at 10:25:49 UTC — inside the live window, so the table is actively
written by the limiter, not stale. A follow-up POST returned 429, confirming
the row gates traffic.

## 7. Left undone / notes

- **Migrations were already applied before this run.** Nothing pending was
  found; `migrate deploy` confirmed rather than changed the state. If a
  *different* database (staging/prod) is the real target, it was not touched —
  no such environment exists on this host.
- **No container image for the app.** There is no Dockerfile or compose file,
  so no image was rebuilt and `fs-pg` (the database) was not restarted.
- **Caddy was not started.** `.zscripts/start.sh` runs Caddy on :81 as the
  front door, but Caddy is not installed on this host and the ticket's smoke
  target is the served app port. The app is reachable on :3000 only; :81 is
  down by design of this run.
- `.zscripts/start.sh` / `build.sh` target a Linux sandbox
  (`/home/z/my-project`, `db/custom.db`) and would fail here; the documented
  `bun .next/standalone/server.js` path was used instead.
- The app process runs detached from this session (PID 30988 — see
  "Durability" below), so it outlives the shell that started it. It still
  will not survive a host reboot: there is no service supervisor
  (pm2/systemd/NSSM) configured on this host.
- `.smoke/` holds the captured response bodies from this run.

## 8. Durability

The session-managed job `fs-app-3000` exited with code 0 when the supervisor
released it, which stopped the server. It was restarted detached
(`Start-Process` + `-WindowStyle Hidden`, PID 30988) so it is no longer tied
to this session's job table.

Post-restart verification on the detached process:

| Check | Result |
|---|---|
| `/`, `/pricing`, `/faq`, `/terms`, `/security` | all 200 |
| `/api/v1/health`, `/api/v1/capabilities` | both 200 |
| `/sitemap.xml`, `/.well-known/security.txt` | both 200 |
| CSP header count on `/` | 1 |
| `capabilities.data.billing` | `{"available":true}` |
| 3 × `POST /api/v1/auth/login` with `{}` | `422 422 422` (the §5 fix, not 500) |
| Listening socket | `0.0.0.0:3000 LISTENING PID 30988`, single |
| `server.err.log` | empty |

Starting it took three attempts, all recorded here because the failure mode
is easy to repeat: a relative script path gave `Module not found
".next/standalone/server.js"`; an unquoted absolute path gave `Module not
found "D:/AI"`; the quoted absolute path works. The project directory's
space makes quoting mandatory.
