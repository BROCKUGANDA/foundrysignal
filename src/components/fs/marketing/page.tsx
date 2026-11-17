// Server-rendered marketing pages — the crawlable public surface.
// Every marketing route renders full HTML on the server (SEO/AEO), injects
// JSON-LD structured data, and stays interactive through small client islands
// (nav, session CTA). Pricing reads the real plan catalog from the database.

import Link from "next/link";
import { MarketingNav } from "./nav";
import {
  JsonLd,
  MarketingFooter,
  Hero,
  ProofStrip,
  HomeDifferentiator,
  HomeCTA,
  DocSection,
  FaqSection,
} from "./content";
import { Badge, Button, Card, EmptyState } from "@/components/fs";
import {
  pageMetadata,
  organizationLd,
  websiteLd,
  faqPageLd,
  webPageLd,
  softwareApplicationLd,
  breadcrumbLd,
  SITE,
  FAQS,
} from "@/lib/seo";
import { listActivePlans } from "@/lib/domain/billing/plans";

export type MarketingSection =
  | "home" | "product" | "methodology" | "evidence-explainer" | "ecosystem" | "api"
  | "pricing" | "about" | "contact" | "legal" | "privacy" | "security-disclosure";

/** URL path for each marketing section (single source of truth for links/canonicals). */
export const MARKETING_SECTION_PATHS: Record<MarketingSection, string> = {
  home: "/",
  product: "/product",
  methodology: "/methodology",
  "evidence-explainer": "/evidence",
  ecosystem: "/ecosystem",
  api: "/api-docs",
  pricing: "/pricing",
  about: "/about",
  contact: "/contact",
  legal: "/legal",
  privacy: "/privacy",
  "security-disclosure": "/security-disclosure",
};

interface SectionMeta {
  title: string;
  description: string;
  keywords?: string[];
}

export const SECTION_META: Record<MarketingSection, SectionMeta> = {
  home: {
    title: "FoundrySignal — See the builders. Verify the work. Understand the market.",
    description: SITE.description,
    keywords: ["venture intelligence", "Solana", "evidence graph", "founder research", "onchain analytics", "GitHub diligence", "Dubai", "UAE"],
  },
  product: {
    title: "Product — venture dossiers, founder & repository intelligence",
    description: "A research terminal for early-stage onchain ventures: discovery directory, venture dossiers, founder build passports, repository intelligence and a grounded AI analyst.",
    keywords: ["venture dossier", "founder intelligence", "repository intelligence", "Solana research platform"],
  },
  methodology: {
    title: "Methodology — how data is collected, verified and aged",
    description: "How FoundrySignal collects providers' data, classifies evidence deterministically, enforces freshness policies and produces change intelligence. Provenance is the product.",
    keywords: ["evidence verification", "data provenance", "research methodology", "claim integrity"],
  },
  "evidence-explainer": {
    title: "How evidence works — claims, sources and provenance",
    description: "Claims, immutable source snapshots with SHA-256 hashes, computed verification statuses, disputes and corrections, and AI grounding on the FoundrySignal evidence graph.",
  },
  ecosystem: {
    title: "Ecosystem — Solana-native, provider-agnostic",
    description: "Solana reads via @solana/kit, indexed providers, Jupiter market context, GitHub repository intelligence and the conflict-of-interest register.",
  },
  api: {
    title: "Research API — the venture intelligence graph",
    description: "Versioned REST API with a uniform envelope, cursor pagination, typed errors, API keys and plan-driven entitlements for institutional research access.",
  },
  pricing: {
    title: "Pricing — plans for analysts, teams and institutions",
    description: "FoundrySignal plans: Explorer, Researcher, Professional, Team and Enterprise. Plans are configuration data — paid tiers buy capability, never credibility.",
    keywords: ["venture research pricing", "research plans", "Solana analytics pricing"],
  },
  about: {
    title: "About — why we build",
    description: "FoundrySignal exists because early-stage onchain diligence is broken: narrative outruns evidence. Based in Dubai, serving a global research audience.",
  },
  contact: {
    title: "Contact — research, security and enterprise",
    description: "Contact FoundrySignal for research and product questions, security disclosure, and enterprise API access. Issuer Response Center for founder corrections.",
  },
  legal: {
    title: "Legal — status of this deployment",
    description: "Plain-language status: a research and information service — not investment advice, broker-dealer, exchange, custodian or launchpad. Review gates before activation.",
  },
  privacy: {
    title: "Privacy — what we collect and how it is removed",
    description: "Account data, research data, public founder data and logs: what FoundrySignal collects, why, and how deletion works.",
  },
  "security-disclosure": {
    title: "Security disclosure — coordinated disclosure & posture",
    description: "How to report security issues to FoundrySignal, the controls in this deployment, known boundaries and responsible-scope expectations.",
  },
};

