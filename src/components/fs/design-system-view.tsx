"use client";

/**
 * Design-system playground — `/design-system`.
 *
 * Every component, every variant, every state, on one page. This is the
 * contract surface: if a state is not reachable here, it is not part of the
 * system. It also serves as the visual-regression target.
 *
 * Sections mirror the package layout (brand → ui → domain → motion) so the
 * page doubles as the table of contents for the documentation.
 */

import * as React from "react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  ClaimBadge,
  Dialog,
  DialogContent,
  DialogFooter,
  Drawer,
  DrawerContent,
  EmptyState,
  ErrorState,
  EvidenceCard,
  EvidenceGraph,
  Field,
  ForbiddenState,
  FounderCard,
  FounderGraph,
  Icon,
  Input,
  LineChart,
  LoadingState,
  LogoCompact,
  LogoEmblem,
  LogoLockup,
  LogoStacked,
  LogoWordmark,
  BrandMark,
  BrandSpinner,
  ConvergenceLoader,
  MotionToggle,
  OfflineState,
  RadioGroup,
  SegmentedControl,
  Select,
  SignalPrism,
  Skeleton,
  SkeletonText,
  Sparkline,
  StaleBanner,
  Switch,
  TabbedPanels,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Textarea,
  ThemeMenuItems,
  ThemeToggle,
  TokenCard,
  Tooltip,
  VerificationBadge,
  VentureCard,
  GLYPHS,
  ICONS,
  useFsTheme,
  useMotionOK,
  motion as motionTokens,
  PartialBanner,
  Pagination,
  ResearchComposer,
  ResearchReport,
  RunStatusStrip,
  SignalTimeline,
  RepositoryPanel,
  DegradedState,
  StaleBadge,
  type GlyphName,
  type IconName,
  type ViewState,
} from "@/components/fs";

/* ─── Layout helpers ────────────────────────────────────────────────── */

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-[var(--fs-border)] pt-10">
      <header className="mb-6">
        <h2 className="fs-brand text-xl font-semibold text-ink">{title}</h2>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">{description}</p>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function Row({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-[var(--fs-border-subtle)] py-4 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="fs-label">{label}</span>
        {note ? <span className="text-2xs text-ink-faint">{note}</span> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2.5">{children}</div>
    </div>
  );
}

function Swatch({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="h-12 w-full rounded-md border border-[var(--fs-border)]"
        style={{ background: value }}
        aria-hidden="true"
      />
      <div className="fs-data text-2xs text-ink">{name}</div>
      <div className="fs-data text-2xs text-ink-faint">{value}</div>
    </div>
  );
}

/* ─── Sample data ───────────────────────────────────────────────────── */

const SAMPLE_VENTURE = {
  id: "v1",
  slug: "sample-venture",
  name: "Orbital Labs",
  tagline: "Deterministic settlement for onchain credit markets.",
  category: "DEFI",
  ecosystem: "SOLANA",
  status: "ACTIVE",
  website: "https://example.com",
  repoCount: 6,
  tokenCount: 1,
  evidenceCount: 142,
  claimCount: 18,
  createdAt: new Date(Date.now() - 86_400_000 * 40).toISOString(),
  updatedAt: new Date(Date.now() - 3_600_000).toISOString(),
};

const SAMPLE_GRAPH_NODES = [
  { id: "v", kind: "VENTURE" as const, label: "Orbital Labs" },
  { id: "f1", kind: "FOUNDER" as const, label: "A. Mensah", verification: "SOURCE_CONFIRMED" },
  { id: "f2", kind: "FOUNDER" as const, label: "R. Okonkwo", verification: "SELF_ASSERTED" },
  { id: "r1", kind: "REPOSITORY" as const, label: "orbital/core" },
  { id: "r2", kind: "REPOSITORY" as const, label: "orbital/sdk" },
  { id: "c1", kind: "CLAIM" as const, label: "Audited by Zellic", verification: "SUPPORTED" },
  { id: "c2", kind: "CLAIM" as const, label: "$40M TVL", verification: "CONTRADICTED" },
  { id: "t1", kind: "TOKEN" as const, label: "ORB", verification: "VERIFIED" },
];

const SAMPLE_GRAPH_EDGES = [
  { from: "v", to: "f1", relation: "ATTRIBUTED" },
  { from: "v", to: "f2", relation: "ATTRIBUTED" },
  { from: "v", to: "r1", relation: "ASSOCIATED" },
  { from: "v", to: "r2", relation: "ASSOCIATED" },
  { from: "v", to: "c1", relation: "SUPPORTS" },
  { from: "v", to: "c2", relation: "CONTRADICTS" },
  { from: "v", to: "t1", relation: "ISSUES" },
];

const SAMPLE_SERIES = [
  {
    id: "price",
    label: "Price (USD)",
    points: Array.from({ length: 14 }, (_, i) => ({
      x: new Date(Date.now() - (13 - i) * 86_400_000).toISOString(),
      y: 0.42 + Math.sin(i / 2.1) * 0.09 + i * 0.004,
    })),
  },
];

/* ─── Page ──────────────────────────────────────────────────────────── */

