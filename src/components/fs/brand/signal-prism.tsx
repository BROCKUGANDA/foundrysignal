"use client";

import * as React from "react";
import { LogoEmblem } from "@/components/fs/brand/logo";

/**
 * Signal Prism — the FoundrySignal brand object.
 *
 * Three render tiers, selected by capability, not by viewport alone:
 *
 *   webgl    React Three Fiber scene: a rotating prism of signal paths
 *            converging into an emissive node, with orbiting datum ticks
 *   canvas2d Canvas 2D projection of the same geometry, for devices where
 *            WebGL is unavailable but 2D is (most low-power situations)
 *   static   SVG emblem plate — always available, no JS required
 *
 * Degradation is total: any failure (no WebGL context, context loss, driver
 * crash, shader compile error, OOM) lands on a tier that still renders the
 * brand mark. The prism is never load-bearing — no product surface depends on
 * it being animated.
 *
 * Reduced motion: the scene renders a single static frame at a fixed pleasing
 * angle. The rotation is decorative, so removing it costs nothing.
 *
 * Performance:
 *  - `frameloop="demand"` with explicit invalidation while animating, so an
 *    idle prism costs zero frames
 *  - DPR capped at 2
 *  - pauses when the tab is hidden or the element leaves the viewport
 *  - disposes geometry/materials/textures on unmount
 */

/* ─── Capability detection ──────────────────────────────────────────── */

export type PrismTier = "webgl" | "canvas2d" | "static";

let cachedTier: PrismTier | null = null;

/**
 * Detect the best available tier. Cached after first probe: creating a WebGL
 * context is expensive and the answer does not change at runtime.
 */
export function detectPrismTier(): PrismTier {
  if (cachedTier) return cachedTier;
  if (typeof document === "undefined") return "static";

  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: false }) ??
      canvas.getContext("webgl", { failIfMajorPerformanceCaveat: false });
    if (gl) {
      // Release the probe context immediately; browsers cap live contexts.
      const lose = (gl as WebGLRenderingContext).getExtension("WEBGL_lose_context");
      lose?.loseContext();
      cachedTier = "webgl";
      return cachedTier;
    }
  } catch {
    /* fall through */
  }

  try {
    const canvas = document.createElement("canvas");
    if (canvas.getContext("2d")) {
      cachedTier = "canvas2d";
      return cachedTier;
    }
  } catch {
    /* fall through */
  }

  cachedTier = "static";
  return cachedTier;
}

/* ─── Static tier ───────────────────────────────────────────────────── */

function StaticPrism({ size, className }: { size: number; className?: string }) {
  return (
    <div
      role="img"
      aria-label="FoundrySignal Signal Prism (static rendering)"
      className={className}
      style={{ width: size, height: size }}
    >
      <div className="relative flex size-full items-center justify-center overflow-hidden rounded-xl">
        <div className="fs-grid-bg absolute inset-0" aria-hidden="true" />
        <div className="absolute inset-0" aria-hidden="true" style={{ background: "var(--fs-gradient-prism)" }} />
        <LogoEmblem size={Math.round(size * 0.3)} />
      </div>
    </div>
  );
}

/* ─── Canvas2D tier ─────────────────────────────────────────────────── */

/**
 * Projects the same 3D geometry as the WebGL scene through a simple
 * perspective divide. Keeps the brand object recognisable without a GPU.
 */