export function marketingMetadata(section: MarketingSection) {
  const meta = SECTION_META[section];
  return pageMetadata({ ...meta, path: MARKETING_SECTION_PATHS[section] });
}

const DOC_BLOCKS: Record<string, Array<{ h: string; p: string }>> = {
  product: [
    { h: "Discovery", p: "The venture directory lists registered ventures with category and ecosystem filters, full-text search, sorting and saved searches. Result origin is disclosed: ventures appear because a researcher registered them and collectors verified associations — never because someone paid for placement." },
    { h: "Venture dossier", p: "The flagship research surface. Nine independently loading tabs — Overview, Founders, Product, Development, Evidence, Onchain, Markets, History, Reports. A failed provider request degrades one tab; it never removes founder profiles or deletes evidence." },
    { h: "Founder intelligence", p: "Public founder profiles with attributed histories, project relationships and public repository contributions. Identities, aliases and accounts are separated records with explicit attribution confidence. A GitHub account, wallet or social username is never automatically equated to a person." },
    { h: "Repository intelligence", p: "GitHub organizations, contributors, commit activity, releases, languages and historical snapshots are collected through the authorized REST API with rate-limit discipline. Contributors, bots, maintainers and founders are different relationships and are displayed as such." },
    { h: "AI research analyst", p: "Ask a question; the analyst retrieves evidence, compares it, detects contradictions and returns an eleven-section report where every factual statement cites a collected evidence record. Missing evidence yields explicit 'insufficient evidence' statements — never invention." },
    { h: "Markets & trading surface", p: "Token structures, market snapshots with asOf timestamps, and quote previews through Jupiter's API. Execution is implemented behind a release gate that is held OFF pending product, jurisdiction, provider and security review." },
  ],
  methodology: [
    { h: "Collection", p: "Every external datum is collected server-side through a provider adapter that records the provider, collection time, observation time, content hash (SHA-256), collector version and transformation version. GitHub via the authorized REST API with rate-limit header compliance; Solana via @solana/kit read calls recording slot and data sources; websites via an SSRF-guarded fetcher; market data via Jupiter's Price API V3 with asOf timestamps." },
    { h: "Verification classification", p: "Evidence is classified only by a deterministic engine: INDEPENDENTLY_CORROBORATED (two or more independent source types agree), SOURCE_CONFIRMED (one authoritative provider observation), SELF_ASSERTED (the venture's own material), FOUNDER_PROVIDED (issuer workflow), DISPUTED (contradicting evidence exists), STALE (past its freshness policy) or UNKNOWN. No human may fabricate a verification state; corrections create new auditable records." },
    { h: "Freshness policies", p: "Starting policies: repository metadata daily or on webhook; releases near real time; product website daily; token metadata revalidated on change; market prices licensed-dependent; historical evidence immutable. Data past policy is marked STALE, never silently refreshed or deleted." },
    { h: "Change intelligence", p: "Snapshots are immutable. Diffing two observations produces change records — a new release, a changed token authority, a removed repository — which drive alerts and the venture History tab." },
    { h: "What we do not do", p: "We do not sell classifications or placement, merge providers as if equivalent, treat holders as verified users, treat onchain activity as company revenue, generate investment advice, or fabricate data when a provider fails. Unavailable providers produce honest unavailable states." },
  ],
  "evidence-explainer": [
    { h: "Claims and sources", p: "A claim is a canonical, disputable statement — 'Alice is the founder', 'the mint authority is revoked'. A source is an immutable provenance record pointing at the original material. Claim–evidence links carry a relation: SUPPORTS, CONTRADICTS or NEUTRAL. Claim status is computed from its links." },
    { h: "Snapshots and hashing", p: "When a collector fetches a source it stores an immutable snapshot with a SHA-256 content hash. Two snapshots of the same source can be diffed to produce change intelligence. You can always inspect the original payload and open the source URL." },
    { h: "Statuses you will see", p: "CORROBORATED (independently supported) Â· CONFIRMED (authoritative provider) Â· SELF-ASSERTED (venture's own claim) Â· FOUNDER (issuer-provided) Â· DISPUTED (contradicted) Â· STALE (past freshness policy) Â· UNKNOWN (no linked evidence). These are computed, not asserted." },
    { h: "Disputes and corrections", p: "Anyone can raise a dispute or a correction. Administrators cannot silently modify original observations — a correction creates a new auditable record referencing the original, and disputed material is visibly labeled." },
    { h: "AI grounding", p: "The research analyst can only cite evidence that was actually retrieved for your tenant, and its citations are validated server-side before publication. If evidence cannot establish a point, the report says so explicitly. External content is treated as untrusted data, with injection filtering applied." },
  ],
  ecosystem: [
    { h: "Solana", p: "Onchain reads run through @solana/kit against a dedicated RPC endpoint, with the public mainnet RPC as default. Mint identification, token metadata, authorities, token accounts and bounded transaction history are read-only in this release. Wallet connectivity follows the Wallet Standard; signing always happens in the user's own wallet." },
    { h: "Indexed providers", p: "Helius (or an equivalent indexed provider) extends throughput and enhanced APIs. Where credentials are absent, the integration is reported as MISCONFIGURED — the adapter contract exists and the UI shows an honest unavailable state instead of synthetic data." },
    { h: "Market infrastructure", p: "Market snapshots and quote previews use Jupiter's current APIs. The managed order-and-execute flow (/order â†’ wallet signing â†’ /execute) is implemented behind the trading release gate, disabled by default." },
    { h: "Repository intelligence", p: "GitHub REST API v3 with webhook reconciliation and strict rate-limit discipline. Webhooks are signature-verified; reconciliation covers missed events." },
    { h: "Conflict-of-interest register", p: "This deployment carries no paid listings, issuer relationships or promotional arrangements. Any future commercial relationship with a covered venture will be disclosed here, and research conclusions will remain separated from commercial data by construction." },
  ],
  api: [
    { h: "Contract", p: "Versioned REST under /api/v1 with a uniform envelope: every response carries success, data, typed error codes (code, message, retryable, requestId, details) and metadata (requestId, timestamp, version, nextCursor). Cursor pagination for large datasets; idempotency keys on write operations where retries could duplicate." },
    { h: "Modules", p: "Authentication Â· Ventures Â· Founders Â· Repositories Â· Evidence Â· Research Â· Markets Â· Watchlists Â· Alerts Â· Reports Â· Workspace Â· Billing Â· Administration. Each module owns its business rules and validation; the frontend never constructs provider requests directly." },
    { h: "Access & metering", p: "API keys are hashed at rest with scoped access and per-endpoint metering. Entitlements are plan-driven configuration — prices and limits are data, never hardcoded." },
    { h: "Availability", p: "The API is operational in this deployment for authenticated access. Commercial API distribution is gated behind billing configuration and legal review." },
  ],
  about: [
    { h: "Why we build", p: "Capital formation onchain moves faster than verification. Founders are judged by follower counts; projects are priced before their repositories show a second contributor. A research layer that shows what was actually built, by whom, with which evidence, is prerequisite infrastructure for honest markets." },
    { h: "Principles", p: "Evidence over narrative. Provenance over aggregation. Attribution confidence over false certainty. Research credibility over token speculation. Explicit unknowns over confident invention." },
    { h: "Where we operate", p: "FoundrySignal operates from Dubai, United Arab Emirates, and serves a global research audience. Geo-targeting signals across this site declare the UAE as the primary market region." },
    { h: "Working name", p: "FoundrySignal is a working name pending professional name and trademark clearance." },
    { h: "Status", p: "This deployment is a real, operating research platform with live provider integrations. Trading execution is deliberately gated. Commercial features require legal review gates before activation. We do not present the platform as legally compliant or investment-ready without appropriate professional assessment." },
  ],
  legal: [
    { h: "What this platform is", p: "A research and information service. It aggregates public data (websites, public repositories, public onchain records, licensed market data) into research dossiers with provenance." },
    { h: "What it is not", p: "It is not investment advice, not a broker-dealer or exchange, not a custodian, and not a token launchpad. Nothing here is a recommendation to buy or sell any asset. Trading execution is disabled pending legal and security review gates." },
    { h: "Review gates", p: "Paid research services, investment-related features, issuer services, custody, trading and geographic availability each require an independent professional legal review before activation. No claim of legal compliance is made anywhere in this product." },
    { h: "Data rights", p: "Public data is processed for research purposes with source attribution. Founder-facing privacy, correction, dispute, retention and deletion processes are documented and operational." },
  ],
  privacy: [
    { h: "Account data", p: "Email (hashed for lookup), display name, bcrypt password hash, session records and audit events of your own actions. Sessions are opaque tokens stored hashed; cookies are HttpOnly and SameSite." },
    { h: "Research data", p: "Ventures you register, watchlists, saved searches, notes, research runs and reports belong to your workspace and are never retrieved for another tenant. Deletion of your account soft-deletes the account and revokes sessions; workspace objects follow the documented retention policy." },
    { h: "Public founder data", p: "Founder profiles contain only publicly attributable information with source links. We do not expose private contact data, and we never equate an account to a person without evidence-backed attribution." },
    { h: "Logs", p: "Structured logs exclude access tokens, private keys, wallet secrets and sensitive personal notes. Provider rate-limit and health telemetry contains no user content." },
  ],
  "security-disclosure": [
    { h: "How to report", p: "Email product@foundrysignal.aiazimara.com with reproduction steps. We acknowledge reports within two business days and will not pursue action against good-faith research that respects user data." },
    { h: "Controls in this deployment", p: "bcrypt password hashing Â· opaque hashed sessions with server-side revocation Â· RBAC with workspace tenancy enforced at the service layer Â· zod validation at every API boundary Â· SSRF-guarded fetching with private-range and metadata-endpoint denial Â· CSP, nosniff and referrer policies Â· CSRF defense via SameSite + origin verification Â· append-only audit log Â· webhook signature verification (HMAC, timing-safe) for billing providers." },
    { h: "Known boundaries", p: "Authentication capabilities (email delivery via Resend, OAuth provider credentials, and an MFA encryption key) are environment-configured for this deployment where indicated by the capability registry; interactive enablement may still require provider-side callback/domain registration and user enrollment. Secrets live in environment configuration; no signing material exists anywhere in the application because execution is gated." },
    { h: "Responsible scope", p: "Do not test against third-party providers' infrastructure beyond their published policies, and do not access other tenants' data. Findings affecting real users are prioritized." },
  ],
};