const NAV_SECTIONS = [
  { id: "brand", label: "Brand" },
  { id: "tokens", label: "Tokens" },
  { id: "typography", label: "Typography" },
  { id: "buttons", label: "Buttons" },
  { id: "badges", label: "Badges" },
  { id: "forms", label: "Forms" },
  { id: "surfaces", label: "Surfaces" },
  { id: "tables", label: "Tables" },
  { id: "overlays", label: "Overlays" },
  { id: "states", label: "States" },
  { id: "domain", label: "Domain" },
  { id: "viz", label: "Visualization" },
  { id: "motion", label: "Motion" },
  { id: "theme", label: "Theme" },
] as const;

export function DesignSystemPlayground() {
  const { mode, resolved } = useFsTheme();
  const motionOK = useMotionOK();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [segmented, setSegmented] = React.useState<"a" | "b" | "c">("a");
  const [question, setQuestion] = React.useState("What has this venture verifiably shipped?");
  const [prismTier, setPrismTier] = React.useState<"auto" | "webgl" | "canvas2d" | "static">("auto");

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-10 sm:px-6">
      {/* Header */}
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="fs-brand text-2xl font-bold text-ink">Design system</h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">
              Every component, variant and state in the FoundrySignal system. Theme is{" "}
              <span className="fs-data text-ink">{mode}</span> (resolved{" "}
              <span className="fs-data text-ink">{resolved}</span>), motion is{" "}
              <span className="fs-data text-ink">{motionOK ? "on" : "reduced"}</span>.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Tooltip content="Switch theme from the header on any page">
              <span className="fs-data rounded border border-[var(--fs-border)] px-2 py-1 text-2xs text-ink-faint">
                tokens
              </span>
            </Tooltip>
          </div>
        </div>

        <nav aria-label="Sections" className="fs-scroll flex gap-1.5 overflow-x-auto pb-1">
          {NAV_SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="fs-press whitespace-nowrap rounded-full border border-[var(--fs-border)] px-3 py-1 text-2xs text-ink-muted transition-colors duration-fast ease-out hover:border-[var(--fs-border-strong)] hover:text-ink"
            >
              {section.label}
            </a>
          ))}
        </nav>
      </header>

      {/* ── Brand ─────────────────────────────────────────────────── */}
      <Section
        id="brand"
        title="Brand"
        description="Editable SVG masters live in public/brand. The React components render the same geometry, so the marks and the code cannot drift."
      >
        <Row label="Emblem" note="32px grid, accent node">
          <LogoEmblem size={32} />
          <LogoEmblem size={24} />
          <LogoEmblem size={16} />
          <LogoEmblem size={32} mono />
        </Row>

        <Row label="Wordmark">
          <LogoWordmark size={17} />
          <LogoWordmark size={24} />
          <LogoWordmark size={17} mono />
        </Row>

        <Row label="Lockups">
          <LogoLockup size={26} />
          <LogoCompact size={24} />
          <BrandMark size={32} />
          <LogoStacked size={36} wordmarkSize={15} />
        </Row>

        <Row label="Signal Prism" note="3D brand object — three capability tiers">
          <div className="flex flex-col gap-2">
            <SegmentedControl
              ariaLabel="Prism render tier"
              value={prismTier}
              onValueChange={setPrismTier}
              options={[
                { value: "auto", label: "Auto" },
                { value: "webgl", label: "WebGL" },
                { value: "canvas2d", label: "Canvas 2D" },
                { value: "static", label: "Static" },
              ]}
            />
            <div className="flex flex-wrap items-start gap-4">
              <SignalPrism
                size={200}
                forceTier={prismTier === "auto" ? undefined : prismTier}
              />
              <div className="flex flex-col gap-2">
                <SignalPrism size={120} forceTier="static" />
                <span className="fs-data text-2xs text-ink-faint">static fallback</span>
              </div>
            </div>
          </div>
        </Row>

        <Row label="Loading animation">
          <ConvergenceLoader size={80} />
          <ConvergenceLoader size={56} withWordmark />
          <BrandSpinner size={20} />
        </Row>

        <Row label="Domain glyphs" note={`${Object.keys(GLYPHS).length} venture-intelligence glyphs`}>
          <div className="grid grid-cols-8 gap-3 sm:grid-cols-11">
            {(Object.keys(GLYPHS) as GlyphName[]).map((name) => {
              const GlyphComponent = GLYPHS[name];
              return (
                <div key={name} className="flex flex-col items-center gap-1">
                  <span className="flex size-8 items-center justify-center rounded-md border border-[var(--fs-border)] text-ink-secondary">
                    <GlyphComponent size={16} />
                  </span>
                  <span className="fs-data text-center text-2xs text-ink-faint">{name}</span>
                </div>
              );
            })}
          </div>
        </Row>

        <Row label="Interface glyphs" note={`${Object.keys(ICONS).length} generic affordances`}>
          <div className="grid grid-cols-8 gap-3 sm:grid-cols-11">
            {(Object.keys(ICONS) as IconName[]).map((name) => {
              const IconComponent = ICONS[name];
              return (
                <div key={name} className="flex flex-col items-center gap-1">
                  <span className="flex size-8 items-center justify-center rounded-md border border-[var(--fs-border)] text-ink-secondary">
                    <IconComponent size={16} />
                  </span>
                  <span className="fs-data text-center text-2xs text-ink-faint">{name}</span>
                </div>
              );
            })}
          </div>
        </Row>
      </Section>

      {/* ── Tokens ────────────────────────────────────────────────── */}
      <Section
        id="tokens"
        title="Tokens"
        description="Semantic tokens only. Components never read the raw ramps in tokens.css — every surface below re-colours itself when the theme flips."
      >
        <Row label="Surfaces" note="bg / surface / surface-2 / surface-3 / surface-4">
          <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-5">
            <Swatch name="--fs-bg" value="var(--fs-bg)" />
            <Swatch name="--fs-surface" value="var(--fs-surface)" />
            <Swatch name="--fs-surface-2" value="var(--fs-surface-2)" />
            <Swatch name="--fs-surface-3" value="var(--fs-surface-3)" />
            <Swatch name="--fs-surface-4" value="var(--fs-surface-4)" />
          </div>
        </Row>

        <Row label="Text" note="ink / secondary / muted / faint">
          <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
            <Swatch name="--fs-text" value="var(--fs-text)" />
            <Swatch name="--fs-text-secondary" value="var(--fs-text-secondary)" />
            <Swatch name="--fs-text-muted" value="var(--fs-text-muted)" />
            <Swatch name="--fs-text-faint" value="var(--fs-text-faint)" />
          </div>
        </Row>

        <Row label="Semantic states" note="accent / success / warning / danger / info">
          <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-5">
            <Swatch name="accent" value="var(--fs-accent)" />
            <Swatch name="success" value="var(--fs-success)" />
            <Swatch name="warning" value="var(--fs-warning)" />
            <Swatch name="danger" value="var(--fs-danger)" />
            <Swatch name="info" value="var(--fs-info)" />
          </div>
        </Row>

        <Row label="Chart series" note="distinguishable in both themes">
          <div className="grid w-full grid-cols-3 gap-3 sm:grid-cols-6">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <Swatch key={n} name={`chart-${n}`} value={`var(--fs-chart-${n})`} />
            ))}
          </div>
        </Row>

        <Row label="Radius">
          {(["xs", "sm", "md", "lg", "xl", "2xl"] as const).map((r) => (
            <div key={r} className="flex flex-col items-center gap-1">
              <div
                className="size-10 border border-[var(--fs-border-strong)] bg-surface-2"
                style={{ borderRadius: `var(--fs-radius-${r})` }}
              />
              <span className="fs-data text-2xs text-ink-faint">{r}</span>
            </div>
          ))}
        </Row>

        <Row label="Elevation">
          {(["1", "2", "3", "4"] as const).map((e) => (
            <div key={e} className="flex flex-col items-center gap-1">
              <div
                className="size-14 rounded-md border border-[var(--fs-border)] bg-surface"
                style={{ boxShadow: `var(--fs-elevation-${e})` }}
              />
              <span className="fs-data text-2xs text-ink-faint">e{e}</span>
            </div>
          ))}
        </Row>

        <Row label="Spacing scale" note="4px base">
          {(["1", "2", "3", "4", "5", "6", "8", "10", "12", "16"] as const).map((s) => (
            <div key={s} className="flex flex-col items-center gap-1">
              <div
                className="rounded-sm bg-[var(--fs-accent-subtle)]"
                style={{ width: `var(--fs-space-${s})`, height: "1.25rem" }}
              />
              <span className="fs-data text-2xs text-ink-faint">{s}</span>
            </div>
          ))}
        </Row>
      </Section>

      {/* ── Typography ────────────────────────────────────────────── */}
      <Section
        id="typography"
        title="Typography"
        description="Space Grotesk for brand and headings, Geist Sans for UI, Geist Mono for data. Three families, one scale."
      >
        <Row label="Scale">
          <div className="flex w-full flex-col gap-2">
            <p className="fs-brand text-4xl font-bold text-ink">Display — 4xl</p>
            <p className="fs-brand text-3xl font-semibold text-ink">Heading — 3xl</p>
            <p className="fs-brand text-2xl font-semibold text-ink">Title — 2xl</p>
            <p className="fs-brand text-xl font-semibold text-ink">Section — xl</p>
            <p className="text-lg text-ink">Lead — lg</p>
            <p className="text-md text-ink-secondary">Body — md. The default reading size.</p>
            <p className="text-sm text-ink-secondary">Small — sm. Controls and dense prose.</p>
            <p className="text-xs text-ink-muted">Caption — xs. Secondary metadata.</p>
            <p className="text-2xs text-ink-faint">Micro — 2xs. Table metadata, axis labels.</p>
          </div>
        </Row>

        <Row label="Families">
          <p className="fs-brand text-lg text-ink">Space Grotesk · brand</p>
          <p className="text-lg text-ink">Geist Sans · interface</p>
          <p className="fs-data text-lg text-ink">Geist Mono · 1,234.56</p>
        </Row>

        <Row label="Utilities" note="fs-label / fs-data / fs-num / fs-truncate">
          <span className="fs-label">section label</span>
          <span className="fs-data text-xs text-ink">sha256:e3b0c442…</span>
          <span className="fs-num text-xs text-ink">12345.6789</span>
          <span className="fs-truncate max-w-32 text-xs text-ink">
            a very long value that must be truncated
          </span>
        </Row>
      </Section>

      {/* ── Buttons ───────────────────────────────────────────────── */}
      <Section
        id="buttons"
        title="Buttons"
        description="The reference implementation of the state contract: default, hover, focus, active, disabled, loading."
      >
        <Row label="Variants">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Link</Button>
          <Button variant="destructive">Destructive</Button>
        </Row>

        <Row label="Sizes">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
          <Button size="icon" aria-label="Refresh">
            <Icon name="refresh" size={15} />
          </Button>
          <Button size="icon-sm" aria-label="Close">
            <Icon name="close" size={14} />
          </Button>
        </Row>

        <Row label="With icon">
          <Button>
            <Icon name="plus" size={15} />
            Register venture
          </Button>
          <Button variant="outline">
            <Icon name="externalLink" size={14} />
            Open source
          </Button>
        </Row>

        <Row label="Disabled">
          <Button disabled>Disabled</Button>
          <Button variant="outline" disabled>
            Disabled
          </Button>
          <Button disabledReason="Trading execution is gated" disabled>
            Gated action
          </Button>
        </Row>

        <Row label="Loading" note="aria-busy, activation blocked, label still announced">
          <Button loading loadingLabel="Saving">
            Save
          </Button>
          <Button variant="outline" loading>
            Save
          </Button>
          <Button variant="ghost" loading aria-label="Saving" />
        </Row>
      </Section>

      {/* ── Badges ────────────────────────────────────────────────── */}
      <Section
        id="badges"
        title="Badges"
        description="Colour is never the only signal — every tone pairs with a shape cue or a label."
      >
        <Row label="Tones">
          <Badge tone="neutral">neutral</Badge>
          <Badge tone="accent">accent</Badge>
          <Badge tone="success">success</Badge>
          <Badge tone="warning">warning</Badge>
          <Badge tone="danger">danger</Badge>
          <Badge tone="info">info</Badge>
          <Badge tone="solid">solid</Badge>
        </Row>

        <Row label="With dot" note="shape cue so colour is not load-bearing">
          <Badge tone="success" dot>
            confirmed
          </Badge>
          <Badge tone="warning" dot>
            stale
          </Badge>
          <Badge tone="danger" dot>
            disputed
          </Badge>
        </Row>

        <Row label="Verification" note="engine-produced classes only">
          <VerificationBadge value="INDEPENDENTLY_CORROBORATED" />
          <VerificationBadge value="SOURCE_CONFIRMED" />
          <VerificationBadge value="SELF_ASSERTED" />
          <VerificationBadge value="FOUNDER_PROVIDED" />
          <VerificationBadge value="DISPUTED" />
          <VerificationBadge value="STALE" />
          <VerificationBadge value="UNKNOWN" />
          <VerificationBadge value="not-a-real-class" />
        </Row>

        <Row label="Claim status">
          <ClaimBadge value="SUPPORTED" />
          <ClaimBadge value="CONTRADICTED" />
          <ClaimBadge value="OUTDATED" />
          <ClaimBadge value="UNVERIFIED" />
          <StaleBadge asOf="4d ago" />
        </Row>
      </Section>

      {/* ── Forms ─────────────────────────────────────────────────── */}
      <Section
        id="forms"
        title="Forms"
        description="Every control is a real form element, so keyboard, autofill and screen readers work without reimplementation."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <Field id="ds-input" label="Text input" hint="Helper text is wired with aria-describedby.">
              {(props) => <Input {...props} placeholder="Venture name" />}
            </Field>

            <Field id="ds-input-mono" label="Monospace input" hint="Hashes and addresses.">
              {(props) => <Input {...props} mono placeholder="So11111111111111111111111111111111111111112" />}
            </Field>

            <Field id="ds-input-error" label="Invalid state" error="This field is required.">
              {(props) => <Input {...props} defaultValue="" placeholder="Required" />}
            </Field>

            <Field id="ds-input-disabled" label="Disabled">
              {(props) => <Input {...props} disabled placeholder="Unavailable" />}
            </Field>

            <Field id="ds-select" label="Select">
              {(props) => (
                <Select
                  {...props}
                  options={[
                    { value: "recent", label: "Recently added" },
                    { value: "activity", label: "Last updated" },
                    { value: "name", label: "Name A–Z" },
                  ]}
                />
              )}
            </Field>

            <Field id="ds-textarea" label="Textarea with counter" hint="Bounded to 200 characters.">
              {(props) => <Textarea {...props} rows={3} maxLength={200} showCount defaultValue="Evidence-grounded question." />}
            </Field>
          </div>

          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2.5">
              <span className="fs-label">Checkbox</span>
              <Checkbox label="has repository" description="Only ventures with an associated repo" />
              <Checkbox label="checked" defaultChecked />
              <Checkbox label="indeterminate" indeterminate />
              <Checkbox label="disabled" disabled />
            </div>

            <div className="flex flex-col gap-2.5">
              <span className="fs-label">Switch</span>
              <Switch label="Alerts enabled" description="Email me on tracked changes" />
              <Switch label="Compact rows" size="sm" defaultChecked />
            </div>

            <RadioGroup
              legend="Attribution class"
              defaultValue="self"
              options={[
                { value: "self", label: "Self-asserted", description: "Issuer-provided, unverified" },
                { value: "confirmed", label: "Source confirmed", description: "One authoritative provider" },
                { value: "corroborated", label: "Independently corroborated", description: "Two or more independent sources" },
                { value: "disabled", label: "Disabled option", disabled: true },
              ]}
            />

            <div className="flex flex-col gap-2.5">
              <span className="fs-label">Segmented control</span>
              <SegmentedControl
                ariaLabel="View density"
                value={segmented}
                onValueChange={setSegmented}
                options={[
                  { value: "a", label: "Cards" },
                  { value: "b", label: "Table" },
                  { value: "c", label: "Graph" },
                ]}
              />
            </div>
          </div>
        </div>
      </Section>

      {/* ── Surfaces ──────────────────────────────────────────────── */}
      <Section
        id="surfaces"
        title="Surfaces"
        description="Five card variants. They differ only in elevation and emphasis, so they stay swappable inside a grid."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {(["default", "raised", "inset", "dashed", "accent"] as const).map((variant) => (
            <Card key={variant} variant={variant} className="p-4">
              <div className="fs-label">{variant}</div>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
                Surface recipe for {variant} content.
              </p>
            </Card>
          ))}
        </div>

        <Row label="Interactive card" note="whole-card hit target, Enter/Space activate">
          <Card className="w-64 p-4" onSelect={() => undefined}>
            <div className="fs-label">selectable</div>
            <p className="mt-1.5 text-xs text-ink-muted">Hover lifts the elevation.</p>
          </Card>
        </Row>

        <Row label="Structured card">
          <Card className="w-72">
            <CardHeader>
              <CardTitle className="text-base">Orbital Labs</CardTitle>
              <Badge tone="accent" size="sm">
                DEFI
              </Badge>
            </CardHeader>
            <CardContent>
              <CardDescription>Deterministic settlement for onchain credit markets.</CardDescription>
            </CardContent>
            <CardFooter>
              <span className="fs-data text-2xs text-ink-faint">142 evidence records</span>
              <Button size="sm" variant="outline">
                Open
              </Button>
            </CardFooter>
          </Card>
        </Row>
      </Section>

      {/* ── Tables ────────────────────────────────────────────────── */}
      <Section
        id="tables"
        title="Tables"
        description="Semantic table elements, so column relationships are announced and cell navigation works."
      >
        <Card className="overflow-hidden">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Venture</TableHeaderCell>
                <TableHeaderCell>Category</TableHeaderCell>
                <TableHeaderCell align="end">Evidence</TableHeaderCell>
                <TableHeaderCell align="end">Updated</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {[
                { name: "Orbital Labs", cat: "DEFI", ev: 142, up: "3h ago", selected: true },
                { name: "Kestrel", cat: "INFRA", ev: 88, up: "1d ago" },
                { name: "Meridian", cat: "PAYMENTS", ev: 34, up: "6d ago", disabled: true },
              ].map((row) => (
                <TableRow key={row.name} selected={row.selected} disabled={row.disabled}>
                  <TableCell className="font-medium text-ink">{row.name}</TableCell>
                  <TableCell mono>{row.cat}</TableCell>
                  <TableCell numeric>{row.ev}</TableCell>
                  <TableCell align="end" className="text-xs">
                    {row.up}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <div className="mt-4">
          <Pagination total={128} pageSize={24} pageIndex={1} hasPrev hasNext noun="ventures" onPrev={() => undefined} onNext={() => undefined} />
        </div>
      </Section>

      {/* ── Overlays ──────────────────────────────────────────────── */}
      <Section
        id="overlays"
        title="Overlays"
        description="Dialog and Drawer are built on Radix, because focus trapping, restoration and Escape handling are not worth reimplementing."
      >
        <Row label="Dialog">
          <Button onClick={() => setDialogOpen(true)}>Open dialog</Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent
              title="Attribute founder"
              description="Attribution is recorded with an evidence record and stays self-asserted until independent sources corroborate it."
            >
              <Field id="ds-dialog-name" label="Full name" required>
                {(props) => <Input {...props} placeholder="Name" />}
              </Field>
              <DialogFooter className="-mx-5 -mb-4 mt-4">
                <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => setDialogOpen(false)}>Record</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Row>

        <Row label="Drawer">
          <Button variant="outline" onClick={() => setDrawerOpen(true)}>
            Open drawer
          </Button>
          <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
            <DrawerContent side="right" title="Account" description="Theme and motion preferences">
              <div className="flex flex-col gap-5">
                <ThemeMenuItems as="radio" />
                <MotionToggle />
              </div>
            </DrawerContent>
          </Drawer>
        </Row>

        <Row label="Tooltip">
          <Tooltip content="Tooltips carry labels, not paragraphs">
            <Button variant="outline">Hover me</Button>
          </Tooltip>
        </Row>

        <Row label="Tabs">
          <div className="w-full">
            <TabbedPanels
              ariaLabel="Playground tabs"
              items={[
                { value: "one", label: "Overview" },
                { value: "two", label: "Evidence", count: 142 },
                { value: "three", label: "Disabled", disabled: true },
              ]}
              panels={{
                one: () => <p className="text-sm text-ink-secondary">Overview panel.</p>,
                two: () => <p className="text-sm text-ink-secondary">Evidence panel.</p>,
                three: () => null,
              }}
            />
          </div>
        </Row>
      </Section>

      {/* ── States ────────────────────────────────────────────────── */}
      <Section
        id="states"
        title="States"
        description="The complete state matrix. Every async surface renders exactly one of these, driven by a discriminated ViewState."
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <div>
              <span className="fs-label">loading — list</span>
              <LoadingState rows={3} kind="list" label="Loading evidence" className="mt-2" />
            </div>
            <div>
              <span className="fs-label">loading — card</span>
              <LoadingState rows={3} kind="card" label="Loading ventures" className="mt-2" />
            </div>
            <div>
              <span className="fs-label">loading — table</span>
              <LoadingState rows={3} kind="table" label="Loading records" className="mt-2" />
            </div>
            <div>
              <span className="fs-label">skeleton primitives</span>
              <div className="mt-2 flex flex-col gap-2">
                <Skeleton height="0.8rem" width="60%" />
                <SkeletonText lines={3} />
                <div className="flex items-center gap-2">
                  <Skeleton circular height="2rem" width="2rem" />
                  <BrandSpinner size={16} />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <span className="fs-label">empty</span>
              <EmptyState
                className="mt-2"
                compact
                glyph="venture"
                title="No ventures match"
                description="The registry contains real records only."
                action={<Button size="sm">Register venture</Button>}
              />
            </div>
            <div>
              <span className="fs-label">error</span>
              <ErrorState
                className="mt-2"
                title="Directory unavailable"
                message="The provider request failed."
                code="PROVIDER_TIMEOUT"
                onRetry={() => undefined}
              />
            </div>
            <div>
              <span className="fs-label">offline</span>
              <OfflineState className="mt-2" onRetry={() => undefined} onDismiss={() => undefined} />
            </div>
            <div>
              <span className="fs-label">permission denied</span>
              <ForbiddenState
                className="mt-2"
                message="Your workspace role does not include administration."
                requiredRole="PLATFORM_ADMIN"
              />
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3">
          <span className="fs-label">degraded / partial / stale</span>
          <DegradedState
            provider="GitHub collection"
            message="Rate limited; showing the last verified observation."
            onRetry={() => undefined}
          />
          <PartialBanner loaded={["financial statements", "team"]} failed={["bank statements", "equipment invoices"]} />
          <StaleBanner asOf="4 days ago" />
        </div>
      </Section>

      {/* ── Domain ────────────────────────────────────────────────── */}
      <Section
        id="domain"
        title="Domain components"
        description="Venture-intelligence surfaces. Each encodes a product rule, not just a layout — attribution is never inferred, and ungrounded sections say so."
      >
        <Row label="VentureCard">
          <div className="grid w-full gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <VentureCard venture={SAMPLE_VENTURE} onOpen={() => undefined} />
            <VentureCard
              venture={{ ...SAMPLE_VENTURE, name: "Kestrel", status: "PAUSED", tagline: null, evidenceCount: 8 }}
              onOpen={() => undefined}
              stale
            />
            <VentureCard
              venture={{ ...SAMPLE_VENTURE, name: "Meridian", category: "PAYMENTS", repoCount: 0, tokenCount: 0 }}
              onOpen={() => undefined}
            />
          </div>
        </Row>

        <Row label="FounderCard">
          <div className="grid w-full gap-3 sm:grid-cols-2">
            <FounderCard
              founder={{
                displayName: "Amara Mensah",
                bio: "Protocol engineer. Previously core contributor on two settlement systems.",
                role: "FOUNDER",
                attribution: "SOURCE_CONFIRMED",
                identityLinks: [
                  { identityType: "GITHUB", externalId: "amensah", confidence: "SOURCE_CONFIRMED", url: "https://github.com/amensah" },
                  { identityType: "X", externalId: "@amara_builds", confidence: "SELF_ASSERTED" },
                ],
                passportEvents: [
                  { summary: "Authored the settlement module", occurredAt: "3mo ago", sourceUrl: "https://github.com" },
                  { summary: "Shipped v1.0 release", occurredAt: "5mo ago" },
                  { summary: "First commit to core", occurredAt: "1y ago" },
                ],
              }}
            />
            <FounderCard
              founder={{
                displayName: "R. Okonkwo",
                role: "CORE_CONTRIBUTOR",
                attribution: "SELF_ASSERTED",
                identityLinks: [],
              }}
            />
          </div>
        </Row>

        <Row label="EvidenceCard" note="payload is shown verbatim so the record can be audited">
          <div className="flex w-full flex-col gap-2.5">
            <EvidenceCard
              evidence={{
                id: "ev_1",
                provider: "GITHUB",
                sourceType: "REPOSITORY_METADATA",
                verification: "SOURCE_CONFIRMED",
                collectedAt: "3h ago",
                contentHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                collectorVersion: "collector@1.4.2",
                snapshotSize: 8192,
                url: "https://github.com/orbital/core",
                payload: { stars: 412, forks: 38, pushed_at: "2026-11-15T09:12:00Z" },
              }}
            />
            <EvidenceCard
              evidence={{
                id: "ev_2",
                provider: "WEBSITE",
                sourceType: "PAGE_SNAPSHOT",
                verification: "DISPUTED",
                collectedAt: "1d ago",
                contradicted: true,
                payload: { claim: "$40M TVL", observed: "$4.1M" },
              }}
            />
          </div>
        </Row>

        <Row label="RepositoryPanel">
          <div className="w-full">
            <RepositoryPanel
              repository={{
                id: "r1",
                owner: "orbital",
                name: "core",
                url: "https://github.com/orbital/core",
                description: "Deterministic settlement engine for onchain credit.",
                latest: { stars: 412, forks: 38, openIssues: 12, primaryLanguage: "Rust", pushedAt: new Date(Date.now() - 7200_000).toISOString() },
                contributors: [
                  { login: "amensah", contributions: 284, repoRole: "REPO_OWNER", accountType: "HUMAN" },
                  { login: "okonkwo", contributions: 121, repoRole: "MAINTAINER", accountType: "HUMAN" },
                  { login: "dependabot", contributions: 44, accountType: "BOT" },
                  { login: "external-dev", contributions: 19, accountType: "HUMAN" },
                ],
                releases: [
                  { tagName: "v1.2.0", publishedAt: new Date(Date.now() - 86_400_000 * 5).toISOString(), url: "https://github.com" },
                  { tagName: "v1.1.0", publishedAt: new Date(Date.now() - 86_400_000 * 32).toISOString() },
                  { tagName: "v1.2.0-rc1", publishedAt: new Date(Date.now() - 86_400_000 * 7).toISOString(), prerelease: true },
                ],
                commits: [
                  { sha: "a1b2c3d4", message: "Fix rounding on partial fills", authorLogin: "amensah", committedAt: new Date(Date.now() - 3600_000).toISOString() },
                  { sha: "e5f6a7b8", message: "Add settlement invariant tests", authorLogin: "okonkwo", committedAt: new Date(Date.now() - 7200_000).toISOString() },
                ],
                observationCount: 24,
              }}
            />
          </div>
        </Row>

        <Row label="SignalTimeline">
          <div className="w-full max-w-xl">
            <SignalTimeline
              entries={[
                { id: "1", kind: "COLLECTED", summary: "Repository metadata re-collected", observedAt: "3h ago", provenance: "github" },
                { id: "2", kind: "UPDATED", summary: "Claim status changed to CONTRADICTED", observedAt: "1d ago", href: "#" },
                { id: "3", kind: "CREATED", summary: "Venture registered", observedAt: "40d ago" },
                { id: "4", kind: "STALE", summary: "Market snapshot passed its freshness policy", observedAt: "6d ago" },
              ]}
            />
          </div>
        </Row>

        <Row label="TokenCard">
          <div className="w-full max-w-lg">
            <TokenCard
              structure={{
                mint: "So11111111111111111111111111111111111111112",
                symbol: "ORB",
                name: "Orbital",
                decimals: 9,
                supply: "1000000000000000",
                program: "SPL_TOKEN",
                mintAuthority: null,
                association: "VERIFIED",
                slot: 298412773,
                providerLimitations: "Authority state read from the public RPC; not a legal opinion.",
              }}
              market={{
                priceUsd: 0.4821,
                liquidityUsd: 1_840_000,
                priceChange24h: -3.42,
                asOf: new Date(Date.now() - 900_000).toISOString(),
                provider: "JUPITER",
              }}
              priceHistory={SAMPLE_SERIES[0].points.map((p) => p.y)}
              onCopyMint={() => undefined}
              onCollect={() => undefined}
            />
          </div>
        </Row>

        <Row label="ResearchComposer">
          <div className="w-full max-w-2xl">
            <ResearchComposer
              value={question}
              onChange={setQuestion}
              onSubmit={() => undefined}
              scopeLabel="scoped to Orbital Labs"
            />
          </div>
        </Row>

        <Row label="RunStatusStrip">
          <div className="flex w-full flex-col gap-2">
            <RunStatusStrip run={{ status: "RUNNING", createdAt: "2m ago" }} />
            <RunStatusStrip run={{ status: "COMPLETED", createdAt: "1h ago", finishedAt: "58m ago", validationStatus: "PARTIAL" }} />
            <RunStatusStrip run={{ status: "FAILED", createdAt: "3h ago", failureReason: "Evidence retrieval returned no records for this venture." }} />
          </div>
        </Row>

        <Row label="ResearchReport" note="uncited statements are marked, never presented as grounded">
          <div className="w-full max-w-3xl">
            <ResearchReport
              report={{
                id: "rep_1",
                title: "What has Orbital Labs verifiably shipped?",
                validationStatus: "PARTIAL",
                validationIssues: ["Section 4 cited an evidence record that is no longer retrievable."],
                model: "grounded-analyst@1",
                generatedAt: "1h ago",
                usage: { inputTokens: 4210, outputTokens: 812 },
                citations: [
                  { id: "c1", evidenceId: "ev_1", label: "[1]", provider: "GITHUB", contentHash: "e3b0c442" },
                  { id: "c2", evidenceId: "ev_2", label: "[2]", provider: "WEBSITE" },
                ],
                sections: [
                  {
                    id: "s1",
                    title: "Verifiable releases",
                    paragraphs: ["Three tagged releases are recorded, the most recent five days ago."],
                    citationIds: ["c1", "c2"],
                  },
                  {
                    id: "s2",
                    title: "Development activity",
                    paragraphs: ["Two contributors account for 90% of commits in the last quarter."],
                    citationIds: ["c1"],
                  },
                  {
                    id: "s3",
                    title: "Claimed TVL",
                    paragraphs: ["The venture asserts $40M TVL while observation records $4.1M."],
                    citationIds: ["c2", "c-missing"],
                  },
                  {
                    id: "s4",
                    title: "Capital raised",
                    paragraphs: [],
                    citationIds: [],
                    insufficientEvidence: true,
                  },
                ],
              }}
            />
          </div>
        </Row>
      </Section>

      {/* ── Visualization ─────────────────────────────────────────── */}
      <Section
        id="viz"
        title="Visualization"
        description="Dependency-free SVG. Deterministic layout, so the same data always produces the same picture — two analysts can compare notes."
      >
        <Row label="EvidenceGraph" note="radial, keyboard reachable, collapses to a list under 560px">
          <div className="w-full">
            <EvidenceGraph nodes={SAMPLE_GRAPH_NODES} edges={SAMPLE_GRAPH_EDGES} onSelect={() => undefined} />
          </div>
        </Row>

        <Row label="FounderGraph" note="bipartite: people left, ventures right">
          <div className="w-full max-w-xl">
            <FounderGraph
              nodes={[
                { id: "p1", label: "Amara Mensah", type: "PERSON", sublabel: "founder" },
                { id: "p2", label: "R. Okonkwo", type: "PERSON", sublabel: "core contributor" },
                { id: "p3", label: "L. Haddad", type: "PERSON", sublabel: "advisor" },
                { id: "v1", label: "Orbital Labs", type: "VENTURE", sublabel: "defi" },
                { id: "v2", label: "Kestrel", type: "VENTURE", sublabel: "infra" },
              ]}
              edges={[
                { from: "p1", to: "v1", confidence: "SOURCE_CONFIRMED", role: "FOUNDER" },
                { from: "p1", to: "v2", confidence: "SELF_ASSERTED", role: "ADVISOR" },
                { from: "p2", to: "v1", confidence: "SELF_ASSERTED", role: "CORE_CONTRIBUTOR" },
                { from: "p3", to: "v2", confidence: "SELF_ASSERTED", role: "ADVISOR" },
              ]}
            />
          </div>
        </Row>

        <Row label="LineChart">
          <div className="w-full">
            <LineChart series={SAMPLE_SERIES} ariaLabel="Price history" formatY={(v) => `$${v.toFixed(2)}`} />
          </div>
        </Row>

        <Row label="Sparkline">
          <Sparkline points={SAMPLE_SERIES[0].points.map((p) => p.y)} ariaLabel="Price trend" />
          <Sparkline points={[1]} ariaLabel="Single point" />
          <Sparkline points={[]} ariaLabel="No data" />
        </Row>
      </Section>

      {/* ── Motion ────────────────────────────────────────────────── */}
      <Section
        id="motion"
        title="Motion"
        description="Durations and easings are tokens. Every animation has an instant equivalent; nothing in the product depends on motion."
      >
        <Row label="Durations">
          {Object.entries(motionTokens.duration).map(([name, ms]) => (
            <span key={name} className="fs-chip fs-chip-neutral">
              <span className="text-2xs">{name}</span>
              <span className="fs-data text-ink-faint">{ms}ms</span>
            </span>
          ))}
        </Row>

        <Row label="Easings">
          {Object.keys(motionTokens.ease).map((name) => (
            <span key={name} className="fs-chip fs-chip-neutral">
              {name}
            </span>
          ))}
        </Row>

        <Row label="Motion gate" note="respects the OS preference and the in-app opt-out">
          <MotionToggle />
          <Badge tone={motionOK ? "success" : "warning"} dot>
            motion {motionOK ? "on" : "reduced"}
          </Badge>
        </Row>

        <Row label="Entrance variants">
          <div className="fs-stagger flex flex-wrap gap-2">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="fs-panel px-3 py-2 text-xs text-ink-muted">
                item {n}
              </div>
            ))}
          </div>
        </Row>

        <Row label="Shimmer">
          <Skeleton height="1rem" width="12rem" className="fs-scan-line" />
          <SkeletonText lines={2} className="w-48" />
        </Row>
      </Section>

      {/* ── Theme ─────────────────────────────────────────────────── */}
      <Section
        id="theme"
        title="Theme"
        description="Two independent themes plus a system mode and a motion opt-out. Contrast pairs are verified by scripts/verify-token-contrast.mjs."
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="p-5">
            <h3 className="fs-label">Appearance</h3>
            <div className="mt-3">
              <ThemeMenuItems as="radio" />
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="fs-label">Motion</h3>
            <div className="mt-3">
              <MotionToggle />
            </div>
          </Card>
        </div>

        <Row label="Theme-invariant marks" note="brand plates stay legible on either ground">
          <div className="rounded-md bg-[var(--fs-surface-3)] p-3">
            <LogoLockup size={24} />
          </div>
          <div className="rounded-md bg-[var(--fs-accent-subtle)] p-3">
            <LogoStacked size={36} wordmarkSize={14} />
          </div>
        </Row>
      </Section>
    </div>
  );
}

export { type ViewState };

export default DesignSystemPlayground;