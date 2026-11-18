"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { formatCompact } from "@/lib/fs/utils";
import { Badge, VerificationBadge, type BadgeTone } from "@/components/fs/ui/badge";
import { Skeleton } from "@/components/fs/ui/states";
import { Glyph, Icon, type GlyphName } from "@/components/fs/brand/glyphs";

/**
 * VentureCard — the primary directory tile.
 *
 * Shows the identity of a venture plus the four counts that indicate how much
 * verified substance exists behind it. The card is a single click target
 * (whole-card), and the evidence counts are real records — never inferred.
 *
 * State contract:
 *   default    resting
 *   hover      border strengthen + elevation bump
 *   focus      accent ring, full-card
 *   active     0.975 press
 *   loading    skeleton with identical metrics
 *   disabled   e.g. venture not yet activated; click blocked, reason shown
 *   stale      `stale` prop renders the age of the last observation
 *   partial    some counts missing → those tiles show "—" rather than 0
 */

export interface VentureCardData {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  category: string;
  ecosystem: string;
  /** ACTIVE | ... — anything not ACTIVE renders as a warning chip. */
  status: string;
  website: string | null;
  repoCount: number;
  tokenCount: number;
  evidenceCount: number;
  claimCount: number;
  createdAt: string;
  updatedAt: string;
  /** ISO timestamp of the last successful collection, when known. */
  lastCollectedAt?: string | null;
}

export interface VentureCardProps {
  venture: VentureCardData;
  onOpen: (slug: string) => void;
  className?: string;
  /** Show the venture's registration age. */
  showAge?: boolean;
  /** Last observed time; presence implies the record may be stale. */
  stale?: boolean;
}

function Metric({
  glyph,
  value,
  label,
}: {
  glyph: GlyphName;
  value: number | undefined;
  label: string;
}) {
  return (
    <span
      className="flex items-center gap-1.5 text-2xs text-ink-faint"
      title={`${value === undefined ? "Unknown" : value} ${label}`}
    >
      <span aria-hidden="true" className="text-ink-faint">
        <Glyph name={glyph} size={12} />
      </span>
      <span className="fs-data tabular-nums">{value === undefined ? "—" : formatCompact(value)}</span>
      <span className="fs-sr-only">{label}</span>
    </span>
  );
}

export function VentureCard({
  venture,
  onOpen,
  className,
  showAge,
  stale,
}: VentureCardProps) {
  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`Open dossier for ${venture.name}`}
      onClick={() => onOpen(venture.slug)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(venture.slug);
        }
      }}
      className={cn(
        "fs-panel fs-press group relative flex flex-col gap-3 p-4 text-left",
        "transition-[border-color,box-shadow,transform] duration-fast ease-out",
        "hover:border-[var(--fs-border-strong)] hover:shadow-e2",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus-ring)]",
        className,
      )}
      data-slot="venture-card"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--fs-surface-3)] text-[var(--fs-accent-fg)]"
        >
          <Glyph name="venture" size={18} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="fs-brand min-w-0 truncate text-sm font-semibold text-ink">
              {venture.name}
            </h3>
            <Badge tone="neutral" size="sm">
              {venture.category}
            </Badge>
            {venture.status !== "ACTIVE" ? (
              <Badge tone="warning" size="sm" dot>
                {venture.status}
              </Badge>
            ) : null}
          </div>
          <p className="fs-clamp-2 mt-1 text-xs leading-relaxed text-ink-muted">
            {venture.tagline ?? "No tagline recorded at intake."}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Metric glyph="repository" value={venture.repoCount} label="repositories" />
        <Metric glyph="token" value={venture.tokenCount} label="tokens" />
        <Metric glyph="evidence" value={venture.evidenceCount} label="evidence records" />
        <Metric glyph="claim" value={venture.claimCount} label="claims" />
        {stale && venture.lastCollectedAt ? (
          <Badge tone="warning" size="sm">
            Stale
          </Badge>
        ) : null}
        <span
          aria-hidden="true"
          className="ml-auto text-ink-faint transition-transform duration-fast ease-out group-hover:translate-x-0.5 group-hover:text-[var(--fs-accent-fg)]"
        >
          <Icon name="chevronRight" size={13} />
        </span>
      </div>

      {showAge ? (
        <p className="fs-data text-2xs text-ink-faint">
          Registered {new Date(venture.createdAt).toLocaleDateString()}
        </p>
      ) : null}
    </article>
  );
}

/** Loading skeleton matching the card's exact metrics. */
export function VentureCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("fs-panel flex flex-col gap-3 p-4", className)}
      aria-hidden="true"
      data-slot="venture-card-skeleton"
    >
      <div className="flex items-start gap-3">
        <Skeleton circular height="2.25rem" width="2.25rem" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton height="0.8rem" width="58%" />
          <Skeleton height="0.6rem" width="86%" />
          <Skeleton height="0.6rem" width="44%" />
        </div>
      </div>
      <div className="flex gap-3">
        <Skeleton height="0.6rem" width="12%" />
        <Skeleton height="0.6rem" width="10%" />
        <Skeleton height="0.6rem" width="14%" />
      </div>
    </div>
  );
}

