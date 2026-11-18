# FoundrySignal — Pages & Content Audit

Audit date: 2026-11-17. Scope: `src/app/`, `src/components/fs/`, `src/lib/client/routes.ts`,
`src/lib/seo.ts`, `public/llms*.txt`, `prisma/schema.prisma`, `scripts/seed*`.
**Audit only — no files were modified except this document.**

Architecture note that governs everything below: there is exactly **one** `page.tsx` in the
entire App Router tree — `src/app/[[...fs]]/page.tsx`, an optional catch-all. Every URL is
resolved by `pathToSection()` (`src/lib/client/routes.ts:86-124`) into a `Section` union. Public
URLs render server-side RSC (`MarketingPage`), everything else renders the client app shell. So
"page exists" == "section exists in `MARKETING_PATHS` / `SECTION_PATHS`", not "a file exists in a
directory".

---

## 1. Route Tree

### 1.1 File routes (`src/app/`)

| Route | File | Type | Auth? | Has metadata? | Real content? |
| --- | --- | --- | --- | --- | --- |
| `/` | `src/app/layout.tsx` (root layout, all routes) | Layout | No | Yes — `metadataBase`, title template, description, keywords, OG, Twitter, icons, manifest, geo `other` | n/a |
| `/*` (all URLs) | `src/app/[[...fs]]/page.tsx` | Page (catch-all) | Mixed | Yes — `generateMetadata` per section | Yes — delegates to `MarketingPage` or `FoundrySignalApp` |
| `/_not-found` | `src/app/not-found.tsx` | Not found | No | Yes — `title: "Page not found"` | Yes — `NotFoundView` branded, links home/discover/pricing/contact |
| error boundary | `src/app/error.tsx` | Error | No | No | Yes — branded recovery UI, digest |
| global error | `src/app/global-error.tsx` | Error | No | No | Yes — self-contained inline-styled fallback |
| `/sitemap.xml` | `src/app/sitemap.ts` | Sitemap | No | n/a | 12 URLs from `PUBLIC_ROUTES` |
| `/robots.txt` | `src/app/robots.ts` | Robots | No | n/a | Allow-all + platform disallows + AI crawler rules |
| `/manifest.webmanifest` | `src/app/manifest.ts` | Manifest | No | n/a | PWA manifest |
| `/opengraph-image` | `src/app/opengraph-image.tsx` | OG image | No | n/a | 1200×630 `ImageResponse` |

### 1.2 Logical routes (sections resolved by the catch-all)

Marketing sections (`MARKETING_SECTION_PATHS`, `page.tsx:37-50`) — **server-rendered**:

| Route | File | Type | Auth? | Has metadata? | Real content? |
| --- | --- | --- | --- | --- | --- |
| `/` | `page.tsx:349-356` (Hero/ProofStrip/HomeDifferentiator/HomeCTA in `marketing/content.tsx`) | Public page | No | Yes — `SECTION_META.home` | Yes — full hero, 4-item proof strip, 4-row differentiator table, dual CTA |
| `/product` | `page.tsx:358-363` + `DOC_BLOCKS.product` | Public page | No | Yes | Yes — 6 doc blocks (Discovery, Dossier, Founders, Repos, Analyst, Markets) + `SoftwareApplication` LD |
| `/methodology` | `page.tsx:365-376` + `DOC_BLOCKS.methodology` | Public page | No | Yes | Yes — 5 blocks + visible FAQ (`FaqSection`) + `FAQPage` LD + `speakable` |
| `/evidence` | `page.tsx:378-380` + `DOC_BLOCKS["evidence-explainer"]` | Public page | No | Yes | Yes — 5 blocks (claims/sources, hashing, statuses, disputes, AI grounding) |
| `/ecosystem` | `page.tsx:382-384` + `DOC_BLOCKS.ecosystem` | Public page | No | Yes | Yes — 5 blocks (Solana, providers, market infra, GitHub, COI register) |
| `/api-docs` | `page.tsx:386-388` + `DOC_BLOCKS.api` | Public page | No | Yes | Yes — 4 blocks (Contract, Modules, Access/metering, Availability). **Prose only — no endpoint reference, no auth guide, no code samples** |
| `/pricing` | `page.tsx:390` → `PricingSSR` `:203-296` | Public page | No | Yes | Yes — live DB catalog (`listActivePlans`), 5 plans, real micros pricing, per-plan features, honest "catalog unavailable" state |
| `/about` | `page.tsx:392-394` + `DOC_BLOCKS.about` | Public page | No | Yes | Yes — 5 blocks (why, principles, where, working name, status) |
| `/contact` | `page.tsx:396` → `ContactSection` `:298-327` | Public page | No | Yes | **Placeholder-grade** — 3 plain-text addresses + 1 paragraph. No form, no `mailto:` links, no phone, no address, no hours |
| `/legal` | `page.tsx:398-400` + `DOC_BLOCKS.legal` | Public page | No | Yes | Yes — 4 blocks, but it is a *deployment-status disclaimer*, **not Terms of Service** |
| `/privacy` | `page.tsx:402-404` + `DOC_BLOCKS.privacy` | Public page | No | Yes | Yes — 4 blocks (account data, research data, public founder data, logs). **No retention schedule table, no DPA, no subprocessor list, no contact for data requests** |
| `/security-disclosure` | `page.tsx:406-408` + `DOC_BLOCKS["security-disclosure"]` | Public page | No | Yes | Yes — 4 blocks (report, controls, boundaries, scope). Contact is `security@foundrysignal.example` (**non-routable `.example` TLD**) |

