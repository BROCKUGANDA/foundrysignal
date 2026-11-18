# Roles fix — reachable, admin-manageable roles + seeded role content

Date: 2026-11-17 · Author: FSRolesFix (worker)

## What changed & why

Every role that previously existed only as a string union is now reachable,
assignable and seeded. All new routes use the shared authz chokepoints
(`requireAuth` / `requireWorkspaceRole` / `requirePlatformRole` from
`src/lib/auth/context.ts`) and `recordAudit` for every privileged change.
No role is self-selectable anywhere in the client. The last-OWNER and
last-PLATFORM_ADMIN guards are enforced server-side and tested below.

## Endpoints added

| Method & path | Authz | Purpose |
|---|---|---|
| POST `/api/v1/workspaces/[id]/invitations` | requireAuth + workspace ADMIN/OWNER (path id must equal active workspace) | Create `MembershipInvitation`; OWNER may invite any role, ADMIN only ANALYST/VIEWER. Token stored as sha256 only. Sends via Resend when configured, else returns `acceptUrl` with `devLink: true` and logs it server-side. 7-day expiry. |
| GET `/api/v1/invitations?workspace=<id>` | requireAuth + workspace ADMIN/OWNER | List pending (unexpired, unrevoked, unaccepted) invitations. |
| POST `/api/v1/invitations/accept` | requireAuth | Token + caller email-hash must match; creates `Membership` (unique `workspaceId+userId`); 409 if already a member; flips the current session's `activeWsId` to the invited workspace; single-use token. |
| DELETE `/api/v1/invitations/[id]` | requireAuth + workspace ADMIN/OWNER | Revoke a pending invitation (idempotent). |
| PATCH `/api/v1/admin/users/[id]/role` | requirePlatformRole(["PLATFORM_ADMIN"]) | Change `platformRole` (USER\|MODERATOR\|PLATFORM_ADMIN). Refuses to demote the last active PLATFORM_ADMIN (409). Audited (`ADMIN_PLATFORM_ROLE`). |
| GET `/api/v1/admin/users` | requirePlatformRole(["PLATFORM_ADMIN","MODERATOR"]) | User list for the admin console (roles, workspaces, joined). |
| PATCH `/api/v1/workspaces/[id]/memberships/[memberId]` | requireAuth + workspace ADMIN/OWNER | Change member workspace role. OWNER: any role. ADMIN: may only manage members currently ANALYST/VIEWER and may assign only ANALYST/VIEWER. Refuses to demote the last OWNER (409). Audited (`WORKSPACE_MEMBERSHIP_ROLE`). |
| POST `/api/v1/account/password` | requireAuth | Verify current password (bcrypt), enforce ≥10 chars, update hash, revoke all *other* sessions. Audited. |
| GET `/api/v1/account/sessions` | requireAuth | List caller's live sessions (revoked/expired excluded), flagging the current one. |
| POST `/api/v1/account/sessions/revoke` | requireAuth | Revoke one of the caller's sessions; revoking the current one clears the cookie too. Audited. |
| POST `/api/v1/claims/[id]/disputes` | requireAuth + workspace ANALYST+ (VIEWER rejected) | Raise DISPUTE / CORRECTION / FOUNDER_RESPONSE against a claim. Reuses `DisputeRecord`. Audited (`DISPUTE_RAISE`). |
| GET `/api/v1/admin/disputes?resolution=OPEN\|…\|ALL` | requirePlatformRole(["MODERATOR","PLATFORM_ADMIN"]) | List disputes (default OPEN) with claim + venture context. |
| PATCH `/api/v1/admin/disputes/[id]` | requirePlatformRole(["MODERATOR","PLATFORM_ADMIN"]) | Mark UPHELD / RESOLVED / REJECTED + optional note; sets resolvedAt. Audited (`DISPUTE_RESOLVE`). |
| POST `/api/v1/auth/verify` | public, single-use | Consume `VERIFY_EMAIL` token (sha256 match, 24h expiry) → sets `User.emailVerifiedAt`. Already-used tokens return success with `alreadyUsed: true` (mail-client prefetch safety). |
| POST `/api/v1/auth/reset` | public, single-use | Consume `PASSWORD_RESET` token (1h expiry) → set new password (≥10) and revoke **all** sessions for the account. Audited. |
| POST `/api/v1/auth/request-reset` | public | Uniform `{sent: true}` response (never leaks account existence); creates token + sends `sendPasswordResetEmail` when the account exists and is ACTIVE. |

Also modified: `GET /api/v1/admin/overview` now includes `integrations.email`
(redacted `emailDeliveryStatus()`), alongside the pre-existing
`integrations.githubToken / billing / tradingExecutionEnv`.

## UI surfaces added

