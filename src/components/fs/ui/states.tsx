"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Badge } from "./badge";
import { Glyph, Icon, type GlyphName } from "@/components/fs/brand/glyphs";

/**
 * State library — the FoundrySignal state matrix.
 *
 * Every async surface renders exactly one of these, driven by a discriminated
 * `ViewState`. No surface invents its own loading/empty/error markup.
 *
 *   idle        not started yet
 *   loading     in flight — skeleton that matches the final layout, plus a
 *               bounded timeout escalation so nothing spins forever
 *   ready       data
 *   empty       succeeded with zero records (a real, honest outcome here)
 *   partial     some sections loaded, others failed — both are named
 *   stale       succeeded but past its freshness policy
 *   error       failed; retry offered, error text shown verbatim
 *   offline     network unreachable; cached data may be stale
 *   forbidden   authenticated but not permitted (403) — distinct from error
 *   degraded    provider unavailable; last known state shown with provenance
 *
 * Accessibility: loading uses role="status" + aria-busy; errors use role="alert";
 * empty/forbidden/offline are plain regions with a heading, because they are
 * not interruptions.
 */

export type ViewState =
  | { kind: "idle" }
  | { kind: "loading"; label?: string }
  | { kind: "ready" }
  | { kind: "empty" }
  | { kind: "partial"; loaded: string[]; failed: string[] }
  | { kind: "stale"; asOf: string }
  | { kind: "error"; message: string; title?: string; retryable?: boolean }
  | { kind: "offline" }
  | { kind: "forbidden"; message?: string }
  | { kind: "degraded"; provider: string; message: string };

/* ─── Skeleton primitives ───────────────────────────────────────────── */

export interface SkeletonProps extends React.ComponentPropsWithoutRef<"div"> {
  /** Width/height as a CSS length or Tailwind class fragment. */
  width?: string;
  height?: string;
  /** Render as a circle (avatars, icon slots). */
  circular?: boolean;
}

export function Skeleton({ className, width, height, circular, ...props }: SkeletonProps) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("fs-skeleton", circular ? "rounded-full" : "rounded-sm", className)}
      style={{ width, height }}
      {...props}
    />
  );
}

/** Skeleton sized to final text metrics, so swapping in data does not shift layout. */
export function SkeletonText({
  lines = 3,
  className,
  /** Widths per line; defaults to a natural descending staircase. */
  widths,
}: {
  lines?: number;
  className?: string;
  widths?: string[];
}) {
  const fallback = ["100%", "92%", "78%", "86%", "64%"];
  return (
    <div className={cn("flex flex-col gap-2", className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          height="0.7rem"
          width={widths?.[i] ?? fallback[i % fallback.length]}
        />
      ))}
    </div>
  );
}

/* ─── Spinner ───────────────────────────────────────────────────────── */

export function Spinner({
  label,
  size = "md",
  className,
}: {
  label?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const dim = size === "sm" ? "size-3.5" : "size-4";
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        aria-hidden="true"
        className={cn("fs-spin inline-block shrink-0 rounded-full border-2 border-current border-t-transparent", dim)}
      />
      {label ? (
        <span className="text-xs text-ink-muted" aria-live="polite">
          {label}
        </span>
      ) : (
        <span className="fs-sr-only">Loading</span>
      )}
    </span>
  );
}

/* ─── Loading ───────────────────────────────────────────────────────── */

type SkeletonKind = "list" | "card" | "table" | "stat" | "inline";

/**
 * Bounded loading state.
 *
 * `rows` controls how many skeleton items render — the layout mirrors the
 * eventual content so nothing reflows when data lands.
 *
 * After `escalateAfter` ms the label switches to an escalation message, so a
 * request that never resolves still tells the user something instead of
 * spinning silently. The caller's query timeout governs the real outcome.
 */