Platform sections (`src/components/fs/app.tsx:206-228`) — **client app shell, session-gated**:

| Route | File | Type | Auth? | Has metadata? | Real content? |
| --- | --- | --- | --- | --- | --- |
| `/auth` | `src/components/fs/auth-view.tsx` | Public-ish (session gate) | No (login/register) | Title only + `robots: noindex` | Yes — register + login, 5 personas, real sessions. **No `?verify=` / `?reset=` handler** despite email templates linking there |
| `/discover` | `discover-view.tsx` | Auth-gated dashboard | **Yes** | `noindex` only | Yes — directory, filters, sort, venture intake (7 fields) |
| `/ventures/:slug` | `dossier-view.tsx` (1070 lines) | Auth-gated dashboard | **Yes** | `noindex` + title "Venture dossier" | Yes — 9 tabs (Overview, Founders, Product, Development, Evidence, Onchain, Markets, History, Reports) |
| `/research` | `research-view.tsx` | Auth-gated dashboard | **Yes** | `noindex` only | Yes — venture-scoped composer, run history, report rendering |
| `/watchlists` | `watchlists-view.tsx` | Auth-gated dashboard | **Yes** | `noindex` only | Yes — watchlists, alert rules, alert events |
| `/markets` | `markets-view.tsx` | Auth-gated dashboard | **Yes** | `noindex` only | Partial — tokens, quote preview, order intents, wallet; execution gated off |
| `/settings` | `settings-view.tsx` | Auth-gated dashboard | **Yes** | `noindex` only | Partial — see §6 |
| `/admin` | `admin-view.tsx` | Auth-gated dashboard | **Yes** (MODERATOR / PLATFORM_ADMIN) | `noindex` only | Yes — stats, queue, dead letters, audit log, trading gates. `integrations` from API never rendered |
| `/design-system` | `design-system-view.tsx` (1251 lines) | Public (no user data) | No | `noindex` only | Yes — full component playground. **Orphaned: zero inbound links** |

Unknown paths → `notFound()` → real HTTP 404 with branded view (`page.tsx:73`, `app.tsx:185`).

### 1.3 API routes — 30 `route.ts` files

| Method(s) | Route | Auth / role gate |
| --- | --- | --- |
| GET | `/api` | none — returns `{message:"Hello, world!"}` (leftover scaffold) |
| GET | `/api/v1/health` | none |
| GET | `/api/v1/capabilities` | none (redacted for non-admins) |
| GET | `/api/v1/pricing` | none (public catalog) |
| POST/GET | `/api/v1/auth/[action]` | none — `register` / `login` / `logout`; GET returns session |
| GET/PATCH/DELETE | `/api/v1/account` | `requireAuth` (DELETE/PATCH self-only) |
| GET/POST | `/api/v1/ventures` | `requireAuth` |
| GET | `/api/v1/ventures/[slug]` | `requireAuth` |
| GET/POST/DELETE | `/api/v1/ventures/[slug]/[sub]` | `requireAuth`; writes need `ANALYST+` (`evidence`, `watchlists`, `founders`, `token`, `refresh`) |
| GET/POST | `/api/v1/research/runs` | `requireAuth` |
| GET | `/api/v1/research/runs/[id]` | `requireAuth` |
| GET | `/api/v1/reports/[id]`, `/api/v1/reports/[id]/export` | `requireAuth` |
| GET/POST/DELETE | `/api/v1/watchlists` | `requireAuth`; POST/DELETE need `ANALYST` |
| POST/DELETE | `/api/v1/watchlists/[id]/items` | `requireAuth` + `VIEWER` |
| GET/POST/PATCH/DELETE | `/api/v1/alerts` | `requireAuth`; POST needs `ANALYST` |
| GET | `/api/v1/alerts/events` | `requireAuth` |
| GET/POST/DELETE | `/api/v1/saved-searches` | `requireAuth`; POST needs `VIEWER` |
| GET/POST | `/api/v1/markets` | `requireAuth` |
| GET/POST | `/api/v1/trading/order-intents` | `requireAuth` |
| GET | `/api/v1/trading/gates` | `requireAuth` |
| POST | `/api/v1/trading/execute` | `requireAuth` + release gates (hard-gated) |
| GET/PATCH | `/api/v1/admin/trading-gates` | `requireAuth` + `PLATFORM_ADMIN` |
| GET | `/api/v1/admin/overview` | `requireAuth` + `PLATFORM_ADMIN` or `MODERATOR` |
| GET | `/api/v1/providers` | `requireAuth` + `PLATFORM_ADMIN` or `MODERATOR` |
| GET | `/api/v1/billing/status` | `requireAuth` + `PLATFORM_ADMIN`/`MODERATOR` (**ordinary payers locked out**) |
| POST | `/api/v1/billing/checkout`, `/api/v1/billing/portal` | `requireAuth` + workspace `ADMIN` |
| POST | `/api/v1/billing/verify` | `requireAuth` only (no workspace role) |
| POST | `/api/v1/billing/webhook` | none (signature-verified) |