const CONTACT_CHANNELS: Array<[string, string]> = [
  ["Research & product", "product@foundrysignal.aiazimara.com"],
  ["Security disclosure", "product@foundrysignal.aiazimara.com"],
  ["Enterprise & API", "product@foundrysignal.aiazimara.com"],
];

// â”€â”€â”€ Pricing (server-rendered from the real catalog) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const PLAN_COPY: Record<string, { note: string; features: string[] }> = {
  EXPLORER: { note: "Get oriented in the ecosystem.", features: ["Discovery directory", "Public dossiers", "Saved ventures (limited)", "Community evidence view"] },
  RESEARCHER: { note: "For independent analysts.", features: ["Full dossier access", "AI research runs (metered)", "Watchlists & alerts", "Report export"] },
  PROFESSIONAL: { note: "For active diligence.", features: ["Everything in Researcher", "Comparative research", "Saved searches", "Priority collection queue"] },
  TEAM: { note: "For research groups.", features: ["Research rooms (shared workspaces)", "Analyst roles & permissions", "API access (metered)", "Audit exports"] },
  ENTERPRISE: { note: "For institutions.", features: ["Research API at scale", "SSO / SCIM roadmap", "Custom collection scopes", "Dedicated support"] },
};

function formatPlanPrice(p: { monthlyPriceMicros: number; enterprise: boolean }): string {
  if (p.enterprise) return "Custom";
  if (p.monthlyPriceMicros === 0) return "$0";
  return `$${Math.round(p.monthlyPriceMicros / 1_000_000)}/mo`;
}

