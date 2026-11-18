// WCAG 2.2 contrast harness for the FoundrySignal token layer.
// Parses src/styles/fs/{tokens,themes}.css, resolves var() chains, then
// asserts every foreground/background pairing the design system ships.
//
// Usage: node scripts/verify-token-contrast.mjs [--json]

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const cssFiles = [
  resolve(here, "../src/styles/fs/tokens.css"),
  resolve(here, "../src/styles/fs/themes.css"),
];

function parseBlocks(css) {
  const blocks = [];
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  // atRules: the @media / @supports context a block lives in. Blocks inside
  // `@media print` must never leak into the base theme scope.
  const walk = (text, atRules) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf("{", i);
      if (open < 0) break;
      const header = text.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      while (j < text.length && depth > 0) {
        const ch = text[j];
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
        if (depth === 0) break;
        j++;
      }
      const body = text.slice(open + 1, j);
      if (header.startsWith("@")) {
        walk(body, [...atRules, header]);
      } else if (header) {
        const decls = {};
        for (const part of body.split(";")) {
          // Last colon wins: values can contain colons (url(), data: URIs).
          const c = part.lastIndexOf(":");
          if (c < 0) continue;
          const k = part.slice(0, c).trim();
          const v = part.slice(c + 1).trim();
          if (k.startsWith("--")) decls[k] = v;
        }
        blocks.push({ selector: header, decls, atRules });
      }
      i = j + 1;
    }
  };
  walk(src, []);
  return blocks;
}

const blocks = cssFiles
  .flatMap((f) => parseBlocks(readFileSync(f, "utf8")))
  .filter((b) => Object.keys(b.decls).length > 0);

/**
 * Build one scope per theme.
 *
 * Rules:
 *  - :root primitives are the base layer.
 *  - Selector lists containing the theme class override the base.
 *  - `@media print`, `@media (forced-colors)`, and `@media (prefers-contrast)`
 *    blocks are NOT part of the screen theme scope — merging them would let
 *    print colors leak into the default theme.
 */
const EXCLUDED_AT_RULES = [
  /@media\s+print/i,
  /@media\s*\(\s*forced-colors/i,
  /@media\s*\(\s*prefers-contrast/i,
  /@media\s*\(\s*prefers-color-scheme/i,
];

function buildScope(themeSelector) {
  const scope = {};
  const matches = (selector, want) =>
    selector.split(",").some((s) => s.replace(/\s+/g, "") === want);
  for (const b of blocks) {
    if (b.atRules.some((r) => EXCLUDED_AT_RULES.some((re) => re.test(r)))) continue;
    const sel = b.selector.replace(/\s+/g, "");
    if (sel === ":root" || matches(b.selector, themeSelector)) {
      Object.assign(scope, b.decls);
    }
  }
  return scope;
}

const VAR_RE = /var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^()]*))?\)/gi;

/** Recursively substitute var() references until none remain. */
function expand(value, scope, depth = 0) {
  if (depth > 16 || typeof value !== "string" || !value) return "";
  if (!value.includes("var(--")) return value;
  const next = value.replace(VAR_RE, (full, name, fallback) => {
    const v = scope[name];
    return v === undefined ? (fallback ?? "") : v;
  });
  return next === value ? value : expand(next, scope, depth + 1);
}

function parseColor(input, scope = {}) {
  const c = expand(input, scope).trim();
  if (!c) return null;
  const hex = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = [...h].map((x) => x + x).join("");
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  }
  const rgb = c.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (rgb) return [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255];
  // color-mix(in srgb, <color> n%, transparent) — composite over mid grey so
  // the ratio against a light or dark surface stays conservative.
  const mix = c.match(/^color-mix\(\s*in\s+srgb,\s*([^,]+?)\s+([\d.]+)%/i);
  if (mix) {
    const base = parseColor(mix[1], scope);
    if (!base) return null;
    const a = Number(mix[2]) / 100;
    return base.map((v) => v * a + 0.5 * (1 - a));
  }
  return null;
}

function resolveColor(token, scope) {
  const raw = scope[token];
  if (raw === undefined) return null;
  return parseColor(raw, scope);
}