**Missing API surfaces:** no `/api/v1/founders`, `/api/v1/evidence` (only via venture sub-route),
`/api/v1/disputes`, `/api/v1/notes`, `/api/v1/workspaces` (list/switch/invite), `/api/v1/users`
(admin user management), `/api/v1/keys` (API-key issuance despite `/api-docs` advertising API keys),
`/api/v1/search`.

---

## 2. Public Page Gaps

Required verdicts:

| Page | Verdict | Evidence / notes |
| --- | --- | --- |
| `/` | **PRESENT** | `page.tsx:349-356`; hero + proof strip + differentiator + CTA; real copy, full metadata, in nav (logo) and footer (logo). |
| `/about` | **PRESENT** | `DOC_BLOCKS.about` (5 blocks, ~250 words); real copy, metadata, linked in primary nav and footer Company column. Thin on team/entities/investors — no team page, no legal entity, no careers. |
| `/pricing` | **PRESENT** | `PricingSSR` `:203-296`; reads live `Plan` table (5 seeded plans, real micros), honest unavailable/empty states, per-plan feature copy. Metadata + linked in nav + footer. **Gap:** no annual toggle, no seat math, no comparison table, no FAQ tie-in, `/pricing` has no `FAQPage` LD. |
| `/faq` | **ABSENT** | No route, no `Section`, not in `PUBLIC_ROUTES`. FAQ content exists (8 Q/A in `FAQS`, `seo.ts:211-244`) but is only rendered **embedded at the bottom of `/methodology`** (`page.tsx:374`). Single canonical FAQ URL does not exist — a real AEO gap since llms.txt points at `/methodology` for "plus the FAQ". |
| `/terms` | **ABSENT (placeholder-grade substitute)** | No `/terms`, no `Terms` string anywhere in `src/`. `/legal` exists and carries a 4-block disclaimer ("what this platform is / is not / review gates / data rights") but explicitly disclaims being legal terms; there is **no Terms of Service, no EULA, no acceptable-use policy, no refund policy** for a paid product. |
| `/privacy` | **PRESENT** | `DOC_BLOCKS.privacy` (4 blocks: account data, research data, public founder data, logs). Real copy, metadata, footer Trust column. **Gaps:** no retention schedule table (referenced by UI copy but not published), no subprocessor list (Resend/Stripe/Helius/GitHub/Jupiter), no data-request contact, no cookie table. |
| `/security` | **ABSENT** (only `/security-disclosure` exists) | No `/security` route. `/security-disclosure` is **PRESENT** with 4 real blocks + controls list. **Gaps:** contact `security@foundrysignal.example` is a non-routable placeholder domain (real domain per `seo.ts` is `foundrysignal.aiazimara.com`), no PGP key, no `/.well-known/security.txt`, no hall-of-fame, no SLA table. |
| `/contact` | **PLACEHOLDER** | `ContactSection` `:298-327` — 3 addresses rendered as plain text (not `mailto:`), all on `foundrysignal.example` (reserved TLD, cannot receive mail), plus one Issuer Response Center paragraph. No contact form, no `mailto:`/`tel:`, no postal address, no support-hours, no response SLA. It is in the mobile menu only — **desktop primary nav omits it** (see §3). |
| `/blog` | **ABSENT** | No route, no `Post`/`Article` model in `schema.prisma` (44 models, none content-related), no MDX pipeline (`@mdxeditor/editor` is a dependency but unused for public content). Zero inbound links. |
| `/docs` | **ABSENT** | `/api-docs` exists but is prose only (4 doc blocks) — no endpoint table, no auth/API-key flow, no error taxonomy reference, no rate limits, no pagination examples, no OpenAPI spec, no SDK. No `/docs`, `/developers`, `/quickstart`, or `/changelog`. |

Other absent pages a fintech/investment site normally ships: `/security` (see above),
`/status` (no status page; `/api/v1/health` exists but is undocumented/unlinked),
`/disclosures` (no separate risk-disclosure page; risk language is buried in `/legal`),
`/careers`, `/changelog`, `/methodology` sub-pages (no per-topic deep links),
`/ventures` index (deliberately auth-gated), `/.well-known/security.txt`.

