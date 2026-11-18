# SEO · AEO · GEO — strategy & implementation (increment 3)

Operator request: mobile optimizations, SEO with **UAE/Dubai geo-targeting**,
AEO, crawler policy, metatags/metadata, SSR and CSR. This document records what
is implemented and how to verify it.

## 1. Rendering strategy (SSR/CSR split)

The root problem found: every page — including marketing — was client-rendered
behind a session-loading gate, so crawlers received an empty shell.

Now:

- **Marketing + legal routes** (`/`, `/product`, `/methodology`, `/evidence`,
  `/ecosystem`, `/api-docs`, `/pricing`, `/about`, `/contact`, `/legal`,
  `/privacy`, `/security-disclosure`) are **server-rendered React Server
  Components** — the full document (headings, copy, pricing, FAQ, footer,
  JSON-LD) is in the initial HTML. Verified: `curl / | grep "See the builders"`
  hits the raw HTML.
- **Platform routes** (`/discover`, `/ventures/[slug]`, `/research`,
  `/watchlists`, `/markets`, `/settings`, `/admin`, `/auth`) remain a client
  app (session-gated, TanStack Query realtime) — and are `noindex` because
  they require an authenticated session.
- Pricing SSRs the **real plan catalog from the database** (ISR, `revalidate
  = 300`) with an honest unavailable state if the catalog cannot be read —
  never a stale cached price.
- Small client islands: marketing nav (active state + mobile menu +
  session-aware CTA), everything else on marketing pages is static HTML.
- Inter-page navigation uses real `<a href>` links via `next/link` —
  crawlable and prefetchable (the previous app used JS-only navigation).

## 2. Metadata & metatags

- `metadataBase` set (correct absolute URLs for canonical/OG — was missing).
- Per-page metadata factory (`src/lib/seo.ts` `pageMetadata`): title,
  description, keywords, canonical URL, OpenGraph (with `en_AE` locale +
  alternates), Twitter card, robots — for every marketing route via
  `generateMetadata`.
- Dynamic Open Graph image (`src/app/opengraph-image.tsx`, 1200×630,
  brand-rendered) for every route.
- Icons: SVG favicon + generated `apple-touch-icon.png` (180) + PWA icons
  (192/512/maskable) via sharp from the brand SVG.
- `formatDetection` disabled (no phone/address auto-linking).
- PWA `manifest.webmanifest` (`src/app/manifest.ts`) — installable,
  standalone, brand theme colors.

## 3. GEO targeting — UAE/Dubai

- `geo.region: AE-DU`, `geo.placename: Dubai`, `geo.position` + `ICBM`
  coordinates (25.2048;55.2708) in root metadata (`other`).
- OG locale `en_AE` with `en_US`/`en_GB` alternates.
- Organization JSON-LD `PostalAddress` (Dubai, AE) + hero badge
  "DUBAI, UAE" + footer "Dubai, United Arab Emirates" + About/FAQ content.
- The address block is **operator-declared configuration** in
  `src/lib/seo.ts` (`SITE.address`) — update when entity registration
  finalizes; it is never inferred.
- No fake hreflang: there are no translated page variants, so no
  `hreflang` cluster is emitted (incorrect hreflang is worse than none).

## 4. AEO (answer-engine optimization)

- FAQ corpus as a **single source of truth** (`FAQS` in `src/lib/seo.ts`)
  rendered three ways:
  1. visible `<details>` FAQ section on `/methodology` (works without JS);
  2. `FAQPage` JSON-LD on `/methodology` (verbatim same Q/A);
  3. `public/llms.txt` + `public/llms-full.txt` for AI answer engines and
     LLM crawlers.
- `speakable` (SpeakableSpecification) on the methodology WebPage JSON-LD.
- Organization + WebSite JSON-LD site-wide; SoftwareApplication (with Offer)
  on `/product`; BreadcrumbList on doc pages.
- Concise, self-contained answer paragraphs in every doc page lede.

## 5. Crawler policy

- `robots.txt` (app route, dynamic): explicit allow-all for search engines
  with authenticated surfaces disallowed (`/api/`, `/discover`, `/ventures/`,
  `/research`, `/watchlists`, `/markets`, `/settings`, `/admin`, `/auth`);
  explicit allowances for AI crawlers (GPTBot, OAI-SearchBot, ChatGPT-User,
  ClaudeBot/Claude-SearchBot/Claude-User/anthropic-ai, PerplexityBot/
  Perplexity-User, Google-Extended, Applebot-Extended, meta-externalagent,
  Amazonbot, Bytespider) with the same platform exclusions; sitemap link.
- `sitemap.xml`: all public marketing routes with per-route
  changeFrequency/priority. Authenticated surfaces excluded on purpose.
  When public dossier pages ship, venture slugs join the sitemap with
  per-venture `lastModified`.
- The old static `public/robots.txt` was deleted (it shadowed the dynamic
  route).

## 6. Mobile optimizations

- Viewport: `viewportFit: cover` (notch/dynamic island) +
  `interactiveWidget: resizes-content` (iOS keyboard behavior).
- Mobile bottom tab bar in the app shell (Discover / AI analyst /
  Watchlists / Markets), thumb-reachable, safe-area padded, 44–48px touch
  targets, `aria-current` highlighting; main content padded to clear it.
- Safe-area insets applied to: top bar, drawer footer, offline banner
  (which now clears the tab bar), marketing header.
- Marketing nav gained a mobile disclosure menu (hamburger, Escape closes,
  scroll lock, route-change auto-close) — previously mobile had no nav.
- `min-h-dvh` replaces `min-h-screen` for correct mobile browser chrome
  handling; `text-size-adjust: 100%`; tap-highlight removed; drawer gets
  `overscroll-behavior: contain`.
- Performance: heavy views (dossier/research/watchlists/markets/settings/
  admin) are `next/dynamic` code-split with skeleton fallbacks; the 3D
  prism remains desktop-only and lazy; hero CTAs are links.
- The offline banner is `aria-live` and positioned above the tab bar.

## 7. How to verify (all verified 2026-11-15)

```
curl -s localhost:3000 | grep -c "See the builders"        # SSR content: ≥2
curl -s localhost:3000 | grep -o '"@type":"[A-Za-z]*"'     # Organization, WebSite, PostalAddress…
curl -s localhost:3000/methodology | grep -c FAQPage       # AEO: 1
curl -s localhost:3000/pricing | grep 'rel="canonical"'    # absolute canonical
curl -s localhost:3000/robots.txt                          # AI crawler policy
curl -s localhost:3000/sitemap.xml                         # public routes
curl -s localhost:3000/llms.txt                            # answer-engine reference
curl -s localhost:3000/manifest.webmanifest                # PWA
curl -s -o /dev/null -w "%{http_code}" localhost:3000/no-such-thing   # 404
```