const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const relLum = (rgb) => {
  const [r, g, b] = rgb.map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const l1 = relLum(a);
  const l2 = relLum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

const scopes = { dark: buildScope(".dark"), light: buildScope(".light") };

/** [theme, label, fgToken, bgToken, minRatio] */
const PAIRS = [
  ["dark", "text / bg", "--fs-text", "--fs-bg", 4.5],
  ["dark", "text / surface", "--fs-text", "--fs-surface", 4.5],
  ["dark", "text / surface-2", "--fs-text", "--fs-surface-2", 4.5],
  ["dark", "text-secondary / surface", "--fs-text-secondary", "--fs-surface", 4.5],
  ["dark", "text-muted / surface", "--fs-text-muted", "--fs-surface", 4.5],
  ["dark", "text-muted / bg", "--fs-text-muted", "--fs-bg", 4.5],
  ["dark", "text-faint / surface", "--fs-text-faint", "--fs-surface", 3],
  ["dark", "text-faint / bg", "--fs-text-faint", "--fs-bg", 3],
  ["dark", "accent / bg", "--fs-accent", "--fs-bg", 4.5],
  ["dark", "accent / surface", "--fs-accent", "--fs-surface", 4.5],
  ["dark", "accent-2 / surface", "--fs-accent-2", "--fs-surface", 4.5],
  ["dark", "success / surface", "--fs-success-fg", "--fs-surface", 4.5],
  ["dark", "warning / surface", "--fs-warning-fg", "--fs-surface", 4.5],
  ["dark", "danger / surface", "--fs-danger-fg", "--fs-surface", 4.5],
  ["dark", "info / surface", "--fs-info-fg", "--fs-surface", 4.5],
  ["dark", "positive / surface", "--fs-positive-fg", "--fs-surface", 4.5],
  ["dark", "chart-1 / surface", "--fs-chart-1", "--fs-surface", 3],
  ["dark", "chart-2 / surface", "--fs-chart-2", "--fs-surface", 3],
  ["dark", "chart-3 / surface", "--fs-chart-3", "--fs-surface", 3],
  ["dark", "chart-4 / surface", "--fs-chart-4", "--fs-surface", 3],
  ["dark", "accent-contrast / accent", "--fs-text-on-accent", "--fs-accent", 4.5],
  ["light", "text / bg", "--fs-text", "--fs-bg", 4.5],
  ["light", "text / surface", "--fs-text", "--fs-surface", 4.5],
  ["light", "text / surface-2", "--fs-text", "--fs-surface-2", 4.5],
  ["light", "text-secondary / surface", "--fs-text-secondary", "--fs-surface", 4.5],
  ["light", "text-muted / surface", "--fs-text-muted", "--fs-surface", 4.5],
  ["light", "text-muted / bg", "--fs-text-muted", "--fs-bg", 4.5],
  ["light", "text-faint / surface", "--fs-text-faint", "--fs-surface", 3],
  ["light", "text-faint / bg", "--fs-text-faint", "--fs-bg", 3],
  ["light", "accent / bg", "--fs-accent", "--fs-bg", 4.5],
  ["light", "accent / surface", "--fs-accent", "--fs-surface", 4.5],
  ["light", "accent-2 / surface", "--fs-accent-2", "--fs-surface", 4.5],
  ["light", "success / surface", "--fs-success-fg", "--fs-surface", 4.5],
  ["light", "warning / surface", "--fs-warning-fg", "--fs-surface", 4.5],
  ["light", "danger / surface", "--fs-danger-fg", "--fs-surface", 4.5],
  ["light", "info / surface", "--fs-info-fg", "--fs-surface", 4.5],
  ["light", "positive / surface", "--fs-positive-fg", "--fs-surface", 4.5],
  ["light", "chart-1 / surface", "--fs-chart-1", "--fs-surface", 3],
  ["light", "chart-2 / surface", "--fs-chart-2", "--fs-surface", 3],
  ["light", "chart-3 / surface", "--fs-chart-3", "--fs-surface", 3],
  ["light", "chart-4 / surface", "--fs-chart-4", "--fs-surface", 3],
  ["light", "accent-contrast / accent", "--fs-text-on-accent", "--fs-accent", 4.5],
];

const failures = [];
const rows = [];
for (const [theme, label, fgTok, bgTok, min] of PAIRS) {
  const scope = scopes[theme];
  const fg = resolveColor(fgTok, scope);
  const bg = resolveColor(bgTok, scope);
  if (!fg || !bg) {
    failures.push(`${theme} ${label}: unresolved ${fgTok}=${scope[fgTok] ?? "?"} ${bgTok}=${scope[bgTok] ?? "?"}`);
    continue;
  }
  const ratio = contrast(fg, bg);
  const ok = ratio + 1e-9 >= min;
  if (!ok) failures.push(`${theme} ${label}: ${ratio.toFixed(2)} < ${min}`);
  rows.push({ theme, label, ratio, min, ok });
}

const width = Math.max(...rows.map((r) => r.label.length)) + 2;
let out = `\nFoundrySignal token contrast (WCAG 2.2)\n${"─".repeat(width + 34)}\n`;
for (const r of rows) {
  out += `${r.theme.padEnd(6)}${r.label.padEnd(width)}${r.ratio.toFixed(2).padStart(6)}:1  >= ${r.min.toFixed(1)}  ${r.ok ? "PASS" : "FAIL"}\n`;
}
out += `${"─".repeat(width + 34)}\n${rows.filter((r) => r.ok).length}/${rows.length} pass\n`;

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ rows, failures }, null, 2));
} else {
  console.log(out);
}

if (failures.length) {
  console.error("\nFAILURES:\n" + failures.map((f) => "  x " + f).join("\n"));
  process.exit(1);
}