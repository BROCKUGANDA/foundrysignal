"use client";

/**
 * FoundrySignal motion system.
 *
 * Three layers:
 *   duration / easing tokens   → src/styles/fs/tokens.css (--fs-duration-*, --fs-ease-*)
 *   variants                   → this file (named, reusable, typed)
 *   reduced-motion gate        → useMotionOK()
 *
 * Rules enforced here:
 *  1. Motion is never load-bearing. Every variant has an instant equivalent
 *     (`reduce: { duration: 0 }`), and `useMotionOK()` returns false when the
 *     user prefers reduced motion or the app sets data-motion="reduced".
 *  2. Nothing animates a layout property. Only transform, opacity, and
 *     stroke-dashoffset — all compositor-friendly.
 *  3. No component imports framer-motion directly; they import from here so
 *     durations and easings stay in one place.
 */

import { useEffect, useState } from "react";

/** Motion tokens, mirrored from tokens.css for use in JS-driven animation. */
export const motion = {
  duration: {
    instant: 0,
    micro: 90,
    fast: 130,
    base: 180,
    slow: 260,
    slower: 380,
    reveal: 520,
    ambient: 2400,
  },
  ease: {
    /** [0.22, 1, 0.36, 1] — fast start, long settle. Default for entrances. */
    out: [0.22, 1, 0.36, 1] as const,
    inOut: [0.4, 0, 0.2, 1] as const,
    spring: [0.34, 1.56, 0.64, 1] as const,
    standard: [0.2, 0, 0, 1] as const,
    decelerate: [0, 0, 0, 1] as const,
    accelerate: [0.3, 0, 1, 1] as const,
  },
} as const;

export type MotionDuration = keyof typeof motion.duration;
export type MotionEase = keyof typeof motion.ease;

const EASE_CSS: Record<MotionEase, string> = {
  out: "cubic-bezier(0.22, 1, 0.36, 1)",
  inOut: "cubic-bezier(0.4, 0, 0.2, 1)",
  spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  decelerate: "cubic-bezier(0, 0, 0, 1)",
  accelerate: "cubic-bezier(0.3, 0, 1, 1)",
};

/** CSS timing-function string for a named ease. */
export const easeCss = (ease: MotionEase): string => EASE_CSS[ease];

/** Inline transition shorthand — compositor-only by construction. */
export function transition(
  props: string | string[],
  duration: MotionDuration = "fast",
  ease: MotionEase = "out",
  delayMs = 0,
): string {
  const list = Array.isArray(props) ? props : [props];
  return list
    .map((p) => `${p} ${motion.duration[duration]}ms ${easeCss(ease)}${delayMs ? ` ${delayMs}ms` : ""}`)
    .join(", ");
}

/* ─── Reduced-motion gate ───────────────────────────────────────────── */

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * True when animation is allowed.
 *
 * Checks both the OS preference and the in-app `[data-motion="reduced"]`
 * opt-out, and keeps listening for changes — the OS setting can flip
 * mid-session and the app toggle is user-facing.
 */
export function useMotionOK(): boolean {
  const [ok, setOk] = useState(() => {
    if (typeof window === "undefined") return true;
    if (window.matchMedia(QUERY).matches) return false;
    return document.documentElement.dataset.motion !== "reduced";
  });

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const update = () => {
      const osAllows = !mq.matches;
      const appAllows = document.documentElement.dataset.motion !== "reduced";
      setOk(osAllows && appAllows);
    };
    update();
    mq.addEventListener("change", update);

    // The app-level toggle lives on <html data-motion>, not on a media query,
    // so observe it explicitly.
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-motion"],
    });

    return () => {
      mq.removeEventListener("change", update);
      observer.disconnect();
    };
  }, []);

  return ok;
}

/** Duration in ms, zeroed when motion is disallowed. */
export function useMotionDuration(base: MotionDuration | number): number {
  const ok = useMotionOK();
  if (!ok) return 0;
  return typeof base === "number" ? base : motion.duration[base];
}

/* ─── Named variants ────────────────────────────────────────────────── */

export type VariantName =
  | "fadeIn"
  | "fadeUp"
  | "fadeDown"
  | "scaleIn"
  | "slideInRight"
  | "slideInLeft"
  | "drawPath"
  | "shimmer"
  | "pulse";