---

## 3. Nav / Footer Coverage

Marketing nav (`src/components/fs/marketing/nav.tsx`):

- **Desktop primary nav** (`:92-113`) renders `NAV` only: Product, Methodology, Evidence,
  Ecosystem, API, Pricing, About. **Contact is not in `NAV`** — `items = [...NAV, {Contact}]`
  (`:82`) is used **only by the mobile panel** (`:124-158`). Desktop users reach `/contact`
  only via the footer.
- **Footer** (`content.tsx:76-114`): Platform = NAV[0..3] (Product, Methodology, Evidence,
  Ecosystem); Company = NAV[4..] + Contact (API, Pricing, About, Contact); Trust =
  LEGAL_NAV (Legal, Privacy, Security disclosure).
- **Auth CTAs**: `/auth`, `/auth?mode=login`, `/discover` (when session), `/` (logo).

Platform shell nav (`app-shell.tsx:35-42`, `70-75`): Discover, Analyst, Watchlists, Markets,
Settings, + Admin when `PLATFORM_ADMIN`/`MODERATOR`.

Coverage matrix:

| Route | In primary nav | In footer | Reachable elsewhere | Verdict |
| --- | --- | --- | --- | --- |
| `/` | Logo only | Logo | — | Linked |
| `/product` | Yes (desktop) | Yes | — | Linked |
| `/methodology` | Yes | Yes | Hero CTA | Linked |
| `/evidence` | Yes | Yes | — | Linked |
| `/ecosystem` | Yes | Yes | — | Linked |
| `/api-docs` | Yes | Yes | — | Linked |
| `/pricing` | Yes | Yes | Home CTA, 404 view | Linked |
| `/about` | Yes | Yes | — | Linked |
| `/contact` | **Mobile only** | Yes | 404 view | **Inconsistent — orphaned on desktop nav** |
| `/legal` | No | Yes (Trust) | — | Footer-only (acceptable) |
| `/privacy` | No | Yes (Trust) | — | Footer-only (acceptable) |
| `/security-disclosure` | No | Yes (Trust) | — | Footer-only (acceptable) |
| `/auth` | CTA button | No | Hero CTA, Home CTA, pricing buttons | Linked |
| `/discover` | "Open platform" CTA | No | Post-auth landing | Linked (session only) |
| `/design-system` | **No** | **No** | **Nothing** | **Fully orphaned** — publicly reachable, `noindex`, zero links |
| `/faq` | n/a | n/a | n/a | Does not exist |
| `/blog` | n/a | n/a | n/a | Does not exist |

Additional gaps: the marketing footer never links to the platform (Discover, Research, Watchlists,
Markets) for signed-out visitors, and never links to Legal from the auth screen (`auth-view.tsx`
has no legal/privacy links — a consent gap for a signup form). The 404 view links to
home/discover/pricing/contact but not to legal or docs.

---

## 4. SEO Surface Status

**Working, verified by reading source:**

1. **Metadata** — root `layout.tsx:13-64` sets `metadataBase`, title template
   (`%s · FoundrySignal`), description, keywords, canonical `/`, OG (locale `en_AE`, alternates
   `en_US`/`en_GB`), Twitter `summary_large_image`, robots index/follow, icon set (SVG + 192 + apple
   + mask-icon), manifest, `formatDetection: false`, geo block (`geo.region AE-DU`,
   `geo.placename Dubai`, `geo.position 25.2048;55.2708`, ICBM).
   Per-page: `generateMetadata` (`page.tsx:49-67`) → `marketingMetadata` → `pageMetadata`
   (`seo.ts:68-93`) yields title, description, keywords, **canonical**, OG (title/description/url/
   siteName/type/locale/alternateLocale), Twitter card, robots. All 12 marketing sections covered.
2. **Structured data (JSON-LD)** — `JsonLd` (`content.tsx:47-55`, `<`-escaped). Emitted:
   `Organization` (with Dubai `PostalAddress` + `ContactPoint`) and `WebSite` **site-wide**
   (`page.tsx:340-346`); `BreadcrumbList` on every non-home marketing page; `SoftwareApplication`
   + `Offer` on `/product` (`:360`); `WebPage` with `speakable` + `FAQPage` on `/methodology`
   (`:367-372`). **No JSON-LD at all on `/pricing`, `/about`, `/contact`, `/legal`, `/privacy`,
   `/security-disclosure`** beyond Organization/WebSite/Breadcrumb — no `Offer`/`AggregateOffer` on
   pricing, no `ContactPage`, no `AboutPage`, no `WebPage` for legal/privacy.
