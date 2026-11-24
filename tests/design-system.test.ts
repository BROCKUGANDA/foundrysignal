// Design-system contract tests.
//
// These guard the invariants that are invisible in a screenshot and easy to
// break in a refactor:
//
//   1. Token parity — every semantic token defined in the dark theme must also
//      exist in the light theme, or a surface silently inherits the wrong
//      background.
//   2. State coverage — the state library must handle every member of the
//      ViewState union. A missing case means a surface can render nothing.
//   3. Contrast — delegated to scripts/verify-token-contrast.mjs, invoked here
//      so `bun test` fails on a regression instead of waiting for CI.
//   4. Component exports — the public barrel must actually export the
//      components the directive names, so consumers cannot lose one silently.
//
// Run: bun test tests/design-system.test.ts

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

/* ─── Token parsing ─────────────────────────────────────────────────── */

/** Extract custom properties declared under a selector, ignoring at-rules. */
function tokensFor(css: string, selector: ".dark" | ".light"): Set<string> {
  const out = new Set<string>();
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const blockRe = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(clean))) {
    const sel = match[1].replace(/\s+/g, "");
    const inSelector = sel.split(",").includes(selector);
    // Dark tokens also live on :root (the `.dark, :root` list).
    const isDarkRoot = selector === ".dark" && sel.split(",").includes(":root");
    if (!inSelector && !isDarkRoot) continue;
    for (const decl of match[2].split(";")) {
      const colon = decl.indexOf(":");
      if (colon < 0) continue;
      const name = decl.slice(0, colon).trim();
      if (name.startsWith("--fs-")) out.add(name);
    }
  }
  return out;
}

const themesCss = readFileSync(join(ROOT, "src/styles/fs/themes.css"), "utf8");
const tokensCss = readFileSync(join(ROOT, "src/styles/fs/tokens.css"), "utf8");
const baseCss = readFileSync(join(ROOT, "src/styles/fs/base.css"), "utf8");

/* ─── 1. Token parity ───────────────────────────────────────────────── */