async function PricingSSR() {
  let plans: Awaited<ReturnType<typeof listActivePlans>> | null = null;
  let unavailable: string | null = null;
  try {
    plans = await listActivePlans();
  } catch (err) {
    unavailable = err instanceof Error ? err.message : "catalog unavailable";
  }

  const featuredIndex = plans?.findIndex((p) => p.code === "PROFESSIONAL") ?? -1;

  return (
    <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <h1 className="fs-brand text-2xl font-bold text-ink">Pricing</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
        Plans are configuration data, not hardcoded entitlements. Trust classifications are never for
        sale — paid tiers buy capability, not credibility.
      </p>

      {unavailable ? (
        <p role="alert" className="mt-3 text-xs leading-relaxed text-[var(--fs-warning-fg)]">
          Plan catalog temporarily unavailable ({unavailable}). Reload this page to retry — prices
          are never shown from a stale cache.
        </p>
      ) : null}

      {plans && plans.length === 0 ? (
        <EmptyState
          className="mt-8"
          glyph="product"
          title="No plans are published"
          description="The plan catalog is empty. Pricing is configuration data, so nothing is inferred or defaulted here."
        />
      ) : null}

      <ul className="mt-8 grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        {(plans ?? []).map((plan, index) => {
          const copy = PLAN_COPY[plan.code] ?? { note: "", features: [] };
          const featured = index === featuredIndex;
          return (
            <li key={plan.code}>
              <Card
                variant={featured ? "accent" : "default"}
                className="flex h-full flex-col p-5"
                aria-current={featured ? "true" : undefined}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="fs-label">{plan.name}</span>
                  {featured ? (
                    <Badge tone="accent" size="sm">
                      most chosen
                    </Badge>
                  ) : null}
                </div>
                <div className="fs-data mt-2 text-xl font-semibold text-ink">
                  {formatPlanPrice(plan)}
                </div>
                <p className="mt-1 text-2xs leading-snug text-ink-muted">{copy.note}</p>
                <ul className="mt-4 flex flex-1 flex-col gap-2">
                  {copy.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-xs text-ink-secondary">
                      <span
                        aria-hidden="true"
                        className="mt-1.5 size-1 shrink-0 rounded-full bg-[var(--fs-accent)]"
                      />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button
                  asChild
                  variant={featured ? "primary" : "outline"}
                  size="sm"
                  className="mt-4 w-full"
                >
                  <Link href={plan.enterprise ? "/contact" : "/auth"}>
                    {plan.enterprise ? "Contact us" : `Start with ${plan.name}`}
                  </Link>
                </Button>
              </Card>
            </li>
          );
        })}
      </ul>

      <p className="mt-6 text-2xs leading-relaxed text-ink-faint">
        Checkout availability depends on billing-provider configuration; it surfaces a
        configuration-required state rather than simulating payments. Paid research services, issuer
        services and trading features additionally require independent legal review gates before
        activation.
      </p>
    </section>
  );
}