3. **Crawlability** — marketing sections are true RSC: full HTML, headings, copy, pricing, footer.
   `robots.ts` allows all, disallows `/api/`, `/discover`, `/ventures/`, `/research`, `/watchlists`,
   `/markets`, `/settings`, `/admin`, `/auth`; explicit allow-lists for GPTBot, OAI-SearchBot,
   ChatGPT-User, ClaudeBot/-SearchBot/-User, anthropic-ai, PerplexityBot/-User, Google-Extended,
   Applebot-Extended, meta-externalagent, Amazonbot, Bytespider.
4. **`sitemap.ts`** — 12 URLs from `PUBLIC_ROUTES` (`routes.ts:127-140`) with per-route
   `changeFrequency` (weekly: `/`, product, methodology, evidence, pricing; monthly: ecosystem,
   api-docs, about, contact, security-disclosure; yearly: legal, privacy) and priority. Authenticated
   surfaces deliberately excluded.
5. **`public/llms.txt`** (3.2 KB) — 12 page links, evidence-classification glossary, key-facts
   block. **`public/llms-full.txt`** (5.5 KB) — 8-question FAQ corpus, methodology summary, plans,
   contact. Both use the canonical `foundrysignal.aiazimara.com` domain.
6. **OG image** — `opengraph-image.tsx` generates 1200×630 branded PNG for all routes without an
   override.
7. **PWA manifest** — `manifest.ts`, standalone, brand colors, 4 icon sizes.
8. **SSG/ISR** — `generateStaticParams` pre-renders all 20 marketing/platform paths;
   `revalidate = 300`; `dynamicParams = true`. Pricing is ISR-fresh and never serves stale prices.

**Defects / gaps found:**

| # | Issue | Location |
| --- | --- | --- |
| S1 | **Duplicate `User-agent: *` groups** in `robots.ts` (`:24-29` and `:52-56`). Two groups with the same UA is ambiguous under the robots spec; crawlers may apply only the last group, which would **block `/admin`, `/settings` only** and *re-allow* everything else, or may drop the AI-crawler allowances. Should be one merged group. | `src/app/robots.ts` |
| S2 | **No `/faq` URL** while `FAQS` + `FAQPage` LD exist — FAQPage structured data is only on `/methodology`, so the rich-result opportunity is tied to a methodology page rather than a canonical FAQ. | `page.tsx:374` |
| S3 | **No `Offer`/`AggregateOffer` JSON-LD on `/pricing`** — the only commercial page has no structured pricing data, despite `SoftwareApplication.offers` on `/product` hardcoding `price: "0"` (which is factually wrong: only Explorer is $0). | `seo.ts:197-202`, `page.tsx:390` |
| S4 | **Twitter handle is a declared placeholder** (`SITE.twitter = "@foundrysignal" // placeholder handle`), and `layout.tsx:40-44` never emits `twitter:site`/`twitter:creator` — so the placeholder is inert but the card has no attribution. | `seo.ts:33`, `layout.tsx` |
| S5 | **No per-page OG image overrides** — every page shares one generic 1200×630; no `opengraph-image` per section, no `twitter:image` alt per page. | `src/app/` |
| S6 | **No `Article`/`BlogPosting` schema and no blog** — zero long-form content surface for organic search; the whole SEO strategy rests on 12 static pages. | — |
| S7 | **No `hreflang`** — intentional and correct (no translated variants), documented in `docs/SEO_AEO_GEO.md`. Not a defect. | — |
| S8 | **No `security.txt`, no `humans.txt`, no RSS/feed.** | `public/` |
| S9 | **`/api-docs` is prose with no endpoint reference** — the highest-intent developer page ranks for nothing and converts nothing; no OpenAPI spec is published. | `DOC_BLOCKS.api` |
| S10 | **Contact details are unroutable placeholders** — `product@`, `security@`, `enterprise@foundrysignal.example` (`page.tsx:181-185`) and `security@foundrysignal.example` (`:174`) use the reserved `.example` TLD, contradicting the real domain in `seo.ts`/`llms.txt`. This is a trust and deliverability defect on a page that is indexed (priority 0.5). | `marketing/page.tsx` |
| S11 | **`/contact` has no `ContactPage` LD and no `mailto:` links** — no contact point is machine-readable. | `page.tsx:298-327` |
| S12 | **No `Organization.sameAs`** (no X/LinkedIn/GitHub profiles) — weakens entity resolution. | `seo.ts:98-118` |
| S13 | `robots.ts` disallows `/api/` wholesale, which also blocks `/api/v1/pricing` and `/api/v1/capabilities` — publicly documented, publicly readable endpoints. Minor. | `robots.ts:12` |

---

## 5. Roles Inventory

Roles are **plain strings with code-level unions**, not Prisma enums. Nothing in `schema.prisma`
uses `enum`; each role column carries a comment listing allowed values.