describe("theme token parity", () => {
  const dark = tokensFor(themesCss, ".dark");
  const light = tokensFor(themesCss, ".light");

  test("both themes define a non-trivial token set", () => {
    expect(dark.size).toBeGreaterThan(50);
    expect(light.size).toBeGreaterThan(50);
  });

  test("light defines every semantic token dark does", () => {
    // A missing light token silently keeps the dark value, which is exactly
    // the class of bug a screenshot review misses on a light-mode-only pass.
    const missing = [...dark].filter((token) => !light.has(token)).sort();
    expect(missing).toEqual([]);
  });

  test("every raw ramp referenced by themes exists in tokens.css", () => {
    const declared = new Set(
      (tokensCss.match(/--fs-[a-z0-9-]+(?=\s*:)/g) ?? []).map((s) => s.trim()),
    );
    const referenced = new Set(
      (themesCss.match(/var\(\s*(--fs-[a-z0-9-]+)/g) ?? []).map((s) =>
        s.replace(/var\(\s*/, "").trim(),
      ),
    );
    // Nuance tokens may reference other semantic tokens, which are themselves
    // defined in the same file — only flag names defined in neither place.
    const semantic = new Set([...dark, ...light]);
    const orphans = [...referenced].filter((r) => !declared.has(r) && !semantic.has(r)).sort();
    expect(orphans).toEqual([]);
  });
});

/* ─── 2. No hard-coded colours in components ────────────────────────── */

describe("token discipline", () => {
  const COMPONENT_FILES = [
    "src/components/fs/ui/button.tsx",
    "src/components/fs/ui/badge.tsx",
    "src/components/fs/ui/card.tsx",
    "src/components/fs/ui/input.tsx",
    "src/components/fs/ui/select.tsx",
    "src/components/fs/ui/table.tsx",
    "src/components/fs/ui/tabs.tsx",
    "src/components/fs/ui/overlay.tsx",
    "src/components/fs/ui/states.tsx",
    "src/components/fs/ui/toast.tsx",
    "src/components/fs/ui/segmented-control.tsx",
  ];

  test("components use tokens, never literal hex colours", () => {
    const offenders: string[] = [];
    for (const rel of COMPONENT_FILES) {
      const src = readFileSync(join(ROOT, rel), "utf8");
      // Strip comments so prose examples do not trip the check.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
      // A hex colour is only acceptable inside a CSS var definition, which
      // these files must not contain at all.
      const hex = code.match(/#[0-9a-fA-F]{3,8}\b/g);
      if (hex) offenders.push(`${rel}: ${hex.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });

  test("every component file is marked as a client module or is pure markup", () => {
    // Interactive components must declare "use client"; anything that reaches
    // for hooks without it fails at runtime with a confusing error.
    const stateful = [
      "src/components/fs/ui/button.tsx",
      "src/components/fs/ui/overlay.tsx",
      "src/components/fs/ui/tabs.tsx",
      "src/components/fs/ui/states.tsx",
      "src/components/fs/ui/segmented-control.tsx",
      "src/components/fs/ui/select.tsx",
    ];
    for (const rel of stateful) {
      const src = readFileSync(join(ROOT, rel), "utf8");
      expect(src.startsWith('"use client"')).toBe(true);
    }
  });
});

/* ─── 3. ViewState coverage ─────────────────────────────────────────── */

describe("state library coverage", () => {
  const statesSrc = readFileSync(join(ROOT, "src/components/fs/ui/states.tsx"), "utf8");

  // The discriminated union in states.tsx is the contract. Each variant must
  // be reachable from the dispatcher, or a surface can render nothing.
  const VARIANTS = [
    "idle",
    "loading",
    "ready",
    "empty",
    "partial",
    "stale",
    "error",
    "offline",
    "forbidden",
    "degraded",
  ] as const;

  test("ViewState declares every matrix state", () => {
    for (const variant of VARIANTS) {
      expect(statesSrc).toContain(`kind: "${variant}"`);
    }
  });

  test("StateView handles every declared state", () => {
    // Slice the dispatcher so an unrelated `case` elsewhere cannot satisfy it.
    const dispatcher = statesSrc.slice(statesSrc.indexOf("export function StateView"));
    expect(dispatcher.length).toBeGreaterThan(0);
    for (const variant of VARIANTS) {
      expect(dispatcher).toContain(`case "${variant}"`);
    }
  });
});

/* ─── 4. Public API surface ─────────────────────────────────────────── */

describe("public exports", () => {
  const barrel = readFileSync(join(ROOT, "src/components/fs/index.ts"), "utf8");

  // The directive names these specifically; losing one silently breaks the
  // promise that the system is complete.
  const REQUIRED_BASE = [
    "Button",
    "Input",
    "Select",
    "Textarea",
    "Checkbox",
    "Switch",
    "Tabs",
    "Table",
    "Badge",
    "Card",
    "Dialog",
    "Drawer",
    "Tooltip",
    "Pagination",
    "Skeleton",
    "EmptyState",
    "ErrorState",
    "LoadingState",
    "toast",
  ];

  const REQUIRED_DOMAIN = [
    "VentureCard",
    "FounderCard",
    "EvidenceCard",
    "RepositoryPanel",
    "SignalTimeline",
    "EvidenceGraph",
    "FounderGraph",
    "TokenCard",
    "ResearchComposer",
    "ResearchReport",
    "TradePanel",
    "LineChart",
    "Sparkline",
  ];

  const REQUIRED_BRAND = [
    "LogoEmblem",
    "LogoWordmark",
    "LogoLockup",
    "LogoStacked",
    "LogoCompact",
    "BrandMark",
    "SignalPrism",
    "ConvergenceLoader",
    "Glyph",
    "Icon",
  ];

  for (const name of [...REQUIRED_BASE, ...REQUIRED_DOMAIN, ...REQUIRED_BRAND]) {
    test(`barrel exports ${name}`, () => {
      // Match `export { Name` or a declaration line, tolerating grouping.
      const pattern = new RegExp(`\\b${name}\\b`);
      expect(pattern.test(barrel)).toBe(true);
    });
  }
});

/* ─── 5. Brand assets are real, editable SVG ────────────────────────── */

describe("brand assets", () => {
  const ASSETS = [
    "public/brand/emblem.svg",
    "public/brand/emblem-mono.svg",
    "public/brand/app-glyph.svg",
    "public/brand/logo-horizontal.svg",
    "public/brand/logo-stacked.svg",
    "public/brand/favicon.svg",
  ];

  for (const rel of ASSETS) {
    test(`${rel} is an SVG document`, () => {
      const svg = readFileSync(join(ROOT, rel), "utf8");
      expect(svg).toContain("<svg");
      expect(svg).toContain("viewBox");
      // Vector, not a wrapped raster: the directive requires editable artwork.
      expect(svg).not.toContain("<image");
      expect(svg).not.toContain("data:image/png");
    });
  }
});

/* ─── 6. Reduced-motion safety ──────────────────────────────────────── */

describe("reduced motion", () => {
  test("base.css neutralises animation under prefers-reduced-motion", () => {
    expect(baseCss).toContain("@media (prefers-reduced-motion: reduce)");
    // The rule must actually zero the durations, not merely exist.
    const block = baseCss.slice(baseCss.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(block).toContain("animation-duration: 0.01ms !important");
    expect(block).toContain("transition-duration: 0.01ms !important");
  });

  test("the in-app motion opt-out is honoured", () => {
    expect(baseCss).toContain('[data-motion="reduced"]');
  });

  test("motion module exposes a reduced-motion gate", () => {
    const motionSrc = readFileSync(join(ROOT, "src/lib/fs/motion.ts"), "utf8");
    expect(motionSrc).toContain("useMotionOK");
    expect(motionSrc).toContain("prefers-reduced-motion");
  });
});

/* ─── 7. Contrast ───────────────────────────────────────────────────── */

describe("WCAG contrast", () => {
  test("all token pairs meet their target ratio", () => {
    const proc = Bun.spawnSync(["node", "scripts/verify-token-contrast.mjs"], {
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = proc.stdout.toString();
    expect(proc.exitCode).toBe(0);
    expect(stdout).toContain("42/42 pass");
  });
});

/* ─── 8. Theme mechanism ────────────────────────────────────────────── */

describe("theme switching", () => {
  const themeSrc = readFileSync(join(ROOT, "src/components/fs/theme.tsx"), "utf8");

  test("bootstrap script applies the class before first paint", () => {
    // The pre-paint script is intentionally a server-owned literal in layout.tsx
    // (a client-module import here suspends hydration inside <head>). The
    // dedicated theme-hydration.test.ts covers its runtime behaviour.
    const layoutSrc = readFileSync(join(ROOT, "src/app/layout.tsx"), "utf8");
    expect(layoutSrc).toContain("THEME_BOOTSTRAP");
    expect(layoutSrc).toContain("classList.remove");
    expect(layoutSrc).toContain("classList.add");
  });

  test("supports an explicit system mode", () => {
    expect(themeSrc).toContain('"system"');
    expect(themeSrc).toContain("prefers-color-scheme: light");
  });

  test("layout uses the bootstrap rather than a forced theme", () => {
    const layoutSrc = readFileSync(join(ROOT, "src/app/layout.tsx"), "utf8");
    expect(layoutSrc).toContain("THEME_BOOTSTRAP");
    // The old bug: a hard-coded forced theme that defeated the light theme.
    expect(layoutSrc).not.toContain("forcedTheme");
  });
});

/* ─── 9. 3D fallback chain ──────────────────────────────────────────── */

describe("signal prism degradation", () => {
  const prismSrc = readFileSync(join(ROOT, "src/components/fs/brand/signal-prism.tsx"), "utf8");

  test("detects capability rather than assuming WebGL", () => {
    expect(prismSrc).toContain("detectPrismTier");
    expect(prismSrc).toContain("webgl");
    expect(prismSrc).toContain("canvas2d");
    expect(prismSrc).toContain("static");
  });

  test("falls back without throwing when a context is unavailable", () => {
    expect(prismSrc).toContain("try {");
    expect(prismSrc).toContain("catch");
  });

  test("the WebGL scene is lazily loaded", () => {
    expect(prismSrc).toContain("React.lazy");
  });
});