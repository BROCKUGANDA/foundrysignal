// FoundrySignal brand components — original vector artwork.
//
// Every mark here is an editable SVG built from the same geometry as the
// masters in public/brand/. Variants:
//
//   LogoEmblem    standalone emblem (32 grid)
//   LogoWordmark  "FoundrySignal" wordmark
//   LogoHorizontal emblem + wordmark, single row
//   LogoStacked   emblem above wordmark
//   LogoCompact   emblem only (favicon / app scale)
//   BrandMark     theme-aware plate: accent field + inverted emblem
//
// All accept `mono` for a single-ink rendering (print, brand-colour grounds,
// etched/embroidered production). Colour comes from tokens, never literals,
// except where the mark must be theme-invariant (brand plates).

import React from "react";

export interface LogoProps {
  /** Rendered square edge in px (emblem/compact). */
  size?: number;
  /** Single-ink rendering; inherits currentColor. */
  mono?: boolean;
  className?: string;
  /** Accessible name; defaults to the mark's own name. Pass "" for decorative. */
  label?: string;
}

const DEFAULT_LABEL = "FoundrySignal";

/**
 * Emblem — a geometric "F" whose arms resolve into a signal node.
 * Grid 32x32. Spine x6 y4→28 (w3.5); top arm to x26.5; mid arm to x22.5;
 * node at (24, 21.6) with a 4.6 halo at 35% opacity.
 */
export function LogoEmblem({ size = 32, mono = false, className, label = DEFAULT_LABEL }: LogoProps) {
  const ink = mono ? "currentColor" : "var(--fs-text)";
  const path = mono ? "currentColor" : "var(--fs-accent-2)";
  const node = mono ? "currentColor" : "var(--fs-accent)";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      className={className}
    >
      <g fill={ink}>
        <rect x="6" y="4" width="3.5" height="24" rx="1.4" />
        <rect x="6" y="4" width="20.5" height="3.5" rx="1.4" />
        <rect x="6" y="14" width="16.5" height="3.5" rx="1.4" />
      </g>
      <g stroke={path} strokeWidth="1.6" strokeLinecap="round" opacity="0.85">
        <path d="M26.5 7.5 L24 19.4" />
        <path d="M22.5 17.5 L22.9 19.4" />
      </g>
      <circle cx="24" cy="21.6" r="2.4" fill={node} />
      <circle cx="24" cy="21.6" r="4.6" stroke={node} strokeWidth="1" opacity="0.35" fill="none" />
    </svg>
  );
}

export interface WordmarkProps {
  /** Font size in px. The lockups derive their own. */
  size?: number;
  mono?: boolean;
  className?: string;
}

/** Wordmark — Space Grotesk 700, -0.03em tracking, "Signal" in the accent. */
export function LogoWordmark({ size = 17, mono = false, className }: WordmarkProps) {
  return (
    <span
      className={`fs-brand ${className ?? ""}`}
      style={{
        fontSize: `${size}px`,
        fontWeight: 700,
        letterSpacing: "var(--fs-tracking-tighter)",
        lineHeight: "var(--fs-leading-none)",
        color: mono ? "currentColor" : "var(--fs-text)",
        whiteSpace: "nowrap",
      }}
    >
      Foundry
      <span style={{ color: mono ? "currentColor" : "var(--fs-accent-fg)" }}>Signal</span>
    </span>
  );
}

/** Horizontal lockup — emblem + wordmark on one row. The default. */
export interface LockupProps extends LogoProps {
  /** Wordmark font size in px. */
  wordmarkSize?: number;
  /** Gap between emblem and wordmark, px. */
  gap?: number;
}

export function LogoLockup({
  size = 26,
  mono = false,
  className,
  label = DEFAULT_LABEL,
  wordmarkSize = 17,
  gap = 10,
}: LockupProps) {
  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: `${gap}px` }}
    >
      <LogoEmblem size={size} mono={mono} label="" />
      <LogoWordmark size={wordmarkSize} mono={mono} />
      <span className="fs-sr-only">{label}</span>
    </span>
  );
}

/** Stacked lockup — emblem centered above the wordmark. */
export function LogoStacked({
  size = 44,
  mono = false,
  className,
  label = DEFAULT_LABEL,
  wordmarkSize = 21,
  gap = 12,
}: LockupProps) {
  return (
    <span
      className={className}
      style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: `${gap}px` }}
    >
      <LogoEmblem size={size} mono={mono} label="" />
      <LogoWordmark size={wordmarkSize} mono={mono} />
      <span className="fs-sr-only">{label}</span>
    </span>
  );
}

/** Compact lockup — emblem only, for app bars and favicons. */
export function LogoCompact({ size = 20, mono = false, className, label = DEFAULT_LABEL }: LogoProps) {
  return <LogoEmblem size={size} mono={mono} className={className} label={label} />;
}

/**
 * Brand plate — accent field with the emblem knocked out in the page
 * background colour. Used where the mark sits on imagery or a tinted
 * surface and needs guaranteed separation.
 */
export function BrandMark({
  size = 40,
  className,
  label = DEFAULT_LABEL,
}: {
  size?: number;
  className?: string;
  label?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      className={className}
    >
      <rect width="32" height="32" rx="8" fill="var(--fs-accent)" />
      <g fill="var(--fs-bg)">
        <rect x="7" y="5.5" width="3.4" height="21" rx="1.3" />
        <rect x="7" y="5.5" width="18.5" height="3.4" rx="1.3" />
        <rect x="7" y="13.4" width="14.8" height="3.4" rx="1.3" />
      </g>
      <g stroke="var(--fs-bg)" strokeWidth="1.8" strokeLinecap="round" opacity="0.92" fill="none">
        <path d="M25 8.6 L22.6 19.2" />
        <path d="M21.4 17.4 L21.8 19.2" />
      </g>
      <circle cx="22.8" cy="21" r="2.3" fill="var(--fs-bg)" />
    </svg>
  );
}
