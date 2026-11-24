// Marketing content — SERVER-SAFE components (no "use client", no hooks).
// Rendered directly by the RSC marketing pages so crawlers receive the full
// document in the initial HTML; also importable from client trees.
//
// Styling comes entirely from the design system: tokens for colour, the type
// utilities for prose, and Card/Button for interactive-looking surfaces that
// are actually plain links here (server components cannot attach handlers).

import Link from "next/link";
import {
  LogoLockup,
  SignalPrism,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Glyph,
  Icon,
  type GlyphName,
} from "@/components/fs";
import { FAQS } from "@/lib/seo";

export interface NavItem {
  label: string;
  href: string;
}

export const NAV: NavItem[] = [
  { label: "Product", href: "/product" },
  { label: "Methodology", href: "/methodology" },
  { label: "Evidence", href: "/evidence" },
  { label: "Ecosystem", href: "/ecosystem" },
  { label: "API", href: "/api-docs" },
  { label: "Pricing", href: "/pricing" },
  { label: "About", href: "/about" },
  { label: "FAQ", href: "/faq" },
];

/* ─── Footer ────────────────────────────────────────────────────────── */

function FooterColumn({ title, items }: { title: string; items: NavItem[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="fs-label">{title}</h2>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="text-xs text-ink-muted transition-colors duration-fast ease-out hover:text-ink"
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}

export function MarketingFooter() {
  return (
    <footer className="mt-auto border-t border-[var(--fs-border)] bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-8 md:flex-row md:justify-between">
          <div className="flex max-w-xs flex-col gap-3">
            <Link href="/" aria-label="FoundrySignal home" className="fs-press self-start">
              <LogoLockup size={22} />
            </Link>
            <p className="text-xs leading-relaxed text-ink-muted">
              See the builders. Verify the work. Understand the market. Research infrastructure for
              early-stage onchain venture diligence.
            </p>
            <p className="fs-data text-2xs text-ink-faint">
              Dubai, United Arab Emirates · Working name pending trademark clearance.
            </p>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-10 sm:grid-cols-3">
            <FooterColumn title="Platform" items={NAV.slice(0, 5).concat({ label: "FAQ", href: "/faq" })} />
            <FooterColumn title="Company" items={[{ label: "Pricing", href: "/pricing" }, { label: "About", href: "/about" }, { label: "Contact", href: "/contact" }]} />
            <FooterColumn
              title="Trust"
              items={[
                { label: "Legal", href: "/legal" },
                { label: "Terms of Service", href: "/terms" },
                { label: "Privacy", href: "/privacy" },
                { label: "Security", href: "/security" },
                { label: "Security disclosure", href: "/security-disclosure" },
                { label: "Accessibility", href: "/accessibility" },
                { label: "Design system", href: "/design-system" },
              ]}
            />
          </nav>
        </div>

        <div className="mt-8 flex flex-col gap-1 border-t border-[var(--fs-border)] pt-4 text-2xs text-ink-faint">
          <span>
            © {new Date().getFullYear()} FoundrySignal. Research information only — not investment
            advice.
          </span>
          <span>
            Trading execution is disabled pending product, jurisdiction, provider and security review.
            No token launchpad is operated by this platform.
          </span>
        </div>
      </div>
    </footer>
  );
}

/* ─── Hero ──────────────────────────────────────────────────────────── */

const HERO_PILLARS: Array<{ title: string; question: string; glyph: GlyphName; tone: string }> = [
  { title: "People", question: "Who is actually building?", glyph: "founder", tone: "text-[var(--fs-accent-fg)]" },
  { title: "Proof", question: "What have they actually shipped?", glyph: "development", tone: "text-[var(--fs-accent-2)]" },
  { title: "Markets", question: "What opportunities and risks exist?", glyph: "market", tone: "text-[var(--fs-warning-fg)]" },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="fs-grid-bg pointer-events-none absolute inset-0" aria-hidden="true" />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-64"
        aria-hidden="true"
        style={{ background: "var(--fs-gradient-fade-up)" }}
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:pt-24">
        <div className="fs-fade-up flex flex-col gap-7">
          <Badge tone="accent" dot className="self-start">
            Solana-native · evidence-graded research · Dubai, UAE
          </Badge>

          <h1 className="fs-brand text-4xl font-bold leading-[1.06] text-ink sm:text-5xl lg:text-4xl">
            See the builders.
            <br />
            Verify the work.
            <br />
            <span className="text-[var(--fs-accent-fg)]">Understand the market.</span>
          </h1>

          <p className="max-w-xl text-md leading-relaxed text-ink-secondary">
            FoundrySignal is the intelligence layer for onchain venture capital. Discover emerging
            companies, investigate their founders, trace the software they actually ship, and read
            every claim against its original evidence — before you commit capital.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href="/auth">Start researching</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/methodology">Read the methodology</Link>
            </Button>
          </div>

          <ul className="flex flex-wrap gap-x-8 gap-y-3 pt-2">
            {HERO_PILLARS.map((pillar) => (
              <li key={pillar.title} className="flex items-start gap-2.5">
                <span className={pillar.tone} aria-hidden="true">
                  <Glyph name={pillar.glyph} size={16} />
                </span>
                <div>
                  <div className="fs-brand text-sm font-semibold text-ink">{pillar.title}</div>
                  <div className="text-2xs text-ink-muted">{pillar.question}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto hidden lg:flex lg:flex-col lg:items-center">
          {/* Server-rendered static tier: crawlers and no-JS clients get the
              emblem plate. SignalPrism upgrades to WebGL after hydration. */}
          <SignalPrism size={340} />
          <Card variant="raised" className="mt-4 w-64">
            <CardContent className="pt-4">
              <div className="fs-label">Evidence records</div>
              <div className="fs-data mt-1 text-lg font-semibold text-ink">sha256 provenance</div>
              <p className="mt-0.5 text-2xs text-ink-muted">
                every claim traceable to its source
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

/* ─── Proof strip ───────────────────────────────────────────────────── */

const PROOF_ITEMS: Array<{ glyph: GlyphName; title: string; body: string }> = [
  {
    glyph: "evidence",
    title: "Claim Integrity Engine",
    body: "Every claim is supported, contradicted, outdated or unverified — inspect the original source.",
  },
  {
    glyph: "repository",
    title: "Repository intelligence",
    body: "Real GitHub observations: contributors, releases, commits — with provider provenance.",
  },
  {
    glyph: "onchain",
    title: "Onchain observations",
    body: "Mint metadata, authorities and activity read via @solana/kit with slot-level provenance.",
  },
  {
    glyph: "research",
    title: "Grounded AI analyst",
    body: "Answers cite collected evidence; missing evidence returns an explicit unknown.",
  },
];

export function ProofStrip() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6" aria-label="Platform capabilities">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PROOF_ITEMS.map((item) => (
          <li key={item.title} className="fs-panel fs-sheen flex flex-col gap-3 p-5">
            <span
              aria-hidden="true"
              className="flex size-9 items-center justify-center rounded-lg bg-[var(--fs-surface-3)] text-[var(--fs-accent-fg)]"
            >
              <Glyph name={item.glyph} size={18} />
            </span>
            <h2 className="fs-brand text-sm font-semibold text-ink">{item.title}</h2>
            <p className="text-xs leading-relaxed text-ink-muted">{item.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ─── Differentiator ────────────────────────────────────────────────── */

const DIFFERENTIATOR_ROWS: Array<{ label: string; typical: string; ours: string }> = [
  {
    label: "Attribution",
    typical: "Founder inferred from a commit email",
    ours: "Explicit attribution record, self-asserted until corroborated",
  },
  {
    label: "Verification",
    typical: "A green tick, assigned by whoever wrote the profile",
    ours: "Deterministic classification from collected evidence classes",
  },
  {
    label: "Freshness",
    typical: "Undated numbers that look current forever",
    ours: "Every observation marked stale past its freshness policy",
  },
  {
    label: "Absence",
    typical: "A confident paragraph where no data exists",
    ours: "An explicit 'insufficient evidence' statement",
  },
];

export function HomeDifferentiator() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6" aria-labelledby="differentiator-heading">
      <div className="fs-panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--fs-border)] px-5 py-3">
          <h2 id="differentiator-heading" className="fs-label">
            The differentiator
          </h2>
          <Badge tone="neutral" size="sm">
            provenance is the product
          </Badge>
        </div>

        <div className="divide-y divide-[var(--fs-border)]">
          {DIFFERENTIATOR_ROWS.map((row) => (
            <div key={row.label} className="grid gap-2 px-5 py-4 sm:grid-cols-[7rem_1fr_1fr]">
              <div className="fs-label pt-0.5">{row.label}</div>
              <p className="text-xs leading-relaxed text-ink-faint line-through decoration-[var(--fs-border-strong)]">
                {row.typical}
              </p>
              <p className="text-xs leading-relaxed text-ink">{row.ours}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── CTA ───────────────────────────────────────────────────────────── */

export function HomeCTA() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
      <Card variant="accent" className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="fs-brand text-lg font-semibold text-ink">
            Research the evidence, not the narrative.
          </h2>
          <p className="mt-1 max-w-lg text-xs leading-relaxed text-ink-secondary">
            Create a workspace and register the first venture. Collection starts immediately and the
            dossier fills in as real observations land.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button asChild>
            <Link href="/auth">Request access</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/pricing">See pricing</Link>
          </Button>
        </div>
      </Card>
    </section>
  );
}

/* ─── Doc section ───────────────────────────────────────────────────── */

export function DocSection({
  title,
  lede,
  blocks,
  updated,
}: {
  title: string;
  lede: string;
  blocks: Array<{ h: string; p: string }>;
  /** ISO date the copy was last revised; rendered under the lede when present. */
  updated?: string;
}) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <header className="border-b border-[var(--fs-border)] pb-6">
        <h1 className="fs-brand text-2xl font-bold text-ink">{title}</h1>
        <p className="mt-2 text-md leading-relaxed text-ink-secondary">{lede}</p>
        <p className="fs-data mt-3 text-2xs text-ink-faint">{`Last updated: ${updated}`}</p>
      </header>

      <div className="mt-8 flex flex-col gap-8">
        {blocks.map((block) => (
          <section key={block.h}>
            <h2 className="fs-brand text-base font-semibold text-ink">{block.h}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{block.p}</p>
          </section>
        ))}
      </div>
    </article>
  );
}

/* ─── FAQ ───────────────────────────────────────────────────────────── */

/**
 * AEO FAQ — native `<details>`, so it works with JS disabled and is crawlable.
 * The same content is mirrored into FAQPage JSON-LD by the page component.
 */
export function FaqSection() {
  return (
    <section className="mx-auto max-w-3xl px-4 pb-16 sm:px-6" aria-labelledby="faq-heading">
      <h2 id="faq-heading" className="fs-brand mb-4 text-lg font-semibold text-ink">
        Common questions
      </h2>
      <div className="divide-y divide-[var(--fs-border)] rounded-lg border border-[var(--fs-border)]">
        {FAQS.map((faq) => (
          <details key={faq.q} className="group">
            <summary className="fs-press flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-ink transition-colors duration-fast ease-out hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--fs-focus-ring)]">
              {faq.q}
              <span
                aria-hidden="true"
                className="shrink-0 text-ink-faint transition-transform duration-fast ease-out group-open:rotate-180"
              >
                <Icon name="chevronDown" size={14} />
              </span>
            </summary>
            <p className="px-4 pb-4 text-xs leading-relaxed text-ink-secondary">{faq.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export { CardHeader, CardTitle };