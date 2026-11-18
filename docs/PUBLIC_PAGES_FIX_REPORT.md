# Public Pages Fix Report — 2026-11-17

Scope: public-facing marketing/legal pages of FoundrySignal (`D:/AI AZIMARA(AAA)/FoundrySignal`).
Billing/entitlement logic untouched.

## New routes

| Route | Section id | What it is |
|---|---|---|
| `/faq` | `faq` | Server-rendered FAQ. Reuses `FAQS` from `src/lib/seo.ts` (same corpus formerly embedded on `/methodology`; embedded copy removed). `FAQPage` + `WebPage` + breadcrumb JSON-LD; breadcrumb + nav/footer links. |
| `/terms` | `legal-terms` | Real Terms of Service (~600 words): product scope, accounts & lawful use, paid subscriptions (USDC on Solana, 30-day period), acceptable use, no-investment-advice, IP, warranty disclaimer, liability cap, termination, refunds (report to `support@foundrysignal.aiazimara.com`, operator discretion), governing law (UAE/Dubai), contact. `WebPage` + breadcrumb JSON-LD. |
| `/security` | `security` | Security model summary (dedicated infra, auth/session controls, evidence hashing, append-only audit log), vulnerability reporting (`security@foundrysignal.aiazimara.com`, PGP n/a, 2-business-day ack / 5-day triage), in/out scope, no-certification-claims. `WebPage` + breadcrumb JSON-LD + mailto CTA. `/security-disclosure` kept. |

## Files changed