/* ─── FounderCard ───────────────────────────────────────────────────── */

/**
 * FounderCard — attributed founder record.
 *
 * FoundrySignal never infers founders from commit or wallet activity. The
 * attribution badge shows the provenance class, and identity links display
 * their own confidence independently of the founder claim.
 */
export interface FounderIdentityLink {
  identityType: string;
  externalId: string;
  confidence: string;
  url?: string | null;
}

export interface FounderPassportEvent {
  summary: string;
  occurredAt?: string | null;
  sourceUrl?: string | null;
}

export interface FounderCardData {
  displayName: string;
  bio?: string | null;
  /** FOUNDER | CO_FOUNDER | CORE_CONTRIBUTOR | ADVISOR */
  role: string;
  /** Attribution class — SELF_ASSERTED until evidence supports it. */
  attribution: string;
  identityLinks: FounderIdentityLink[];
  passportEvents?: FounderPassportEvent[];
}

export function FounderCard({
  founder,
  onOpenIdentity,
  className,
  maxEvents = 4,
}: {
  founder: FounderCardData;
  /** Called with a resolved URL when an identity link is clicked. */
  onOpenIdentity?: (url: string) => void;
  className?: string;
  maxEvents?: number;
}) {
  return (
    <div className={cn("fs-panel flex flex-col gap-3 p-4", className)} data-slot="founder-card">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="fs-data flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--fs-surface-3)] text-sm font-semibold text-[var(--fs-accent-2-fg,var(--fs-accent-2))]"
        >
          {founder.displayName.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="fs-brand text-sm font-semibold text-ink">{founder.displayName}</h3>
            <Badge tone="neutral" size="sm">
              {founder.role.replace(/_/g, " ").toLowerCase()}
            </Badge>
            <VerificationBadge value={founder.attribution} />
          </div>
          {founder.bio ? (
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">{founder.bio}</p>
          ) : null}
        </div>
      </div>

      {founder.identityLinks.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {founder.identityLinks.map((link) => {
            const content = (
              <>
                <span className="fs-data text-2xs">{link.identityType.replace(/_/g, " ")}</span>
                <span className="max-w-40 truncate text-2xs">{link.externalId}</span>
                <VerificationBadge value={link.confidence} dot={false} />
              </>
            );
            return link.url ? (
              <a
                key={`${link.identityType}:${link.externalId}`}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                onClick={(event) => {
                  if (!onOpenIdentity) return;
                  event.preventDefault();
                  onOpenIdentity(link.url!);
                }}
                className="fs-chip fs-chip-neutral gap-1.5 transition-colors duration-fast ease-out hover:border-[var(--fs-border-strong)]"
              >
                {content}
              </a>
            ) : (
              <span key={`${link.identityType}:${link.externalId}`} className="fs-chip fs-chip-neutral gap-1.5">
                {content}
              </span>
            );
          })}
        </div>
      ) : null}

      {founder.passportEvents && founder.passportEvents.length > 0 ? (
        <div>
          <div className="fs-label">Proof-of-build timeline</div>
          <ol className="mt-2 flex flex-col gap-1.5 border-l border-[var(--fs-border)] pl-3">
            {founder.passportEvents.slice(0, maxEvents).map((event, i) => (
              <li key={i} className="relative text-xs leading-snug text-ink-secondary">
                <span
                  aria-hidden="true"
                  className="absolute -left-[17px] top-1.5 size-1.5 rounded-full bg-[var(--fs-accent-2)]"
                />
                {event.summary}
                {event.occurredAt ? (
                  <span className="fs-data ml-2 text-2xs text-ink-faint">{event.occurredAt}</span>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

/* ─── EvidenceCard ──────────────────────────────────────────────────── */

/**
 * EvidenceCard — one immutable observation.
 *
 * Every field is provenance: provider, source type, collection time, content
 * hash, collector version, snapshot size. The payload is expandable and shown
 * verbatim, so a reader can audit the record rather than trust the badge.
 */
export interface EvidenceCardData {
  id: string;
  title?: string | null;
  provider: string;
  sourceType: string;
  verification: string;
  collectedAt: string;
  contentHash?: string | null;
  collectorVersion?: string | null;
  snapshotSize?: number | null;
  url?: string | null;
  payload: unknown;
  /** e.g. a contradicting record exists. */
  contradicted?: boolean;
}

export function EvidenceCard({
  evidence,
  defaultOpen,
  className,
}: {
  evidence: EvidenceCardData;
  /** Start expanded (e.g. when navigating from a graph node). */
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(Boolean(defaultOpen));
  const panelId = React.useId();

  return (
    <div
      className={cn(
        "fs-panel flex flex-col gap-2 p-3.5",
        evidence.contradicted && "border-[var(--fs-danger-border)]",
        className,
      )}
      data-slot="evidence-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="fs-press min-w-0 flex-1 text-left"
        >
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium text-ink">
              {evidence.title ?? `${evidence.provider} ${evidence.sourceType.toLowerCase()}`}
            </span>
            <VerificationBadge value={evidence.verification} />
            <Badge tone="neutral" size="sm">
              {evidence.provider}
            </Badge>
          </span>
          <span className="fs-data mt-1 flex flex-wrap gap-x-3 gap-y-1 text-2xs text-ink-faint">
            <span>{evidence.sourceType}</span>
            <span>collected {evidence.collectedAt}</span>
            {evidence.contentHash ? (
              <span className="truncate">sha256 {evidence.contentHash.slice(0, 12)}…</span>
            ) : null}
            {evidence.collectorVersion ? <span>{evidence.collectorVersion}</span> : null}
            {typeof evidence.snapshotSize === "number" ? (
              <span>{(evidence.snapshotSize / 1024).toFixed(1)} KB</span>
            ) : null}
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-2">
          {evidence.url ? (
            <a
              href={evidence.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="fs-press text-2xs text-[var(--fs-accent-fg)] hover:underline"
            >
              source
            </a>
          ) : null}
          <span
            aria-hidden="true"
            className={cn(
              "text-ink-faint transition-transform duration-fast ease-out",
              open && "rotate-180",
            )}
          >
            <Icon name="chevronDown" size={14} />
          </span>
        </div>
      </div>

      {open ? (
        <pre
          id={panelId}
          className="fs-scroll fs-data max-h-72 overflow-auto rounded-md bg-[var(--fs-bg-deep)] p-3 text-2xs leading-relaxed text-ink-secondary"
        >
          {JSON.stringify(evidence.payload, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

/* ─── SignalTimeline ────────────────────────────────────────────────── */

/**
 * SignalTimeline — chronological change feed.
 *
 * Each entry carries a kind (which drives the node colour) and an observed
 * timestamp. Entries are ordered newest-first by the caller; the component
 * never re-sorts, because the API's order is the audited one.
 */
export interface TimelineEntry {
  id: string;
  kind: string;
  summary: string;
  observedAt: string;
  /** Optional deep link to the record that produced this change. */
  href?: string;
  /** Free-form provenance note, e.g. the provider. */
  provenance?: string;
}

const KIND_TONE: Record<string, BadgeTone> = {
  CREATED: "accent",
  UPDATED: "info",
  COLLECTED: "success",
  STALE: "warning",
  DISPUTED: "danger",
  ARCHIVED: "neutral",
};

function kindTone(kind: string): BadgeTone {
  return KIND_TONE[kind.toUpperCase()] ?? "neutral";
}

export function SignalTimeline({
  entries,
  className,
  emptyLabel = "No recorded changes yet.",
  maxEntries,
}: {
  entries: ReadonlyArray<TimelineEntry>;
  className?: string;
  emptyLabel?: string;
  maxEntries?: number;
}) {
  if (entries.length === 0) {
    return (
      <p className={cn("text-xs text-ink-faint", className)} data-slot="timeline-empty">
        {emptyLabel}
      </p>
    );
  }

  const visible = maxEntries ? entries.slice(0, maxEntries) : entries;

  return (
    <ol
      className={cn("flex flex-col gap-0", className)}
      data-slot="signal-timeline"
    >
      {visible.map((entry, i) => (
        <li key={entry.id} className="relative flex gap-3 pb-4 last:pb-0">
          {/* Rail */}
          <span aria-hidden="true" className="relative flex w-4 shrink-0 justify-center">
            <span
              className={cn(
                "mt-1.5 size-2 rounded-full ring-2 ring-[var(--fs-bg)]",
                i === 0 ? "bg-[var(--fs-accent)]" : "bg-[var(--fs-border-emphasis)]",
              )}
            />
            {i < visible.length - 1 ? (
              <span className="absolute top-4 h-[calc(100%-0.5rem)] w-px bg-[var(--fs-border)]" />
            ) : null}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={kindTone(entry.kind)} size="sm">
                {entry.kind.replace(/_/g, " ")}
              </Badge>
              <span className="fs-data text-2xs text-ink-faint">{entry.observedAt}</span>
            </div>
            <p className="mt-1 text-xs leading-snug text-ink-secondary">{entry.summary}</p>
            {entry.provenance ? (
              <p className="fs-data mt-0.5 text-2xs text-ink-faint">{entry.provenance}</p>
            ) : null}
            {entry.href ? (
              <a
                href={entry.href}
                className="fs-press mt-1 inline-block text-2xs text-[var(--fs-accent-fg)] hover:underline"
              >
                view record
              </a>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}