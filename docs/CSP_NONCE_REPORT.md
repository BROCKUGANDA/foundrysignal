# CSP — nonce-based script-src (C-3 remainder)

**Status: DONE.** `script-src` no longer contains `'unsafe-inline'`. Production
documents get a per-request nonce; every `<script>` element in the served HTML
(app-authored inline scripts, Next.js framework bootstrap, and JSON-LD) carries
`nonce="<the same per-request value>"`. Verified in `next start` (production
build) and in a headless Edge (Chromium) browser.

## Approach

Exactly one CSP per response, emitted by middleware; `next.config.ts` sets no
CSP at all (it previously set a static one with `'unsafe-inline'` — keeping it
would make browsers enforce **both** policies as an intersection and break
nonce'd scripts).

1. **`src/middleware.ts`** (new) — per request, generates a 16-byte CSPRNG
   nonce (`crypto.getRandomValues`, base64), then:
   - forwards it on the **request** headers as `x-middleware-nonce` (read by
     app code via `await headers()`) and as a full
     `Content-Security-Policy` header, which Next.js parses server-side
     (`getScriptNonceFromHeaders`) to auto-nonce its own framework scripts;
   - sets the CSP on the **response** header.
   - Matcher: everything except `_next/static`, `_next/image`,
     `_next/webpack-hmr` (immutable build assets serve no HTML and need no
     CSP). Documents, RSC payloads, API JSON and `security.txt` all pass through.
   - Policy: `script-src 'self' 'nonce-<b64>' 'strict-dynamic'`
     (+`'unsafe-eval'` only when `NODE_ENV !== "production"`, for Turbopack HMR).
     `'strict-dynamic'` is what lets Next's webpack/Turbopack runtime inject
     its chunk `<script>` elements at runtime.
   - Dev-only: `ws:` added to `connect-src` (HMR socket). Prod policy unchanged
     except for the nonce.
2. **`next.config.ts`** — removed the static `Content-Security-Policy` entry;
   all other security headers (`X-Content-Type-Options`, `X-Frame-Options`,
   `Referrer-Policy`, `Permissions-Policy`, COOP, prod HSTS) unchanged.
3. **`src/app/layout.tsx`** — root layout is now `async`; reads the nonce from
   `headers()` and renders the pre-paint `THEME_BOOTSTRAP` `<script>` with
   `nonce={nonce}`. This forces all pages to render on demand (ƒ), which is
   inherent to a per-request nonce.
4. **`src/components/fs/marketing/json-ld.tsx`** (new) — server-only `JsonLd`.
   The previous `JsonLd` lived in `content.tsx`, which is imported by the
   `"use client"` island `marketing/nav.tsx`; client bundles cannot import
   `next/headers`, so the component moved into its own server-only module.
   Output markup is identical except it now emits `nonce={nonce}` read from
   `headers()`.
5. **`src/components/fs/marketing/content.tsx`** — `JsonLd` removed (moved).
6. **`src/components/fs/marketing/page.tsx`** — imports `JsonLd` from
   `./json-ld` instead of `./content`.

No client island contains any `<script>` element (verified by grep); none was
changed. Marketing copy, `framework.ts`, rate-limit, billing and seeds were
not touched.

## Files changed

- `next.config.ts` (CSP removed; header set otherwise unchanged)
- `src/middleware.ts` (new)
- `src/app/layout.tsx`
- `src/components/fs/marketing/json-ld.tsx` (new)
- `src/components/fs/marketing/content.tsx`
- `src/components/fs/marketing/page.tsx`

## Verification (production build, `bun x next start -p 3100`)

Typecheck `bun x tsc --noEmit`: clean. `bun run build`: green (one warning —
see notes). `/[[...fs]]` and `/_not-found` are now ƒ (dynamic); marketing
sections are no longer prerendered (required for per-request nonce).

For every route below: HTTP 200, **exactly one** CSP header,
`script-src` contains `'nonce-…' 'strict-dynamic'` and **no** `'unsafe-inline'`,
and **every** `<script>` tag in the HTML carries the same nonce value as the
CSP header (0 exceptions; tags counted include framework chunks, inline
`self.__next_f` pushes, the theme bootstrap and `application/ld+json`).

| Route | HTTP | CSP count | scripts nonced |
|---|---|---|---|
| `/` | 200 | 1 | 32/32 |
| `/methodology` | 200 | 1 | 31/31 |
| `/pricing` | 200 | 1 | 38/38 |
| `/faq` | 200 | 1 | 38/38 |
| `/auth` | 200 | 1 | 24/24 |
| `/discover` | 200 | 1 | 24/24 |

Also confirmed:
- Two consecutive requests to `/` get **different** nonces (per-request freshness).
- `<script nonce="…same…">(function(){try{` (theme bootstrap) present with the request nonce.
- `<script type="application/ld+json" nonce="…same…">` present with the request nonce.
- Framework `<script src="/_next/static/chunks/…" async="" nonce="…">` all nonced (Next.js auto-nonce active).
- `/api/v1/pricing` → 200 JSON (`{"success":true,…}`), unaffected.
- `/.well-known/security.txt` → 200, unaffected.
- A query such as `?_rsc=abc123` yields a 307 to `/?_rsc` — stock Next.js
  handling of a malformed RSC token, unrelated to this change.

Hydration (headless Microsoft Edge via the already-installed `playwright-core`;
no dependency added, throwaway script deleted afterwards): all six routes load
with **zero console errors, zero pageerrors, zero CSP violations** (`/` had one
unrelated upstream warning, `THREE.Clock deprecated`). Interactivity proven on
`/`, `/methodology`, `/pricing`, `/faq`: the theme toggle island flips the
`<html>` class, i.e. the client bundle executed and React attached.
`/auth` and `/discover` carry no theme toggle in their shell, but React fibers
are attached (`__reactFiber$` on DOM nodes) and there are no console errors.

## Residual notes

- `style-src` keeps `'unsafe-inline'` (accepted; styles are not script execution).
- `next build` prints two notices: (a) `middleware` file convention is
  deprecated in Next 16 in favour of `src/proxy.ts` (same export shape, run the
  `middleware-to-proxy` codemod when convenient — this ticket required
  `src/middleware.ts`); (b) Turbopack warns that `crypto` (Node builtin) is not
  available in the Edge Runtime — middleware/proxy always runs on the Node.js
  runtime in Next 16, and the module already avoids the issue by using Web
  Crypto (`globalThis.crypto.getRandomValues`) instead of `randomBytes`.
- All HTML routes are now server-rendered on demand. The ISR strategy of the
  catch-all page (`revalidate = 300` + `generateStaticParams`) is moot — its
  `headers()` read bails prerendering. `/pricing` in particular now hits the
  live plan catalog per request rather than serving a 5-minute cache.
- `X-Frame-Options: DENY` retained alongside `frame-ancestors 'none'`.
- Immutable build assets (`_next/static`, `_next/image`) carry no CSP (matcher
  excludes them); they serve no HTML and execute no scripts in a document context.
- Client islands contain no inline scripts by construction; adding one in the
  future without a nonce will be blocked by this policy — by design.