- `src/lib/client/routes.ts` — Section ids `faq` / `legal-terms` / `security`; `MARKETING_PATHS`, `SECTION_PATHS`, `SECTION_TITLES`; `PUBLIC_ROUTES` gains `/faq` (0.7), `/terms` (0.3), `/security` (0.4) — sitemap picks them up automatically.
- `src/lib/seo.ts` — `FAQS` comment updated (/faq is the single render site); new `contactPageLd()` builder (WebPage→ContactPage). No `sameAs` added (see below).
- `src/components/fs/marketing/page.tsx` — new `MarketingSection` members, `SECTION_META` + `MARKETING_SECTION_PATHS`, `DOC_BLOCKS["legal-terms"]` and `DOC_BLOCKS["security"]` (real copy), `/faq` `/terms` `/security` page branches, `/contact` now emits `ContactPage` JSON-LD, `ContactSection` renders `mailto:` links, **pricing `AggregateOffer` JSON-LD computed from the live plan catalog** (`listActivePlans()`): `lowPrice 0 / highPrice 299 / offerCount 4` (Explorer $0, Researcher $39, Professional $99, Team $299; Enterprise excluded as custom; Explorer included at price 0), `/methodology` no longer embeds the FAQ (links to `/faq` instead).
- `src/components/fs/marketing/content.tsx` — `NAV` gains FAQ; footer now explicit columns: Platform = Product/Methodology/Evidence/Ecosystem/API/FAQ, Company = Pricing/About/Contact, Trust = Legal/Terms of Service/Privacy/Security/Security disclosure/**Design system**. `LEGAL_NAV` deleted.
- `src/components/fs/marketing/nav.tsx` — desktop nav renders the same `items` list as mobile (NAV + Contact); mobile unchanged. Desktop now includes Contact (and FAQ).
- `src/app/robots.ts` — merged the duplicate `User-agent: *` groups into one; **removed the blanket `/api/` disallow**; `/api/v1/admin` and `/api/v1/trading` explicitly disallowed; `/api/v1/pricing` and `/api/v1/capabilities` stay crawlable; `/discover`, `/ventures/`, `/research`, `/watchlists`, `/markets`, `/settings`, `/admin`, `/auth` remain disallowed for all groups including AI crawlers. Exactly one `User-Agent: *` group.
- `src/app/sitemap.ts` — `/faq` and `/security` added to monthly changeFrequency list (terms stays yearly default).
- `src/app/[[...fs]]/page.tsx` — `generateStaticParams` gains `faq`, `terms`, `security`. **Fixed a real bug:** `generateMetadata` matched `pathname.slice(1)` against `MARKETING_SECTION_PATHS` *keys* (section ids), so `/`, `/evidence` and `/api-docs` never got per-page metadata and were served with noindex + no title. Now matched via `pathToSection` → section id. Same helper used by the render branch.
- `public/.well-known/security.txt` — new (`Contact: mailto:security@…aiazimara.com`, `Expires: 2027-11-17`, `Preferred-Languages: en`, `Canonical`, `Policy: …/security-disclosure`). Served correctly.
- `public/llms.txt` — added FAQ, Terms, Security links; methodology line no longer claims the embedded FAQ.
- `src/lib/providers/framework.ts` — collector User-Agent `.example` → `foundrysignal.aiazimara.com`.
- `src/components/fs/auth-view.tsx` — email placeholder `you@fund.example` → `you@yourfund.com`.
- **No `.example` TLDs remain anywhere under `src/` or `public/`** (verified by grep).

## Verified via curl (production server, `bun x next start -p 3100`)

HTTP 200: `/faq`, `/terms`, `/security`, `/contact`, `/pricing`, `/methodology`, `/security-disclosure`, `/design-system`.

- `/faq` — `<title>FAQ — common questions…</title>`, JSON-LD contains `FAQPage` with `Question`/`Answer` pairs, `WebPage`, `BreadcrumbList`, visible copy (`Frequently asked questions`, 8-question corpus).
- `/terms` — real copy present (`USDC on Solana`, `30-day`, `Refunds`, `investment advice`, `support@…aiazimara.com`), `Terms of Service` title, `BreadcrumbList`, designer footer.
- `/security` — real copy present, `mailto:security@foundrysignal.aiazimara.com` (×2), `security.txt` references, `Response expectations`, `bcrypt`.
- `/contact` — `ContactPage` JSON-LD + `mailto:` links to `product@`, `security@`, `enterprise@foundrysignal.aiazimara.com` (confirmed in HTML).
- `/pricing` — `AggregateOffer` JSON-LD present with live-DB values shown above.
- `/methodology` — `FAQPage` count = 0 (embedded FAQ removed), links to `/faq` (`Common questions →`).
- Desktop nav (`<nav aria-label="Primary">`) renders Product, Methodology, Evidence, Ecosystem, API, Pricing, About, FAQ, **Contact**.
- `/robots.txt` — served; exactly one `User-Agent: *` group; `/discover` disallowed; `/api/v1/pricing` + `/api/v1/capabilities` crawlable.
- `/sitemap.xml` — lists `/terms`, `/security`, `/faq` (+ all pre-existing public routes).
- `/.well-known/security.txt` — served with the expected contents.
- `/design-system` — still `noindex, nofollow` (footer link only).
- `bun x tsc --noEmit` — clean (one transient `settings-view.tsx` error from a peer's in-flight billing edit disappeared on re-run).
- `bun run build` — succeeded (route table includes all pages).

## Notes / not done

- **`sameAs` not added to Organization JSON-LD.** No real X/GitHub/LinkedIn profile URL exists anywhere in README, package.json, docs or src (only sample/design-system URLs). Inventing one would be fabrication; left out per instructions. `SITE.twitter = "@foundrysignal"` in `seo.ts` remains a flagged placeholder handle.
- **`.next/standalone` disappeared after the build.** `next.config.ts` has `output: "standalone"` and `copy-build-assets.mjs` printed success, but the directory was gone when serving (likely a concurrent peer rebuild swapping `.next`). Worked around with `next start`, which served the fresh 11:25 build correctly. Worth checking that no other worker is running `next build` right now.
- `llms-full.txt` was not modified (task targeted `llms.txt`; it contains no FAQ references).
- `docs/PAGES_AUDIT.md` and `tool-results/` still mention `.example` addresses — historical audit artifacts left as-is (outside `src/` and `public/`).
- Terms copy is ~600 words, one block over the nominal range, kept because every clause carried real content; no placeholders.
- `/design-system` intentionally not added to the sitemap; linked only from footer Trust (`Design system`).
- `security.txt` `Expires:` set to 2027-11-17 (1 year out).