- **/admin** — Integrations panel (redacted configured / not-configured status
  for GitHub token, billing, trading env, email delivery; missing env names are
  shown, secret values never are), Platform Users table with role dropdown
  (disabled for non-PLATFORM_ADMIN; last-admin demotion is refused server-side),
  Pending Invitations for the active workspace (create + revoke; role options
  limited by caller's workspace role), Open Disputes (note + RESOLVED/UPHELD/REJECTED).
- **Settings** — new **Security** section: change password (current-password
  verification, ≥10 chars, revokes other sessions) and an active-sessions list
  with per-session revoke (current session revocation signs you out).
  Sessions are shown by creation/activity time — this deployment's Session
  model does not capture device/user-agent, so no device string is fabricated.
- **Dossier → Evidence tab** — “Raise a dispute or correction” card (claim
  picker, reason, detail). VIEWERs never see it; the server enforces the same.
- **Dossier → Reports tab** — “Export” button per completed report. Calls
  `GET /api/v1/reports/[id]/export` and downloads the markdown via
  Content-Disposition filename. See “Known gaps” — the export endpoint is
  paywall-gated by a concurrent worker's entitlement check.
- **/auth** — now parses `?verify=`, `?reset=`, `?invite=`:
  verify consumes the token on load (result banner + toast, query string then
  stripped); reset shows a new-password form; invite auto-accepts after
  sign-in/register (signed-in users are routed straight to an accept screen).
  Login mode gains “Forgot your password?” → request-reset flow.
- **App shell** — `alertCount` is no longer hardcoded to 0: unread count from
  `/api/v1/alerts/events` (refetch 60s, capped at 99). On error the badge
  hides (count 0) and the failure is logged to the console.
- **Accept invitations** — `src/components/fs/accept-invite.tsx` (full-screen
  accept result) + AuthView integration for signed-out users.
- `/auth` parsing moved into `src/lib/client/routes.ts` (`?invite|verify|reset`).

## Migration

**`20261117_roles_invitations_verification`** (`prisma/migrations/20261117_roles_invitations_verification/migration.sql`)

Adds `MembershipInvitation` (unique `tokenHash`, workspace/email hash index,
7-day TTL enforced in code) and `VerificationToken` (unique `tokenHash`,
`(identifier, action)` index; `action` ∈ VERIFY_EMAIL | PASSWORD_RESET). The
repo previously had **no** `migration_lock.toml`; one was added
(`provider = "postgresql"`). `bun x prisma migrate deploy` applied cleanly to
the dev DB (port 5433) and the client was regenerated.

## Files changed / added

New API routes: `workspaces/[id]/invitations`, `workspaces/[id]/memberships/[memberId]`,
`invitations`, `invitations/accept`, `invitations/[id]`, `admin/users`,
`admin/users/[id]/role`, `admin/disputes`, `admin/disputes/[id]`,
`account/password`, `account/sessions`, `account/sessions/revoke`,
`claims/[id]/disputes`.

New domain/lib: `src/lib/domain/workspaces/invitations.ts` (token create/accept/
revoke/list + role matrix). Modified: `src/lib/auth/service.ts` (register now
issues a VERIFY_EMAIL token and calls `sendVerificationEmail` — delivery
failures never fail registration; response gains `verificationEmailSent`),
`src/lib/domain/email/service.ts` (`sendWorkspaceInvitationEmail`),
`src/app/api/v1/auth/[action]/route.ts` (verify/reset/request-reset),
`src/app/api/v1/admin/overview/route.ts` (integrations.email),
`src/lib/client/routes.ts`, `src/components/fs/app.tsx`, `auth-view.tsx`,
`admin-view.tsx`, `settings-view.tsx`, `dossier-view.tsx`, plus new
`src/components/fs/accept-invite.tsx`.

Seed: `scripts/seed-roles.ts` (idempotent; upserts by email/natural keys),
registered as `bun run db:seed-roles` (also added `db:seed-portfolio`).
Bumps `scripts` in `package.json` only — no dependencies touched.

## Verification (all run 2026-11-17)

- `bun x tsc --noEmit` — clean.
- `bun test` — **135 pass / 0 fail** (6 files; authorization suite included).
- `bun run build` — **green**; all new routes registered as ƒ functions.
- HTTP smoke against a dev server (cookie jars; smoke users deleted afterwards):
  - Invitation: create → list → accept (membership created, session `activeWsId`
    switched to the invited workspace) → re-accept → 409; bad token → 404;
    revoke → idempotent; existing-member invite → 409; ADMIN inviting ADMIN → 403.
  - Membership PATCH: ANALYST caller → 403; ADMIN demotes/restores ANALYST;
    ADMIN assigning ADMIN → 403; ADMIN touching an ADMIN-role member → 403;
    sole-OWNER demotion → 409.
  - Platform role PATCH (temporary PLATFORM_ADMIN): USER→MODERATOR works,
    last-PLATFORM_ADMIN self-demotion → 409, restore OK (demo-admin returned to USER).
  - Disputes: ANALYST raises (201), VIEWER rejected (403), admin lists/resolves.
  - Verify/reset: seeded tokens via HTTP — verify consumes once, second call
    `alreadyUsed`, garbage token → 400; reset issues usable password, all
    sessions revoked; login with new password OK.
  - Reports export: **button wired and verified to the entitlement boundary** —
    the endpoint now returns `PAYMENT_REQUIRED` (Explorer plan excludes
    `reportExport`). See Known gaps.
- Build, tests, typecheck were run after the last code edit; no further edits followed.

## Create / seed a demo workspace with an ADMIN (exact steps)

```bash
# 1) Postgres (per README) — e.g.:
docker run -d --name fs-pg -e POSTGRES_PASSWORD=fs_local_2026 \
  -e POSTGRES_USER=foundrysignal -e POSTGRES_DB=foundrysignal -p 5433:5432 postgres:18
# .env: DATABASE_URL=postgresql://foundrysignal:fs_local_2026@127.0.0.1:5433/foundrysignal

bun install
bun x prisma migrate deploy      # picks up 20261117_roles_invitations_verification
bun scripts/seed-portfolio.ts    # ventures + evidence (needed for watchlist/research seeds)

# 2) Seed the demo team — passwords come from env, never hardcoded:
DEMO_ANALYST_PASSWORD='pick-a-strong-password' \
DEMO_VIEWER_PASSWORD='pick-a-strong-password' \
DEMO_ADMIN_PASSWORD='pick-a-strong-password' \
bun run db:seed-roles

# 3) Run
bun run dev                      # http://localhost:3000
```

Then sign in as `demo-admin@foundrysignal.aiazimara.com` (workspace role ADMIN
in “FoundrySignal Demo Team”, slug `foundrysignal-demo-team`),
`demo-analyst@foundrysignal.aiazimara.com` (ANALYST),
`demo-viewer@foundrysignal.aiazimara.com` (VIEWER) — each with the password you
set in step 2. **Re-running** `db:seed-roles` re-syncs memberships and
passwords to the env values (idempotent upserts by email); a missing env var
skips that user with a clear message and seeds the rest.

Env vars that matter beyond `DATABASE_URL`:
- `NEXT_PUBLIC_SITE_URL` — base URL embedded in invitation accept links.
- `RESEND_API_KEY` (+ `EMAIL_FROM`) — real email delivery for verification /
  password-reset / invitation mails. **Without it**, registration and
  request-reset still work (tokens are stored) but no mail is sent; invitation
  creation returns `devLink: true` with the accept URL in the response and logs
  it server-side; register returns `verificationEmailSent: false`.
- Demo passwords used during this worker's verification were throwaway local
  values; re-seed with your own secrets before exposing any of this outside dev.

To create a **platform** ADMIN (no self-service path exists by design), set
`platformRole = 'PLATFORM_ADMIN'` for the account directly in the DB (or
promote via the admin console once another PLATFORM_ADMIN exists). The
`/admin` console (integrations, user roles, invitations, disputes) is gated
MODERATOR+/PLATFORM_ADMIN server-side.

## Known gaps / notes

1. **Report export is entitlement-gated.** `requireEntitlement(ctx,
   "reportExport")` was added to `src/app/api/v1/reports/[id]/export/route.ts`
   by a concurrent worker (FSMonetizationFix) after this task started — per
   scope (“do not touch billing”) it was left untouched. The Dossier “Export”
   button calls the endpoint and surfaces the server's answer; on a workspace
   without an active subscription (Explorer fallback) the API returns
   `402 PAYMENT_REQUIRED` with feature `reportExport`, which the button shows
   as an error toast. The 200 markdown path is not exercisable on this
   deployment as configured; everything else about the button (fetch, filename
   from Content-Disposition, download, toast) is verified code.
2. **Export button shows for every completed report**, including ones the
   Explorer plan may not export — the button does not pre-check entitlements;
   the server is the enforcement point, per the project's rule.
3. **Sessions list has no device name** — the Session model stores no
   user-agent; the UI labels sessions by creation/activity time instead of
   fabricating a device string.
4. **Verification tokens are single-use** (`usedAt`), 24h (verify) / 1h
   (reset) expiry; expired tokens are rejected with a clear message. Verified
   email delivery requires `RESEND_API_KEY` and a verified from-domain.
5. **Smoke-test artifacts fully removed**: throwaway `@test.local` user and
   memberships deleted, demo-admin restored to `platformRole=USER`, cookie
   jars deleted. Seed disputes raised during smoke were resolved with a note
   (“Closed during verification — seeded test dispute”).
6. `migration_lock.toml` was added because the repo lacked it (`migrate deploy`
   needs it); existing migrations were not modified.
7. Demo workspace content (watchlist, 2 alert rules + 4 events, 1 saved
   search, 3 onboarding notes, 3 research runs + 3 reports, all citing seeded
   evidence) is in the dev DB via `db:seed-roles`, re-runnable safely.
8. `/admin` shows the demo-admin's integrations panel with honest redacted
   states (e.g. GitHub token present → "configured"; TRADING_ENABLED unset →
   "not configured"; email not configured when `RESEND_API_KEY` is empty).
