"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { LogoEmblem } from "./logo";
import { useMotionOK } from "@/lib/fs/motion";

/**
 * Brand loading animation — "Convergence".
 *
 * The narrative is the product: scattered signal ticks resolve into the
 * emblem's node. Used for the boot screen and for any full-surface wait, so
 * the wait is branded rather than generic.
 *
 * Three layers:
 *   ConvergenceLoader   full loader (ticks converge into the node)
 *   BrandTransition     one-shot wipe used between major surfaces
 *   BootSplash          initial app mount, with the wordmark
 *
 * All three degrade to a static mark under prefers-reduced-motion — the mark
 * simply appears at full opacity instead of assembling.
 */

const TICKS = 12;

export interface ConvergenceLoaderProps {
  size?: number;
  /** Label announced to assistive tech. */
  label?: string;
  className?: string;
  /** Show the wordmark under the emblem. */
  withWordmark?: boolean;
}

export function ConvergenceLoader({
  size = 96,
  label = "Loading FoundrySignal",
  className,
  withWordmark,
}: ConvergenceLoaderProps) {
  const ok = useMotionOK();
  const ticks = React.useMemo(
    () =>
      Array.from({ length: TICKS }, (_, i) => {
        const angle = (i / TICKS) * Math.PI * 2;
        return {
          id: i,
          x1: Math.cos(angle) * 46,
          y1: Math.sin(angle) * 46,
          x2: Math.cos(angle) * 39,
          y2: Math.sin(angle) * 39,
          delay: (i / TICKS) * 1.2,
          major: i % 3 === 0,
        };
      }),
    [],
  );

  return (
    <div
      className={cn("flex flex-col items-center gap-3", className)}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true">
          {/* Convergence ticks */}
          <g
            style={
              ok
                ? {
                    animation: "fs-converge 1.8s cubic-bezier(0.22,1,0.36,1) infinite",
                    transformOrigin: "60px 60px",
                  }
                : undefined
            }
          >
            {ticks.map((t) => (
              <line
                key={t.id}
                x1={60 + t.x1}
                y1={60 + t.y1}
                x2={60 + t.x2}
                y2={60 + t.y2}
                stroke={t.major ? "var(--fs-accent)" : "var(--fs-accent-2)"}
                strokeWidth={t.major ? 1.8 : 1.2}
                strokeLinecap="round"
                opacity={t.major ? 0.85 : 0.45}
                style={ok ? { animation: `fs-tick-fade 1.8s ease-in-out ${t.delay}s infinite` } : undefined}
              />
            ))}
          </g>
          {/* Orbit ring */}
          <circle
            cx="60"
            cy="60"
            r="46"
            fill="none"
            stroke="var(--fs-border-strong)"
            strokeWidth="1"
            strokeDasharray="2 6"
            style={
              ok
                ? { animation: "fs-spin 9s linear infinite", transformOrigin: "60px 60px" }
                : undefined
            }
          />
        </svg>

        {/* The mark itself, pulsing at the centre */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={ok ? { animation: "fs-mark-breathe 1.8s cubic-bezier(0.4,0,0.2,1) infinite" } : undefined}
        >
          <LogoEmblem size={Math.round(size * 0.32)} />
        </div>
      </div>

      {withWordmark ? (
        <div
          className={cn(
            "fs-brand text-sm font-semibold tracking-tight",
            ok && "animate-pulse",
          )}
        >
          Foundry<span className="text-[var(--fs-accent-fg)]">Signal</span>
        </div>
      ) : null}

      <span className="fs-sr-only">{label}</span>
    </div>
  );
}

/**
 * BrandTransition — a one-shot accent wipe across the viewport.
 *
 * Fires when the parent remounts (key change) or when `active` flips true.
 * Pointer-events are disabled throughout, so it never blocks interaction.
 */
export function BrandTransition({
  active,
  durationMs = 520,
  className,
}: {
  active: boolean;
  durationMs?: number;
  className?: string;
}) {
  const ok = useMotionOK();
  if (!active || !ok) return null;

  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none fixed inset-0 z-50 overflow-hidden", className)}
    >
      <div
        className="absolute inset-0"
        style={{
          background: "var(--fs-gradient-signal)",
          animation: `fs-brand-wipe ${durationMs}ms cubic-bezier(0.22,1,0.36,1) both`,
        }}
      />
    </div>
  );
}

/**
 * BootSplash — full-viewport first paint.
 *
 * Shown until the session query resolves. It occupies the exact dimensions of
 * the app it precedes, so its removal causes no layout shift.
 */
export function BootSplash({
  label = "Starting FoundrySignal",
  className,
  /** Rendered under the loader — usually a hint about what is happening. */
  hint,
}: {
  label?: string;
  className?: string;
  hint?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-dvh flex-col items-center justify-center gap-6 px-6",
        className,
      )}
      style={{ background: "var(--fs-bg)" }}
    >
      <div className="fs-grid-bg pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative flex flex-col items-center gap-4">
        <ConvergenceLoader size={104} withWordmark label={label} />
        {hint ? <p className="max-w-xs text-center text-2xs text-ink-faint">{hint}</p> : null}
      </div>
    </div>
  );
}

/**
 * Inline brand spinner — for buttons and tight rows.
 * Sits at the same optical size as the icon it replaces.
 */
export function BrandSpinner({ size = 16, className }: { size?: number; className?: string }) {
  const ok = useMotionOK();
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 32 32"
        width={size}
        height={size}
        style={ok ? { animation: "fs-spin 1.1s linear infinite" } : undefined}
      >
        <circle
          cx="16"
          cy="16"
          r="12"
          fill="none"
          stroke="var(--fs-border-strong)"
          strokeWidth="3"
        />
        <path
          d="M16 4a12 12 0 0 1 12 12"
          fill="none"
          stroke="var(--fs-accent)"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}