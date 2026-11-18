"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Badge / chip — compact status label.
 *
 * Distinct from Button: never interactive on its own. If a badge must be
 * clickable, wrap it in a Button with `variant="ghost"` so the hit target
 * and focus behaviour stay correct.
 *
 * State contract: badges are read-only, so there is no hover/active state.
 * `dot` adds a shape cue so colour is never the only signal (WCAG 1.4.1).
 */

const badgeVariants = cva(
  [
    "fs-chip inline-flex max-w-full items-center gap-1.5",
    "[&_svg]:shrink-0 [&_svg]:size-3",
    "transition-colors duration-fast ease-out",
  ].join(" "),
  {
    variants: {
      tone: {
        neutral: "fs-chip-neutral",
        accent: "fs-chip-accent",
        success: "fs-chip-ok",
        warning: "fs-chip-warn",
        danger: "fs-chip-error",
        info: "fs-chip-info",
        /** Solid accent — for the single highest-priority status in a view. */
        solid: "bg-accent text-[var(--fs-accent-contrast)] border border-transparent",
      },
      size: {
        sm: "text-2xs px-1.5",
        md: "text-2xs px-2",
      },
    },
    defaultVariants: { tone: "neutral", size: "md" },
  },
);

/** Status tone for semantic verification states. */
export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

export interface BadgeProps
  extends Omit<React.ComponentPropsWithoutRef<"span">, "color">,
    VariantProps<typeof badgeVariants> {
  /** Render as the child element. */
  asChild?: boolean;
  /** Leading shape cue; colour is never the only differentiator. */
  dot?: boolean;
}

export function Badge({ className, tone, size, asChild = false, dot, children, ...props }: BadgeProps) {
  const Comp = asChild ? Slot : "span";
  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ tone, size }), className)} {...props}>
      {dot ? (
        <span
          aria-hidden="true"
          className="inline-block size-1.5 shrink-0 rounded-full bg-current"
        />
      ) : null}
      {children}
    </Comp>
  );
}

export { badgeVariants };

/* ─── Verification badge ────────────────────────────────────────────── */

/**
 * Maps the domain verification classes onto tones.
 *
 * The engine is deterministic — these are the only values it emits
 * (src/lib/domain/evidence/engine.ts). Anything unrecognised renders as a
 * neutral `UNKNOWN` chip rather than silently passing as verified.
 */
export const VERIFICATION_TONE = {
  INDEPENDENTLY_CORROBORATED: { tone: "success", label: "Corroborated" },
  SOURCE_CONFIRMED: { tone: "success", label: "Confirmed" },
  SELF_ASSERTED: { tone: "neutral", label: "Self-asserted" },
  FOUNDER_PROVIDED: { tone: "info", label: "Founder" },
  DISPUTED: { tone: "danger", label: "Disputed" },
  STALE: { tone: "warning", label: "Stale" },
  UNKNOWN: { tone: "neutral", label: "Unknown" },
} as const satisfies Record<string, { tone: BadgeTone; label: string }>;

export type Verification = keyof typeof VERIFICATION_TONE;

export function VerificationBadge({
  value,
  className,
  dot = true,
}: {
  value: string;
  className?: string;
  dot?: boolean;
}) {
  const meta =
    VERIFICATION_TONE[value as Verification] ?? VERIFICATION_TONE.UNKNOWN;
  return (
    <Badge tone={meta.tone} dot={dot} className={className} title={`Verification: ${value}`}>
      {meta.label}
    </Badge>
  );
}

/* ─── Claim status badge ────────────────────────────────────────────── */

export const CLAIM_TONE = {
  SUPPORTED: { tone: "success", label: "Supported" },
  CONTRADICTED: { tone: "danger", label: "Contradicted" },
  OUTDATED: { tone: "warning", label: "Outdated" },
  UNVERIFIED: { tone: "neutral", label: "Unverified" },
} as const satisfies Record<string, { tone: BadgeTone; label: string }>;

export type ClaimStatus = keyof typeof CLAIM_TONE;

export function ClaimBadge({
  value,
  className,
  dot = true,
}: {
  value: string;
  className?: string;
  dot?: boolean;
}) {
  const meta = CLAIM_TONE[value as ClaimStatus] ?? CLAIM_TONE.UNVERIFIED;
  return (
    <Badge tone={meta.tone} dot={dot} className={className} title={`Claim status: ${value}`}>
      {meta.label}
    </Badge>
  );
}

/* ─── Staleness badge ───────────────────────────────────────────────── */

/**
 * Flags an observation as older than its freshness policy. `asOf` is shown
 * rather than hidden, so a stale record never looks current.
 */
export function StaleBadge({ asOf, className }: { asOf: string; className?: string }) {
  return (
    <Badge tone="warning" className={className} title={`Collected ${asOf} — past its freshness policy`}>
      Stale · {asOf}
    </Badge>
  );
}