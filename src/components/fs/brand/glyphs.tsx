// FoundrySignal proprietary glyph set.
//
// Two families share one geometry (24x24 grid, 1.6 stroke, round caps/joins,
// grid-aligned on whole/half pixels):
//
//   Glyph<name>   domain glyphs — venture intelligence concepts
//   Icon<name>    interface glyphs — generic actions (menu, search, chevrons)
//
// Rationale for owning both: every glyph that carries product meaning
// (evidence, attestation, attribution, provenance) is part of the brand
// vocabulary and must not be swapped for a stock icon set. Interface
// affordances stay generic but are drawn here too, so stroke weight and
// optical size stay consistent with the domain set — mixing Lucide (1.5–2px
// variable) with a 1.6px custom set visibly seams in dense UI.
//
// Accessibility: decorative by default (aria-hidden). Pass `label` to
// promote to role="img" with an accessible name.

import React from "react";

export interface GlyphProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
  /** Accessible name. Omit for decorative use (the common case). */
  label?: string;
  style?: React.CSSProperties;
}

interface GlyphBaseProps extends GlyphProps {
  children: React.ReactNode;
}

function GlyphBase({ size = 18, className, strokeWidth = 1.6, children, label, style }: GlyphBaseProps) {
  const decorative = !label;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={decorative ? undefined : "img"}
      aria-label={label}
      aria-hidden={decorative ? true : undefined}
      focusable="false"
      className={className}
      style={style}
    >
      {children}
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   DOMAIN GLYPHS — venture intelligence vocabulary
   ═══════════════════════════════════════════════════════════════════════ */

/** Founder identity — person with a signal arc overhead. */
export function GlyphFounder(p: GlyphProps) {
  return (
    <GlyphBase {...p} label={p.label}>
      <circle cx="12" cy="8.4" r="3.2" />
      <path d="M5.5 19.2c0-3.6 2.9-5.6 6.5-5.6s6.5 2 6.5 5.6" />
      <path d="M9.4 3.6c.8-.5 1.7-.8 2.6-.8s1.8.3 2.6.8" opacity="0.6" />
    </GlyphBase>
  );
}

/** Venture — structured diamond with a core signal. */
export function GlyphVenture(p: GlyphProps) {
  return (
    <GlyphBase {...p} label={p.label}>
      <path d="M12 3.2 20.8 12 12 20.8 3.2 12Z" />
      <circle cx="12" cy="12" r="1.9" fill="currentColor" stroke="none" />
    </GlyphBase>
  );
}

/** Development — terminal chevron with a cursor line. */
export function GlyphDevelopment(p: GlyphProps) {
  return (
    <GlyphBase {...p} label={p.label}>
      <path d="M5.5 7.2 10.5 12l-5 4.8" />
      <path d="M13 17h5.5" />
    </GlyphBase>
  );
}

/** Repository — branch topology. */
export function GlyphRepository(p: GlyphProps) {
  return (
    <GlyphBase {...p} label={p.label}>
      <circle cx="7" cy="5.8" r="2.1" />
      <circle cx="7" cy="18.2" r="2.1" />
      <circle cx="17" cy="12" r="2.1" />
      <path d="M7 7.9v8.2" />
      <path d="M7 12c0-2.1 3.4-2.7 6-2.7" />
    </GlyphBase>
  );
}

/** Product — package / cube. */
export function GlyphProduct(p: GlyphProps) {
  return (
    <GlyphBase {...p} label={p.label}>
      <path d="M12 3 20 7.4v9.2L12 21l-8-4.4V7.4L12 3Z" />
      <path d="M4 7.4 12 12l8-4.6" />
      <path d="M12 12v9" />
    </GlyphBase>
  );
}

/** Evidence — verified document. */
export function GlyphEvidence(p: GlyphProps) {
  return (
    <GlyphBase {...p} label={p.label}>
      <path d="M6.6 3.4h8.2l3 3v14.2H6.6a1 1 0 0 1-1-1V4.4a1 1 0 0 1 1-1Z" />
      <path d="M14.4 3.4v3.4h3.4" />
      <path d="M8.8 12.6l1.9 1.9 3.8-4.4" />
    </GlyphBase>
  );
}

/** Attestation — shield with an anchored node. */
export function GlyphAttestation(p: GlyphProps) {
  return (
    <GlyphBase {...p} label={p.label}>
      <path d="M12 3 19 5.8v6c0 4.4-3 7.7-7 9.2-4-1.5-7-4.8-7-9.2v-6L12 3Z" />
      <circle cx="12" cy="10.4" r="1.4" fill="currentColor" stroke="none" />
      <path d="M12 11.8v3.6" />
    </GlyphBase>
  );
}

/** Onchain activity — two chain endpoints around a diamond. */
export function GlyphOnchain(p: GlyphProps) {
  return (
    <GlyphBase {...p} label={p.label}>
      <circle cx="4.8" cy="12" r="2.1" />
      <circle cx="19.2" cy="12" r="2.1" />
      <path d="M12 7.4 16.6 12 12 16.6 7.4 12Z" />
      <path d="M6.9 12h.6M16.5 12h.6" opacity="0.5" />
    </GlyphBase>
  );
}

/** Market — candlesticks. */
export function GlyphMarket(p: GlyphProps) {
  return (
    <GlyphBase {...p} label={p.label}>
      <path d="M7.4 4.6v3.2M7.4 16.2v3.2" />
      <rect x="5.7" y="7.8" width="3.4" height="8.4" rx="0.8" />
      <path d="M16.6 3.4v2.4M16.6 14.6v4.2" />
      <rect x="14.9" y="5.8" width="3.4" height="8.8" rx="0.8" />
    </GlyphBase>
  );
}

/** Liquidity — pooled waves. */
export function GlyphLiquidity(p: GlyphProps) {
  return (
    <GlyphBase {...p} label={p.label}>
      <path d="M3 9.6c3-2.4 6 2.4 9 0s6-2.4 9 0" />
      <path d="M3 15.2c3-2.4 6 2.4 9 0s6-2.4 9 0" opacity="0.6" />
    </GlyphBase>
  );
}

/** Risk — alert triangle. */
export function GlyphRisk(p: GlyphProps) {
  return (
    <GlyphBase {...p} label={p.label}>
      <path d="M12 3.8 21.2 19.4H2.8L12 3.8Z" />
      <path d="M12 10.2v3.8" />
      <circle cx="12" cy="16.6" r="0.55" fill="currentColor" stroke="none" />
    </GlyphBase>
  );
}

/** Research — magnifier with a signal trace inside. */
export function GlyphResearch(p: GlyphProps) {
  return (
    <GlyphBase {...p} label={p.label}>
      <circle cx="10.6" cy="10.6" r="5.8" />
      <path d="M15 15l5.2 5.2" />
      <path d="M7.6 10.6h1.6l1-2 1.6 3.6 1-1.6h1.8" opacity="0.85" />
    </GlyphBase>
  );
}

/** Token — coin with a mint axis. */
export function GlyphToken(p: GlyphProps) {
  return (
    <GlyphBase {...p} label={p.label}>
      <ellipse cx="12" cy="6.6" rx="6.4" ry="2.8" />
      <path d="M5.6 6.6v4.2c0 1.5 2.9 2.8 6.4 2.8s6.4-1.3 6.4-2.8V6.6" />
      <path d="M5.6 10.8v4.2c0 1.5 2.9 2.8 6.4 2.8s6.4-1.3 6.4-2.8v-4.2" opacity="0.65" />
    </GlyphBase>
  );
}

/** Claim — a statement with a citation anchor. */
export function GlyphClaim(p: GlyphProps) {
  return (
    <GlyphBase {...p} label={p.label}>
      <path d="M4.5 5.4h15v9.2h-7.1L8 18.4v-3.8H4.5V5.4Z" />
      <path d="M8 9.2h8M8 11.8h5" opacity="0.7" />
    </GlyphBase>
  );
}

/** Watchlist — eye over a list rule. */
export function GlyphWatchlist(p: GlyphProps) {
  return (
    <GlyphBase {...p} label={p.label}>
      <path d="M2.6 12S5.8 6.4 12 6.4 21.4 12 21.4 12 18.2 17.6 12 17.6 2.6 12 2.6 12Z" />
      <circle cx="12" cy="12" r="2.6" />
    </GlyphBase>
  );
}

/** Report — document with an ascending series. */
export function GlyphReport(p: GlyphProps) {
  return (
    <GlyphBase {...p} label={p.label}>
      <path d="M6.6 3.4h8.2l3 3v14.2H6.6a1 1 0 0 1-1-1V4.4a1 1 0 0 1 1-1Z" />
      <path d="M14.4 3.4v3.4h3.4" />
      <path d="M8.4 16.4l2.2-3 1.9 1.6 2.6-3.2" opacity="0.85" />
    </GlyphBase>
  );
}

export const GLYPHS = {
  founder: GlyphFounder,
  venture: GlyphVenture,
  development: GlyphDevelopment,
  repository: GlyphRepository,
  product: GlyphProduct,
  evidence: GlyphEvidence,
  attestation: GlyphAttestation,
  onchain: GlyphOnchain,
  market: GlyphMarket,
  liquidity: GlyphLiquidity,
  risk: GlyphRisk,
  research: GlyphResearch,
  token: GlyphToken,
  claim: GlyphClaim,
  watchlist: GlyphWatchlist,
  report: GlyphReport,
} as const;

export type GlyphName = keyof typeof GLYPHS;

/** Render a domain glyph by name. */
export function Glyph({ name, ...props }: GlyphProps & { name: GlyphName }) {
  const C = GLYPHS[name];
  return <C {...props} />;
}

/* ═══════════════════════════════════════════════════════════════════════
   INTERFACE GLYPHS — generic affordances, same geometry
   ═══════════════════════════════════════════════════════════════════════ */

/** Menu / open navigation. */
export function IconMenu(p: GlyphProps) {
  return <GlyphBase {...p}><path d="M4 7h16M4 12h16M4 17h16" /></GlyphBase>;
}

/** Close / dismiss. */
export function IconClose(p: GlyphProps) {
  return <GlyphBase {...p}><path d="M6 6l12 12M18 6 6 18" /></GlyphBase>;
}

/** Search. */
export function IconSearch(p: GlyphProps) {
  return <GlyphBase {...p}><circle cx="10.8" cy="10.8" r="6" /><path d="M15.4 15.4 20 20" /></GlyphBase>;
}

/** Right chevron. */
export function IconChevronRight(p: GlyphProps) {
  return <GlyphBase {...p}><path d="M9.5 5.5 16 12l-6.5 6.5" /></GlyphBase>;
}

/** Down chevron. */
export function IconChevronDown(p: GlyphProps) {
  return <GlyphBase {...p}><path d="M5.5 9.5 12 16l6.5-6.5" /></GlyphBase>;
}

/** External link / open in new tab. */
export function IconExternalLink(p: GlyphProps) {
  return (
    <GlyphBase {...p}>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14.5V19a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 19V8a1.5 1.5 0 0 1 1.5-1.5H10" opacity="0.75" />
    </GlyphBase>
  );
}

/** Copy to clipboard. */
export function IconCopy(p: GlyphProps) {
  return (
    <GlyphBase {...p}>
      <rect x="8.4" y="8.4" width="11.2" height="11.2" rx="1.6" />
      <path d="M15.6 5.6A1.6 1.6 0 0 0 14 4H5.6A1.6 1.6 0 0 0 4 5.6V14a1.6 1.6 0 0 0 1.6 1.6" />
    </GlyphBase>
  );
}

/** Check / confirmed. */
export function IconCheck(p: GlyphProps) {
  return <GlyphBase {...p}><path d="M4.5 12.8 9.4 17.6 19.5 6.8" /></GlyphBase>;
}

/** Refresh / recollect. */
export function IconRefresh(p: GlyphProps) {
  return (
    <GlyphBase {...p}>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4v4.4h-4.4" />
    </GlyphBase>
  );
}

/** Plus / add. */
export function IconPlus(p: GlyphProps) {
  return <GlyphBase {...p}><path d="M12 5v14M5 12h14" /></GlyphBase>;
}

/** Trash / remove. */
export function IconTrash(p: GlyphProps) {
  return (
    <GlyphBase {...p}>
      <path d="M4.5 6.8h15" />
      <path d="M9.2 6.8V4.6h5.6v2.2" />
      <path d="M6.4 6.8l.9 13.6h9.4l.9-13.6" />
    </GlyphBase>
  );
}

/** Info / disclosure. */
export function IconInfo(p: GlyphProps) {
  return (
    <GlyphBase {...p}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 11v5.4" />
      <circle cx="12" cy="8" r="0.6" fill="currentColor" stroke="none" />
    </GlyphBase>
  );
}

/** Settings / sliders. */
export function IconSettings(p: GlyphProps) {
  return (
    <GlyphBase {...p}>
      <path d="M4 7.5h9M17.5 7.5H20M4 16.5h3.5M11.5 16.5H20" />
      <circle cx="15" cy="7.5" r="2.4" />
      <circle cx="9.4" cy="16.5" r="2.4" />
    </GlyphBase>
  );
}

/** Sun / switch to light theme. */
export function IconSun(p: GlyphProps) {
  return (
    <GlyphBase {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6" />
    </GlyphBase>
  );
}

/** Moon / switch to dark theme. */
export function IconMoon(p: GlyphProps) {
  return (
    <GlyphBase {...p}>
      <path d="M20 14.4A8.6 8.6 0 0 1 9.6 4a8.6 8.6 0 1 0 10.4 10.4Z" />
    </GlyphBase>
  );
}

/** Sign out. */
export function IconSignOut(p: GlyphProps) {
  return (
    <GlyphBase {...p}>
      <path d="M14.5 4.5h3.6A1.4 1.4 0 0 1 19.5 6v12a1.4 1.4 0 0 1-1.4 1.4h-3.6" />
      <path d="M10 8.5 13.5 12 10 15.5M13.5 12H4.5" />
    </GlyphBase>
  );
}

/** Bell / alerts. */
export function IconBell(p: GlyphProps) {
  return (
    <GlyphBase {...p}>
      <path d="M6.4 16.4V11a5.6 5.6 0 0 1 11.2 0v5.4l1.6 2.2H4.8l1.6-2.2Z" />
      <path d="M10.2 21a1.9 1.9 0 0 0 3.6 0" opacity="0.7" />
    </GlyphBase>
  );
}

export const ICONS = {
  menu: IconMenu,
  close: IconClose,
  search: IconSearch,
  chevronRight: IconChevronRight,
  chevronDown: IconChevronDown,
  externalLink: IconExternalLink,
  copy: IconCopy,
  check: IconCheck,
  refresh: IconRefresh,
  plus: IconPlus,
  trash: IconTrash,
  info: IconInfo,
  settings: IconSettings,
  sun: IconSun,
  moon: IconMoon,
  signOut: IconSignOut,
  bell: IconBell,
} as const;

export type IconName = keyof typeof ICONS;

/** Render an interface glyph by name. */
export function Icon({ name, ...props }: GlyphProps & { name: IconName }) {
  const C = ICONS[name];
  return <C {...props} />;
}