function ContactSection() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
      <h1 className="fs-brand text-2xl font-bold text-ink">Contact</h1>

      <ul className="mt-6 grid gap-4 sm:grid-cols-3">
        {CONTACT_CHANNELS.map(([title, address]) => (
          <li key={title}>
            <Card className="h-full p-5">
              <div className="fs-label">{title}</div>
              <div className="fs-data mt-2 break-all text-xs text-[var(--fs-accent-fg)]">
                {address}
              </div>
            </Card>
          </li>
        ))}
      </ul>

      <Card className="mt-4 p-5">
        <h2 className="fs-label">Issuer Response Center</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
          Founders can submit corrections, link official accounts, provide additional evidence and
          respond to disputed claims — without purchasing favorable classifications. Founder-provided
          material is always labeled FOUNDER_PROVIDED and never upgrades trust classification by
          itself.
        </p>
      </Card>
    </section>
  );
}

// â”€â”€â”€ Page composition â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function MarketingPage({ section }: { section: MarketingSection }) {
  const path = MARKETING_SECTION_PATHS[section];
  const meta = SECTION_META[section];

  const breadcrumb = (name: string) =>
    breadcrumbLd([{ name: "FoundrySignal", path: "/" }, { name, path }]);

  return (
    <div className="flex min-h-dvh flex-col">
      <JsonLd
        data={[
          organizationLd(),
          websiteLd(),
          ...(section === "home" ? [] : [breadcrumb(meta.title.split("—")[0].trim())]),
        ]}
      />
      <MarketingNav />
      <main id="fs-main" className="flex-1">
        {section === "home" && (
          <>
            <Hero />
            <ProofStrip />
            <HomeDifferentiator />
            <HomeCTA />
          </>
        )}

        {section === "product" && (
          <>
            <JsonLd data={softwareApplicationLd()} />
            <DocSection title="Product" lede="A research terminal for early-stage onchain ventures — built around the venture dossier and the evidence graph." blocks={DOC_BLOCKS.product} />
          </>
        )}

        {section === "methodology" && (
          <>
            <JsonLd
              data={[
                webPageLd({ path, name: meta.title, description: meta.description, speakableCss: ["h1", ".fs-panel h2"] }),
                faqPageLd(FAQS.map((f) => ({ q: f.q, a: f.a }))),
              ]}
            />
            <DocSection title="Methodology" lede="How data enters FoundrySignal, how it is validated, and how it ages. Provenance is not a feature — it is the product." blocks={DOC_BLOCKS.methodology} />
            <FaqSection />
          </>
        )}

        {section === "evidence-explainer" && (
          <DocSection title="How evidence works" lede="Every research surface in FoundrySignal is a view over the same evidence graph." blocks={DOC_BLOCKS["evidence-explainer"]} />
        )}

        {section === "ecosystem" && (
          <DocSection title="Ecosystem" lede="Solana-first, provider-agnostic by construction." blocks={DOC_BLOCKS.ecosystem} />
        )}

        {section === "api" && (
          <DocSection title="Research API" lede="The venture intelligence graph, available to institutional customers and authorized applications." blocks={DOC_BLOCKS.api} />
        )}

        {section === "pricing" && <PricingSSR />}

        {section === "about" && (
          <DocSection title="About" lede="FoundrySignal exists because early-stage onchain diligence is broken: narrative outruns evidence." blocks={DOC_BLOCKS.about} />
        )}

        {section === "contact" && <ContactSection />}

        {section === "legal" && (
          <DocSection title="Legal" lede="Plain-language status of this deployment. This is not legal advice and not a substitute for professional assessment." blocks={DOC_BLOCKS.legal} />
        )}

        {section === "privacy" && (
          <DocSection title="Privacy" lede="What we collect, why, and how it is removed." blocks={DOC_BLOCKS.privacy} />
        )}

        {section === "security-disclosure" && (
          <DocSection title="Security disclosure" lede="Coordinated disclosure policy and current security posture." blocks={DOC_BLOCKS["security-disclosure"]} />
        )}
      </main>
      <MarketingFooter />
    </div>
  );
}