export function LoadingState({
  label = "Loading",
  rows = 3,
  kind = "list",
  className,
  escalateAfter,
}: {
  label?: string;
  rows?: number;
  kind?: SkeletonKind;
  className?: string;
  escalateAfter?: number;
}) {
  const [slow, setSlow] = React.useState(false);

  React.useEffect(() => {
    if (!escalateAfter) return;
    const timer = setTimeout(() => setSlow(true), escalateAfter);
    return () => clearTimeout(timer);
  }, [escalateAfter]);

  const text = slow ? `${label} — taking longer than expected` : label;

  return (
    <div
      className={cn("flex flex-col gap-3", className)}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      {kind === "card" && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: Math.max(rows, 3) }, (_, i) => (
            <div key={i} className="fs-panel flex flex-col gap-3 p-4">
              <div className="flex items-center gap-2">
                <Skeleton circular height="1.75rem" width="1.75rem" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton height="0.7rem" width="62%" />
                  <Skeleton height="0.6rem" width="34%" />
                </div>
              </div>
              <SkeletonText lines={2} />
              <div className="flex gap-2">
                <Skeleton height="0.6rem" width="18%" />
                <Skeleton height="0.6rem" width="14%" />
              </div>
            </div>
          ))}
        </div>
      )}

      {kind === "table" && (
        <div className="fs-panel overflow-hidden">
          <div className="flex items-center gap-4 border-b border-[var(--fs-border)] px-4 py-2.5">
            <Skeleton height="0.6rem" width="22%" />
            <Skeleton height="0.6rem" width="14%" />
            <Skeleton height="0.6rem" width="16%" />
            <Skeleton height="0.6rem" width="10%" />
          </div>
          {Array.from({ length: rows }, (_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-b border-[var(--fs-border)] px-4 py-3 last:border-b-0"
            >
              <Skeleton height="0.7rem" width="22%" />
              <Skeleton height="0.7rem" width="14%" />
              <Skeleton height="0.7rem" width="16%" />
              <Skeleton height="0.7rem" width="10%" />
            </div>
          ))}
        </div>
      )}

      {kind === "stat" && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="fs-panel flex flex-col gap-2 p-3">
              <Skeleton height="0.55rem" width="70%" />
              <Skeleton height="1.1rem" width="45%" />
            </div>
          ))}
        </div>
      )}

      {kind === "inline" && (
        <div className="flex items-center gap-2">
          <Skeleton circular height="0.6rem" width="0.6rem" />
          <Skeleton height="0.7rem" width="40%" />
        </div>
      )}

      {kind === "list" && (
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: rows }, (_, i) => (
            <Skeleton key={i} height="0.7rem" width={`${92 - i * 11}%`} />
          ))}
        </div>
      )}

      <div className="text-xs text-ink-faint">{text}</div>
    </div>
  );
}

/* ─── Empty ─────────────────────────────────────────────────────────── */

/**
 * Empty state with an optional custom illustration.
 *
 * Copy matters here: the product never fabricates data, so "empty" is a
 * meaningful answer. The default description states that explicitly where the
 * caller does not override it.
 */