| Role | Where defined | Seeded content? | Dashboard exists? |
| --- | --- | --- | --- |
| `USER` (platform) | `src/lib/auth/context.ts:5`, `src/lib/contracts/api.ts:107` (`PLATFORM_ROLES`), `schema.prisma:23` (`User.platformRole @default("USER")`), `auth/service.ts:95` (hardcoded on register) | **Yes, implicitly** — every registration creates `platformRole: "USER"` | No dashboard of its own; reaches the standard authenticated shell |
| `MODERATOR` (platform) | same as above | **NO — unreachable.** No seed, no bootstrap, no API, no migration sets `MODERATOR`. `grep` finds only *read* sites (`admin/overview`, `providers`, `billing/status`, `capabilities`, `app-shell`, `settings-view`) | Nominally `/admin` (read-only; `TradingReadinessSection` hides decision controls) — **but no account can ever hold this role** |
| `PLATFORM_ADMIN` (platform) | same as above | **Via env only** — `src/instrumentation.ts:21-38` promotes `ADMIN_BOOTSTRAP_EMAIL` at boot, audited as `AUTH_ROLE_BOOTSTRAP`. No seed file creates one. | Yes — `/admin` (full), plus admin-only Settings sections |
| `OWNER` (workspace) | `context.ts:6`, `contracts/api.ts:106` (`WORKSPACE_ROLES`), `schema.prisma:74` (`Membership.role @default("ANALYST")`), `auth/service.ts:104` | **Yes** — every registration creates a personal workspace with membership `OWNER` | Same authenticated shell; no OWNER-specific UI beyond `ANALYST`-gated writes |
| `ADMIN` (workspace) | same as above | **NO** — no code path creates an `ADMIN` membership. No invite/add-member API exists, so a second seat can never be provisioned. | Only gate that matters: `/api/v1/billing/checkout` + `/portal` require it — **and no user can hold it**, so self-serve billing is unreachable |
| `ANALYST` (workspace) | same as above; also the schema default (`schema.prisma:74`) | **NO** — only as a DB default for rows created outside `registerUser` | Effective floor for all write actions (`ventures/[slug]/[sub]` POST, `watchlists` POST, `alerts` POST) |
| `VIEWER` (workspace) | same as above | **NO** | Read-only floor (`watchlists/[id]/items`, `saved-searches` POST) |
| `VENTURE_INVESTOR` / `FOUNDER` / `RESEARCH_ANALYST` / `LIMITED_PARTNER` / `OTHER` (registration persona, **not a role**) | `src/lib/contracts/api.ts:116-131` (`USER_TYPES`, `USER_TYPE_LABELS`), `schema.prisma:24` (`User.userType`), `auth/service.ts:14` | **Yes** — chosen at register, editable in Settings → Profile; explicitly does **not** grant privilege | No — persona only tailors onboarding copy |
| `REPO_OWNER` / `REPO_MAINTAINER` / `INDIVIDUAL_CONTRIBUTOR` (data attribute) | `schema.prisma:276` (`ContributorObservation.repoRole`) | Seeded implicitly via `seed-portfolio.ts` repo observations | Rendered inside dossier → Development |
| `FOUNDER` / `CO_FOUNDER` / `CORE_CONTRIBUTOR` / `ADVISOR` (data attribute) | `ventures/[slug]/[sub]/route.ts:13-15` (`AttachFounderSchema.role`) | Only when a user attaches a founder | Rendered inside dossier → Founders |

**Seed inventory (`scripts/`):**

| Script | What it seeds | Roles covered |
| --- | --- | --- |
| `scripts/seed-portfolio.ts` | 5 ventures (`jupiter-exchange`, `helius`, `drift-protocol`, `metaplex`, `marinade-finance`) + identities, claims, evidence sources, SHA-256 snapshots, claim↔evidence links, repositories, observations, token assets, history events. Idempotent via `upsert`. | None — no `User`, `Membership`, or `Workspace` rows |
| `scripts/seed/` | **Empty directory** | — |
| `scripts/dedupe-claims.ts`, `dedupe-ventures.ts`, `verify-canonical-claims.ts` | Data hygiene, not seeding | — |
| Runtime `ensurePlans()` (`lib/domain/billing/plans.ts:124-147`) | 5 plans (Explorer $0, Researcher $39, Professional $99, Team $299, Enterprise custom) — idempotent `upsert` | None |