/**
 * Variant lookup for CSS-driven animation. Components apply these via the
 * matching `.fs-*` class in base.css so SSR renders the final state and
 * animation is purely additive.
 */
export const VARIANT_CLASS: Record<VariantName, string> = {
  fadeIn: "fs-fade-in",
  fadeUp: "fs-fade-up",
  fadeDown: "fs-fade-up",
  scaleIn: "fs-scale-in",
  slideInRight: "fs-slide-in-right",
  slideInLeft: "fs-slide-in-right",
  drawPath: "fs-draw-path",
  shimmer: "fs-skeleton",
  pulse: "fs-live-dot",
};

/**
 * JS-driven variants (for orchestration framer-motion would otherwise own).
 * Each has a `reduce` twin so the motion gate is a lookup, not a branch.
 */
export const variants = {
  fadeIn: {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: motion.duration.base / 1000, ease: motion.ease.out } },
    reduce: { hidden: { opacity: 1 }, visible: { opacity: 1 } },
  },
  fadeUp: {
    hidden: { opacity: 0, y: 8 },
    visible: { opacity: 1, y: 0, transition: { duration: motion.duration.slow / 1000, ease: motion.ease.out } },
    reduce: { hidden: { opacity: 1, y: 0 }, visible: { opacity: 1, y: 0 } },
  },
  scaleIn: {
    hidden: { opacity: 0, scale: 0.97 },
    visible: { opacity: 1, scale: 1, transition: { duration: motion.duration.slow / 1000, ease: motion.ease.out } },
    reduce: { hidden: { opacity: 1, scale: 1 }, visible: { opacity: 1, scale: 1 } },
  },
  slideInRight: {
    hidden: { opacity: 0, x: 12 },
    visible: { opacity: 1, x: 0, transition: { duration: motion.duration.slow / 1000, ease: motion.ease.out } },
    reduce: { hidden: { opacity: 1, x: 0 }, visible: { opacity: 1, x: 0 } },
  },
  /** Parent/child pair for staggered lists. */
  list: {
    hidden: {},
    visible: {
      transition: { staggerChildren: 0.04 },
    },
    reduce: { hidden: {}, visible: {} },
  },
  listItem: {
    hidden: { opacity: 0, y: 8 },
    visible: { opacity: 1, y: 0, transition: { duration: motion.duration.slow / 1000, ease: motion.ease.out } },
    reduce: { hidden: { opacity: 1, y: 0 }, visible: { opacity: 1, y: 0 } },
  },
  /** Dialog / drawer / popover surfaces. */
  overlay: {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: motion.duration.base / 1000, ease: motion.ease.out } },
    reduce: { hidden: { opacity: 1 }, visible: { opacity: 1 } },
  },
  surface: {
    hidden: { opacity: 0, scale: 0.98, y: 4 },
    visible: { opacity: 1, scale: 1, y: 0, transition: { duration: motion.duration.slow / 1000, ease: motion.ease.out } },
    reduce: { hidden: { opacity: 1, scale: 1, y: 0 }, visible: { opacity: 1, scale: 1, y: 0 } },
  },
} as const;

/** Pick the variant set that respects the current motion preference. */
export function useVariant(name: keyof typeof variants) {
  const ok = useMotionOK();
  const v = variants[name];
  return ok ? { hidden: v.hidden, visible: v.visible } : { hidden: v.reduce.hidden, visible: v.reduce.visible };
}

/* ─── Micro-interaction descriptors ─────────────────────────────────── */

/**
 * Named interactions for components that need a specific feel rather than a
 * raw transition string. Consumed via `style` or a CSS class.
 */
export const interaction = {
  /** Press feedback: shrink to 97.5% in 90ms. */
  press: {
    transform: "scale(0.975)",
    transition: transition("transform", "micro", "out"),
  },
  /** Hover lift for cards: 1px up + elevation bump. */
  lift: {
    transform: "translateY(-1px)",
    transition: transition("transform, box-shadow", "fast", "out"),
  },
  /** Pointer affordance on links. */
  linkUnderline: {
    textDecorationColor: "currentColor",
    transition: transition("color, text-decoration-color", "fast", "out"),
  },
} as const;