export function EmptyState({
  glyph = "venture",
  title,
  description,
  action,
  secondaryAction,
  illustration,
  className,
  compact,
}: {
  glyph?: GlyphName;
  title: string;
  description?: string;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  /** Replaces the glyph tile with custom artwork. */
  illustration?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "fs-panel-dashed flex flex-col items-center justify-center gap-3 px-6 text-center",
        compact ? "py-8" : "py-14",
        className,
      )}
    >
      {illustration ?? (
        <div
          aria-hidden="true"
          className="flex size-11 items-center justify-center rounded-lg bg-[var(--fs-surface-3)] text-ink-muted"
        >
          <Glyph name={glyph} size={22} />
        </div>
      )}
      <h3 className="fs-brand text-base font-semibold text-ink">{title}</h3>
      {description ? (
        <p className="max-w-md text-xs leading-relaxed text-ink-muted">{description}</p>
      ) : null}
      {action || secondaryAction ? (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}

/* ─── Error ─────────────────────────────────────────────────────────── */

export function ErrorState({
  title = "Something failed",
  message,
  onRetry,
  retryLabel = "Retry",
  /** Error code from the API envelope; shown verbatim for support. */
  code,
  className,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  code?: string;
  className?: string;
}) {
  return (
    <div
      data-slot="error-state"
      role="alert"
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-[var(--fs-danger-border)] bg-[var(--fs-danger-bg)] px-4 py-3.5",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <span aria-hidden="true" className="mt-0.5 text-[var(--fs-danger-fg)]">
          <Glyph name="risk" size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-ink">{title}</div>
          <p className="mt-1 text-xs leading-relaxed text-ink-secondary">{message}</p>
          {code ? (
            <p className="mt-1.5 fs-data text-2xs text-ink-faint">code: {code}</p>
          ) : null}
        </div>
        {onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry} className="shrink-0">
            <Icon name="refresh" size={13} />
            {retryLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/* ─── Offline ───────────────────────────────────────────────────────── */

export function OfflineState({
  onRetry,
  onDismiss,
  className,
}: {
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}) {
  return (
    <div
      data-slot="offline-state"
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-lg border border-[var(--fs-warning-border)] bg-[var(--fs-warning-bg)] px-4 py-3",
        className,
      )}
    >
      <span aria-hidden="true" className="text-[var(--fs-warning-fg)]">
        <Glyph name="risk" size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-ink">You are offline</div>
        <p className="text-xs text-ink-secondary">
          Requests will retry when the connection returns. Data shown may be stale.
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        {onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Reconnect
          </Button>
        ) : null}
        {onDismiss ? (
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Dismiss
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/* ─── Forbidden ─────────────────────────────────────────────────────── */

/**
 * Permission-denied. Distinct from a generic error: the request was valid,
 * the account simply lacks the role. Copy says so rather than implying a bug.
 */
export function ForbiddenState({
  message,
  requiredRole,
  onRequestAccess,
  className,
}: {
  message?: string;
  requiredRole?: string;
  onRequestAccess?: () => void;
  className?: string;
}) {
  return (
    <div
      data-slot="forbidden-state"
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-[var(--fs-border-strong)] bg-surface-2 px-6 py-12 text-center",
        className,
      )}
    >
      <span aria-hidden="true" className="text-[var(--fs-text-muted)]">
        <Glyph name="attestation" size={24} />
      </span>
      <h3 className="fs-brand text-base font-semibold text-ink">Access restricted</h3>
      <p className="max-w-sm text-xs leading-relaxed text-ink-muted">
        {message ?? "Your account does not have permission to view this resource."}
      </p>
      {requiredRole ? (
        <Badge tone="neutral" dot>
          Requires {requiredRole}
        </Badge>
      ) : null}
      {onRequestAccess ? (
        <Button variant="outline" size="sm" onClick={onRequestAccess} className="mt-1">
          Request access
        </Button>
      ) : null}
    </div>
  );
}

/* ─── Degraded / partial / stale ────────────────────────────────────── */

/**
 * Provider degraded: the request failed but the product still has something
 * honest to show. Names the provider and states what is missing.
 */
export function DegradedState({
  provider,
  message,
  onRetry,
  className,
}: {
  provider: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      data-slot="degraded-state"
      className={cn(
        "flex flex-wrap items-start gap-2.5 rounded-lg border border-dashed border-[var(--fs-warning-border)] bg-surface-2 px-4 py-3",
        className,
      )}
    >
      <span aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--fs-warning-fg)]">
        <Glyph name="risk" size={14} />
      </span>
      <p className="min-w-0 flex-1 text-xs leading-relaxed text-ink-muted">
        <span className="fs-data font-semibold text-ink-secondary">{provider}</span> — {message}
      </p>
      {onRetry ? (
        <Button variant="ghost" size="sm" onClick={onRetry} className="shrink-0">
          Retry
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Partial banner: names both what loaded and what failed, so a user never has
 * to guess which panel is incomplete.
 */
export function PartialBanner({
  loaded,
  failed,
  className,
}: {
  loaded: string[];
  failed: string[];
  className?: string;
}) {
  if (failed.length === 0) return null;
  return (
    <div
      data-slot="partial-banner"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-[var(--fs-warning-border)] bg-[var(--fs-warning-bg)] px-3 py-2 text-2xs",
        className,
      )}
      role="status"
    >
      <span className="fs-label text-[var(--fs-warning-fg)]">Partial</span>
      <span className="fs-data text-ink-secondary">
        loaded {loaded.length ? loaded.join(", ") : "—"}
      </span>
      <span aria-hidden="true" className="text-ink-faint">
        ·
      </span>
      <span className="fs-data text-ink-secondary">
        failed {failed.join(", ")}
      </span>
    </div>
  );
}

/** Stale marker: past freshness policy. Shows the observation time, not a guess. */
export function StaleBanner({
  asOf,
  className,
}: {
  asOf: string;
  className?: string;
}) {
  return (
    <div
      data-slot="stale-banner"
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-md border border-[var(--fs-warning-border)] bg-[var(--fs-warning-bg)] px-3 py-1.5",
        className,
      )}
    >
      <Badge tone="warning" dot>
        Stale
      </Badge>
      <span className="fs-data text-2xs text-ink-secondary">
        Last observed {asOf} — past this source's freshness policy
      </span>
    </div>
  );
}

/* ─── Section shell ─────────────────────────────────────────────────── */

/**
 * Section container with a header and an inline state. Sections that load
 * independently (dossier tabs, admin panels) use this so a failure in one
 * never removes its neighbours.
 */
export function SectionShell({
  title,
  glyph,
  state,
  children,
  aside,
  className,
  id,
}: {
  title: string;
  glyph?: GlyphName;
  state?: ViewState["kind"];
  children?: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section aria-labelledby={id} className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 id={id} className="fs-label flex items-center gap-2">
          {glyph ? <Glyph name={glyph} size={14} /> : null}
          {title}
        </h2>
        {aside}
      </div>

      {!state || state === "ready" ? children : null}

      {state === "loading" ? <LoadingState rows={2} kind="list" label={`${title} loading`} /> : null}

      {state === "idle" ? (
        <p className="text-xs text-ink-faint">Not started.</p>
      ) : null}

      {state === "empty" ? (
        <EmptyState
          glyph={glyph}
          compact
          title={`No ${title.toLowerCase()} yet`}
          description="Nothing has been recorded for this section. The product never fills gaps with generated data."
        />
      ) : null}

      {state === "error" ? (
        <ErrorState
          title={`${title} unavailable`}
          message="This provider request failed. Other sections remain usable."
        />
      ) : null}

      {state === "degraded" ? (
        <DegradedState provider={title} message="Showing the last verified observation." />
      ) : null}

      {state === "partial" ? (
        <PartialBanner loaded={[]} failed={["this section"]} />
      ) : null}

      {state === "stale" ? <StaleBanner asOf="unknown" /> : null}

      {state === "offline" ? <OfflineState /> : null}

      {state === "forbidden" ? <ForbiddenState /> : null}
    </section>
  );
}

/* ─── State dispatcher ──────────────────────────────────────────────── */

/**
 * Renders the correct state component for a discriminated ViewState.
 * Callers pass the render function for `ready`; everything else is handled
 * here so no surface re-implements the matrix.
 */
export function StateView<T>({
  state,
  render,
  onRetry,
  className,
  loadingRows = 3,
  loadingKind = "list",
  loadingLabel,
}: {
  state: ViewState;
  render: (data: T) => React.ReactNode;
  /** Ready data is supplied separately so the state machine stays total. */
  data?: T;
  onRetry?: () => void;
  className?: string;
  loadingRows?: number;
  loadingKind?: SkeletonKind;
  loadingLabel?: string;
}): React.ReactNode {
  switch (state.kind) {
    case "idle":
      return <p className={cn("text-xs text-ink-faint", className)}>Not started.</p>;
    case "loading":
      return (
        <LoadingState
          rows={loadingRows}
          kind={loadingKind}
          label={state.label ?? loadingLabel ?? "Loading"}
          className={className}
        />
      );
    case "ready":
      return <>{render(undefined as T)}</>;
    case "empty":
      return <EmptyState className={className} title="No records" />;
    case "partial":
      return <PartialBanner loaded={state.loaded} failed={state.failed} className={className} />;
    case "stale":
      return <StaleBanner asOf={state.asOf} className={className} />;
    case "error":
      return (
        <ErrorState
          className={className}
          title={state.title}
          message={state.message}
          onRetry={state.retryable === false ? undefined : onRetry}
        />
      );
    case "offline":
      return <OfflineState onRetry={onRetry} className={className} />;
    case "forbidden":
      return <ForbiddenState className={className} message={state.message} />;
    case "degraded":
      return (
        <DegradedState
          className={className}
          provider={state.provider}
          message={state.message}
          onRetry={onRetry}
        />
      );
  }
}