function CanvasPrism({
  size,
  animate,
}: {
  size: number;
  animate: boolean;
}) {
  const ref = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const R = size * 0.33;

    const PATHS: Array<{ from: [number, number, number]; to: [number, number, number]; color: string }> = [
      { from: [1.15, -1.3, 0.35], to: [0.5, 0.45, 0.1], color: "rgba(120,153,255,0.9)" },
      { from: [-1.25, 0.7, -0.3], to: [0.5, 0.45, 0.1], color: "rgba(100,229,203,0.95)" },
      { from: [1.05, 0.85, -0.4], to: [0.5, 0.45, 0.1], color: "rgba(100,229,203,0.5)" },
      { from: [-0.55, -1.1, 0.45], to: [0.5, 0.45, 0.1], color: "rgba(232,181,111,0.55)" },
    ];

    let raf = 0;
    let t = 0;

    const project = (p: [number, number, number], spin: number): [number, number] => {
      const [x, y, z] = p;
      // Y-axis rotation + a fixed tilt, then perspective divide.
      const rx = x * Math.cos(spin) - z * Math.sin(spin);
      const rz = x * Math.sin(spin) + z * Math.cos(spin);
      const ry = y * Math.cos(0.42) - rz * Math.sin(0.42);
      const depth = 2.6 - (y * Math.sin(0.42) + rz * Math.cos(0.42));
      const f = 2.6 / Math.max(depth, 0.4);
      return [cx + rx * R * f, cy + ry * R * f];
    };

    const draw = () => {
      ctx.clearRect(0, 0, size, size);
      const spin = t * 0.0075;

      // Orbit ring
      ctx.strokeStyle = "rgba(120,153,255,0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx, cy, R * 1.42, R * 1.42 * 0.34, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Datum ticks
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2 + spin * 0.5;
        const r1 = R * 1.42;
        const r2 = R * (i % 6 === 0 ? 1.54 : 1.47);
        ctx.strokeStyle = i % 6 === 0 ? "rgba(100,229,203,0.4)" : "rgba(120,153,255,0.22)";
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * 0.34);
        ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2 * 0.34);
        ctx.stroke();
      }

      // Signal paths
      for (const p of PATHS) {
        const [x1, y1] = project(p.from, spin);
        const [x2, y2] = project(p.to, spin);
        const grad = ctx.createLinearGradient(x1, y1, x2, y2);
        grad.addColorStop(0, "transparent");
        grad.addColorStop(1, p.color);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // Node
      const [nx, ny] = project([0.5, 0.45, 0.1], spin);
      const pulse = animate ? 1 + Math.sin(t * 0.0035) * 0.16 : 1;
      const glow = ctx.createRadialGradient(nx, ny, 0, nx, ny, 16 * pulse);
      glow.addColorStop(0, "rgba(100,229,203,0.75)");
      glow.addColorStop(1, "rgba(100,229,203,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(nx, ny, 16 * pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#64E5CB";
      ctx.beginPath();
      ctx.arc(nx, ny, 2.8, 0, Math.PI * 2);
      ctx.fill();

      if (animate) {
        t += 1;
        raf = requestAnimationFrame(draw);
      }
    };

    draw();

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
      } else if (animate) {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(draw);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [size, animate]);

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label="Signal Prism — animated brand object (2D rendering)"
      style={{ width: size, height: size }}
    />
  );
}

/* ─── WebGL tier (React Three Fiber) ────────────────────────────────── */

/**
 * Lazily loaded: R3F + three are ~200 kB and are only needed for the brand
 * object. The static tier renders while the chunk arrives.
 */
const PrismScene = React.lazy(() => import("./prism-scene"));

function WebGLPrism({
  size,
  animate,
}: {
  size: number;
  animate: boolean;
}) {
  return (
    <React.Suspense fallback={<CanvasPrism size={size} animate={animate} />}>
      <PrismScene size={size} animate={animate} />
    </React.Suspense>
  );
}

/* ─── Public component ──────────────────────────────────────────────── */

export interface SignalPrismProps {
  size?: number;
  className?: string;
  /** Force a tier (used by the playground to exercise fallbacks). */
  forceTier?: PrismTier;
  /** Override the OS preference; defaults to following it. */
  animate?: boolean;
}

export function SignalPrism({
  size = 320,
  className,
  forceTier,
  animate: animateProp,
}: SignalPrismProps) {
  const [tier, setTier] = React.useState<PrismTier | null>(null);
  const [reduced, setReduced] = React.useState(false);

  React.useEffect(() => {
    setTier(forceTier ?? detectPrismTier());

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [forceTier]);

  // Nothing measured yet → static. This also covers SSR, where `document`
  // does not exist and the static mark is the correct output.
  if (tier === null) return <StaticPrism size={size} className={className} />;

  const animate = (animateProp ?? !reduced) && tier !== "static";

  if (tier === "static") return <StaticPrism size={size} className={className} />;
  if (tier === "canvas2d") {
    return (
      <div className={className}>
        <CanvasPrism size={size} animate={animate} />
      </div>
    );
  }

  return (
    <div className={className} style={{ width: size, height: size }}>
      <WebGLPrism size={size} animate={animate} />
    </div>
  );
}

export default SignalPrism;