**Role verdict:** the role *model* is coherent and correctly non-escalable (register hardcodes
`USER`; `UpdateAccountSchema` is a closed allowlist, `service.ts:17-26`), but the *seeding* is
effectively empty. Only `USER` (self-serve), `OWNER` (self-serve), and `PLATFORM_ADMIN`
(env bootstrap) are reachable. `MODERATOR`, `ADMIN`, `ANALYST`, and `VIEWER` are unreachable
dead configuration — which makes every `requireWorkspaceRole(ctx, "ADMIN")` gate (billing)
unsatisfiable, and makes `MODERATOR` a phantom in five read paths. There is also **no workspace
invitation / member management** anywhere: no `POST /api/v1/workspaces`, no invite token model, no
`Membership` create path outside registration — so the Team plan's `seats: 5` and `rolePermissions:
true` entitlements are pure fiction.

---

## 6. Dashboard Inventory

| Route | Serves which role | Complete / partial / missing |
| --- | --- | --- |
| `/discover` | Any authenticated user (`USER`, any workspace role) | **Complete** — directory with search/category/ecosystem filters, 3 sorts, saved-search hook, 7-field venture intake with client + server validation, `canRegister` gate (`!== "VIEWER"`). |
| `/ventures/:slug` | Any authenticated user | **Complete** — 9 independently-degrading tabs; header with category/ecosystem/status; evidence graph; founder attribution flow; token/onchain reads; market snapshots; history timeline; reports list. Honest empty states throughout. **No dispute-raising UI** (`DisputeRecord` model exists, no interface writes it) and **no report-export button** despite `reports/[id]/export` existing. |
| `/research` | Any authenticated user | **Complete** — venture-scoped composer, suggestions, run history with URL deep-linking (`?venture=&run=`), citation-validated report rendering, insufficient-evidence states. |
| `/watchlists` | Any authenticated user | **Partial** — watchlists, alert rules, alert events all render. **Badge is dead:** `app.tsx:209` hardcodes `alertCount={0}`, so the sidebar/account-menu counters never show a real count even though `/api/v1/alerts/events` exists. No mark-as-read UI. |
| `/markets` | Any authenticated user | **Partial (by design)** — associated tokens, quote preview, order intents, wallet connection (Wallet Standard) all real; execution blocked behind 4 gates + kill switch + `TRADING_ENABLED`. Wallet connect lives here, so there is no portfolio/holdings view. |
| `/settings` | Any authenticated user; `PLATFORM_ADMIN`/`MODERATOR` get extra sections | **Partial / mis-gated** — Account (email, persona, roles, verify badge), Profile (name + persona), Appearance & motion, Danger zone (soft delete + session revoke) are for everyone. **Billing** (`:446`), **Capability registry** (`:457`), **Provider health** (`:476`) are `isPlatformAdmin`-only. Consequence: an `OWNER`/`ADMIN` who is the paying customer can never see their plan, subscription, or payment state — `/api/v1/billing/status` is itself admin-gated. **No security section** (no password change, no session list/revoke, no MFA) despite `MFA_ENCRYPTION_KEY` being read. |
| `/admin` | `PLATFORM_ADMIN` + `MODERATOR` only | **Partial** — 5 stat tiles, trading-readiness gates + kill switch (PLATFORM_ADMIN decision controls), queue/ingestion health, dead-letter queue, append-only audit log. **Missing:** `/api/v1/admin/overview` returns `integrations` (GitHub token, billing, trading env) and the UI's `AdminOverview` interface (`:36-49`) has no `integrations` field — that payload is fetched and discarded. **No user management, no role assignment, no membership admin** — which is exactly why `MODERATOR`/`ADMIN` can never be provisioned. |
| `/design-system` | Public (no session) | **Complete but orphaned** — 1251-line playground, `noindex`, zero inbound links. Not in nav, footer, or sitemap. |

**Role switcher: none.** There is no workspace switcher (the shell renders `account.workspaces[0]` —
`app-shell.tsx:191` — and `Session.activeWsId` is only set at register/login from the first
membership; `Session.activeWsId` is never updated thereafter, and no API exists to change it).
There is no role switcher and there should not be — roles are server-assigned and `UpdateAccountSchema`
strips them — but the *absence of any UI to assign roles* is the real gap.

---

## 7. Prioritized Build List

**P0 — blocks trust, conversion, or legal review**

1. **Fix the contact surface.** Replace `*.foundrysignal.example` with the real domain
   (`foundrysignal.aiazimara.com`) in `CONTACT_CHANNELS` and the security-disclosure block; make
   them real `mailto:` links; add a contact form or at minimum a `ContactPage` JSON-LD. *(Currently
   indexed, unroutable, and quoted in `llms-full.txt`.)*
2. **Publish `/terms`.** A paid product with checkout cannot ship without Terms of Service,
   acceptable-use, and refund policy. `/legal` explicitly disclaims being terms.
3. **Add `/security` (or `/.well-known/security.txt`)** and fix the disclosure contact. Security
   researchers cannot currently report anything.
4. **Repair `robots.ts`.** Collapse the two `User-agent: *` groups into one; keep the AI-crawler
   allow-list. Ambiguous grouping risks re-allowing authenticated surfaces.
5. **Make roles reachable.** Either add a `POST /api/v1/admin/users/:id/role` (PLATFORM_ADMIN) +
   a workspace invite flow (`POST /api/v1/workspaces/:id/invitations`, `Membership` create), or
   delete the dead `MODERATOR`/`ADMIN`/`ANALYST`/`VIEWER` code paths. Until then, billing is
   unsatisfiable and the Team plan's seats are fiction.

**P1 — growth and SEO**

6. **Create `/faq`** as a real route reusing `FAQS`, move the `FAQPage` JSON-LD there (keep it on
   `/methodology` too, or canonicalise), and link it from nav + footer. Add `/faq` to
   `PUBLIC_ROUTES`/`sitemap`.
7. **Add `Offer`/`AggregateOffer` JSON-LD to `/pricing`** from the live `Plan` table (including
   the real `price: "0"` only for Explorer — the current `SoftwareApplication.offers` on
   `/product` misstates price).
8. **Build `/docs`** — an actual developer surface: OpenAPI spec generated from
   `src/lib/contracts/api.ts`, endpoint tables, auth/API-key flow, error taxonomy, rate limits,
   pagination, and a quickstart. `/api-docs` today is 4 prose paragraphs.
9. **Un-orphan `/design-system`** — either link it from the footer under a "Design" column or
   remove it from the route table and keep it behind `noindex` intentionally with a comment.
10. **Reconcile desktop vs mobile nav** — add Contact to `NAV` so desktop and mobile match, or
    drop it from the mobile-only `items` array.
11. **Wire the alert badge** — replace `alertCount={0}` in `app.tsx:209` with a real query against
    `/api/v1/alerts/events` (unread count). Dead counters erode trust in a data product.
12. **Add an admin "integrations" panel** to `/admin` for the `integrations` payload already
    returned by `/api/v1/admin/overview`.

**P2 — depth and retention**

13. **Blog / long-form content.** No content surface exists (`no BlogPost model`, no MDX pipeline).
    For a research product this is the primary organic acquisition channel; start with 10
    evidence-methodology posts derived from `DOC_BLOCKS`.
14. **Fix the pricing page for real evaluation** — annual toggle, seat math, feature comparison
    matrix, and a `Product`→`Pricing` CTA path.
15. **Billing visibility for payers** — move `BillingSection` out from under `isPlatformAdmin` and
    un-gate `GET /api/v1/billing/status` to `requireAuth` + workspace `ADMIN`.
16. **Settings → Security** — password change, active-session list with revoke, MFA enrolment
    (`MFA_ENCRYPTION_KEY` is already read by the capability registry).
17. **Close the email-verification / password-reset loop.** `sendVerificationEmail` and
    `sendPasswordResetEmail` exist (`lib/domain/email/service.ts:66-84`) and are called by
    **nothing**; `/auth` does not parse `?verify=` or `?reset=`. `User.emailVerifiedAt` is never
    written. Either implement both flows or delete the templates and stop implying they work
    (the auth screen currently tells users they do).
18. **Dispute + correction UI.** `DisputeRecord` exists in the schema; no interface writes one, so
    the "anyone can raise a dispute" claim on `/evidence` is not operable.
19. **Report export button** in the dossier Reports tab — the API (`reports/[id]/export`) exists,
    the UI never calls it.
20. **Add `Organization.sameAs`** and a real `twitter:site` once the account exists; add
    `/status` (backed by `/api/v1/health`) and per-section OG images.

---

## Appendix — verification method

Every claim above was read from source, not inferred: the catch-all page and
`pathToSection`; `SECTION_META`/`DOC_BLOCKS`/`PLAN_COPY`/`PricingSSR`/`ContactSection`/`MarketingPage`;
`NAV`/`LEGAL_NAV`/`MarketingFooter`/`Hero`/`HomeCTA`/`FaqSection`; `layout.tsx` metadata + viewport;
`sitemap.ts`/`robots.ts`/`manifest.ts`/`opengraph-image.tsx`/`not-found.tsx`/`error.tsx`/
`global-error.tsx`; `seo.ts` (metadata factory + all JSON-LD builders + `FAQS`); `llms.txt` and
`llms-full.txt`; `app.tsx` router + session gate; `app-shell.tsx` nav + role badge;
`auth-view.tsx`; `admin-view.tsx`; `settings-view.tsx`; all 30 API route handlers (HTTP methods +
`requireAuth`/`requireWorkspaceRole`/`requirePlatformRole` calls); `prisma/schema.prisma` (44
models, all role columns); `scripts/seed-portfolio.ts`; `scripts/seed/` (empty);
`lib/domain/billing/plans.ts`; `lib/auth/context.ts`; `lib/auth/service.ts`; `lib/auth/session.ts`;
`src/instrumentation.ts`; `next.config.ts`. Placeholder scans for `TODO`/`FIXME`/`lorem`/`coming
soon` across `src/components/fs/marketing/`, `src/app/`, and `src/components/fs/*.tsx` returned
only form `placeholder=` attributes — no stub copy exists in the marketing surface.