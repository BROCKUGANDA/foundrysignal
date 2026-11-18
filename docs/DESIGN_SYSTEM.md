# FoundrySignal Design System

The shared application foundation for every FoundrySignal surface. Nothing in
`src/components/fs` imports from a route, and no route re-declares a colour,
surface recipe, spacing value or motion curve.

- **Live playground:** `/design-system` — every component, variant and state.
- **Contrast harness:** `npm run tokens:contrast` (42 pairs, WCAG 2.2).
- **Contract tests:** `bun test tests/design-system.test.ts` (65 assertions).
- **Full gate:** `npm run design:check`.

---

## 1. Architecture

```
src/
  styles/fs/
    tokens.css      primitive ramps — colour, type, space, radius, shadow,
                    gradient, motion, breakpoints, z-index. Theme-invariant.
    themes.css      semantic tokens for .dark / .light + contrast, forced-colors
                    and print variants. Components read ONLY this layer.
    base.css        document defaults, focus ring, surfaces, motion primitives,
                    reduced-motion neutralisation.
    index.css       entry point + the Tailwind v4 @theme bridge.
  components/fs/
    index.ts        the public barrel — the only import path consumers use.
    brand/          logo family, glyphs, Signal Prism, loader.
    ui/             base components with the full state contract.
    domain/         venture-intelligence components.
    theme.tsx       theme store, bootstrap script, toggles.
    design-system-view.tsx   the playground.
  lib/fs/
    motion.ts       durations, easings, variants, reduced-motion gate.
    utils.ts        formatting + accessibility-safe helpers.
public/brand/       editable SVG masters (the source of truth for every mark).
```

Dependency arrow points inward only:

```
routes → domain → ui → brand → tokens
```

A `ui` component never imports a `domain` component, and `brand` never imports
`ui`. That is what makes the system reusable instead of a themed application.

---

## 2. Why Tailwind v4 needed a token bridge

The repository shipped a Tailwind **v3** `tailwind.config.ts` alongside Tailwind
**v4**. v4 ignores a JS config unless `@config` is present — it was not — so the
file was dead code. Every shadcn primitive in `src/components/ui` referenced
`bg-primary`, `text-foreground`, `border-input`, and none of those utilities were
ever generated. Those components rendered unstyled.

The fix is the v4-native path: tokens are defined as CSS custom properties and
mapped into Tailwind with `@theme inline` in `styles/fs/index.css`. Utilities
like `bg-surface`, `text-ink-muted` and `border-hairline` now resolve through
the semantic layer, so they re-colour themselves when the theme flips. The
shadcn compatibility block at the bottom of the `@theme` maps `--color-primary`,
`--color-border` etc. onto the same tokens, so the retained shadcn set inherits
the FoundrySignal palette instead of carrying its own neutral one.

---

## 3. Token layers

**Primitives** (`tokens.css`) are theme-invariant: six colour ramps (mint,
blue, obsidian, porcelain, amber, coral, green, violet), a 1.2-ish type scale,
a 4px spacing scale, radius, border widths, shadow recipes, gradients, motion
durations and easings, breakpoints, containers and a z-index scale.

**Semantics** (`themes.css`) are what components use. Representative groups:

| Group | Tokens |
| --- | --- |
| Surfaces | `--fs-bg`, `--fs-bg-deep`, `--fs-bg-sunken`, `--fs-surface` … `--fs-surface-4`, `--fs-surface-glass`, `--fs-overlay` |
| Text | `--fs-text`, `--fs-text-secondary`, `--fs-text-muted`, `--fs-text-faint`, `--fs-text-on-accent`, `--fs-text-disabled` |
| Borders | `--fs-border`, `--fs-border-subtle`, `--fs-border-strong`, `--fs-border-emphasis` |
| Accent | `--fs-accent`, `--fs-accent-hover`, `--fs-accent-subtle`, `--fs-accent-border`, `--fs-accent-fg`, `--fs-accent-contrast`, `--fs-accent-2*` |
| States | `--fs-success*`, `--fs-warning*`, `--fs-danger*`, `--fs-info*`, `--fs-positive*`, `--fs-neutral*` (each with `-fg`, `-bg`, `-border`) |
| Focus | `--fs-focus-ring`, `--fs-focus-halo`, `--fs-focus-ring-offset-color` |
| Elevation | `--fs-elevation-0` … `--fs-elevation-4`, `--fs-elevation-hairline` |
| Data viz | `--fs-chart-1` … `--fs-chart-6`, `--fs-chart-grid`, `--fs-chart-axis` |

Both themes are complete: the test suite asserts that **every** token defined
in `.dark` also exists in `.light`. A missing light token is invisible in a
dark-only review and renders as a light-mode surface with dark text — exactly
the bug class the parity test exists to catch.

Three additional variants layer on top: `[data-contrast="high"]`,
`@media (prefers-contrast: more)`, and `@media (forced-colors: active)` for
Windows High Contrast. Print flattens the palette to black-on-white and removes
elevation.

---

## 4. Theming

Prior state was contradictory and broken: `providers.tsx` set
`forcedTheme="dark"`, `layout.tsx` hard-coded `className="dark"`, and
`theme-bridge.tsx` tried to swap classes from a Zustand store. `forcedTheme`
won, so **the light theme could never take effect**.

The replacement:

- `mode` is the user's choice — `dark`, `light`, or `system`.
- `resolved` is what is applied, derived from `mode` plus the OS preference.
- State lives in one external store read through `useSyncExternalStore`, so two
  mounted toggles (header + mobile drawer) can never disagree.
- `THEME_BOOTSTRAP` is a dependency-free inline script injected in `<head>`; it
  applies the class **before first paint**, so there is no flash.
- Persistence is `localStorage` plus a cookie mirror, so the server can render
  the right class on the next request.
- `system` mode keeps listening to `prefers-color-scheme` and updates live.
- `<meta name="theme-color">` follows the resolved theme, so mobile browser
  chrome matches the surface.

Motion has a parallel, independent switch (`MotionToggle`). A user may want OS
animation in other applications and a static interface here.

---

## 5. Brand system

All marks are original vector artwork with editable masters in `public/brand/`:

| Asset | Master | React component |
| --- | --- | --- |
| Emblem | `emblem.svg` | `LogoEmblem` |
| Monochrome emblem | `emblem-mono.svg` | `LogoEmblem mono` |
| Wordmark | — (set in Space Grotesk) | `LogoWordmark` |
| Horizontal lockup | `logo-horizontal.svg` | `LogoLockup` |
| Stacked lockup | `logo-stacked.svg` | `LogoStacked` |
| Application glyph | `app-glyph.svg` | `BrandMark` |
| Favicon | `favicon.svg` | — |
| PWA / Apple touch | — | generated by `npm run icons` |

The emblem is a geometric "F" whose arms resolve into a signal node, with three
paths converging on it: many observations, one signal. The construction grid is
documented in the SVG comment (32px grid, spine at x6, node at 24/21.6).

`npm run icons` renders the PNG set (192, 512, maskable 512, Apple 180) from the
masters via sharp. The maskable variant keeps the mark inside the central 80%
safe zone. PNGs are build artefacts — never hand-edited.

**Glyphs.** Two families on one 24px grid with 1.6px strokes:

- 16 **domain glyphs** — founder, venture, development, repository, product,
  evidence, attestation, onchain, market, liquidity, risk, research, token,
  claim, watchlist, report.
- 17 **interface glyphs** — menu, close, search, chevrons, externalLink, copy,
  check, refresh, plus, trash, info, settings, sun, moon, signOut, bell.

Interface glyphs are drawn here rather than imported from Lucide because a
1.5–2px variable-stroke stock set visibly seams against a fixed 1.6px custom
set in dense UI. Both families are decorative by default (`aria-hidden`) and
promote to `role="img"` only when given a `label`.

**Signal Prism.** Three capability tiers, detected at runtime:

1. **WebGL** — React Three Fiber scene: a tube-geometry prism of signal paths
   converging on an emissive node, with an orbiting datum ring. Lazily loaded
   (~200 kB) and only ever a brand object.
2. **Canvas 2D** — the same 3D geometry through a perspective divide, for
   devices without a usable WebGL context.
3. **Static** — the SVG emblem plate. Also the SSR output and the no-JS output.

Detection probes `webgl2` then `webgl`, releasing the probe context immediately
(the browser caps live contexts). Any failure lands on a lower tier; nothing in
the product depends on the prism.

Performance: `frameloop="demand"` with explicit invalidation, DPR clamped to 2,
no textures or post-processing, pause on `document.hidden`, geometry disposed on
unmount. Under reduced motion the scene renders one static frame at a fixed
angle.

**Loader.** `ConvergenceLoader` renders the product narrative: scattered signal
ticks converging into the node. `BootSplash` is the first-paint surface;
`BrandTransition` is a one-shot accent wipe between major surfaces;
`BrandSpinner` is the inline variant. All degrade to a static mark.

---

## 6. Component library

### Base components (`ui/`)

Buttons, inputs, textareas, selects, checkboxes, switches, radio groups,
segmented controls, tables, pagination, dialogs, drawers, tooltips, tabs,
toasts, skeletons and the state library.

Every component implements the same state contract where the state is
meaningful:

| State | Mechanism |
| --- | --- |
| default | resting tokens |
| hover | `--fs-accent-hover` / surface shift + elevation (pointer only) |
| focus | 2px outline + halo, **`:focus-visible` only** — never on click |
| active | 0.975 scale (transform only, no layout shift) |
| disabled | real `disabled`, pointer-events none, muted fg |
| loading | `aria-busy`, spinner replaces icon, activation blocked, label still announced |
| error | `aria-invalid` + danger border + danger ring |
| readonly | inset tint, still focusable |
| empty / partial / stale / offline / forbidden / degraded | dedicated state components |

Buttons with `loading` genuinely block activation, so a double-submit is
impossible from the keyboard as well as the pointer.

### State library (`ui/states.tsx`)

A discriminated union drives every async surface:

```ts
type ViewState =
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
```

`StateView` switches over it; the test suite asserts every member has a `case`,
so a surface cannot render nothing. `LoadingState` mirrors the eventual layout
so data arrival does not reflow, and supports `escalateAfter` so a request that
never resolves says so instead of spinning silently.

`ForbiddenState` is deliberately distinct from `ErrorState`: the request was
valid, the account simply lacks the role. Copy says so rather than implying a
bug.

### Domain components (`domain/`)

| Component | Encodes |
| --- | --- |
| `VentureCard` | whole-card hit target; four verified counts; "—" when unknown, never 0 |
| `FounderCard` | attribution class per founder; identity links carry their own confidence |
| `EvidenceCard` | provenance verbatim: provider, collector version, sha256, expandable payload |
| `RepositoryPanel` | contributor roles kept distinct; bots labelled as bots |
| `SignalTimeline` | newest-first change feed with per-entry provenance |
| `EvidenceGraph` | deterministic radial layout; contradiction edges dashed red |
| `FounderGraph` | bipartite people→ventures; edge style encodes attribution confidence |
| `MarketChart` family | dependency-free SVG; `<2` points is an explicit message, not a flat line |
| `TokenCard` | structure and market in **separate** blocks — supply is not value |
| `ResearchComposer` | states the grounding contract; enforces the API's length cap |
| `ResearchReport` | uncited statements are marked; validation status never hidden |
| `TradePanel` | cannot execute unless the server-side gate is open |

Two product rules are structurally enforced rather than left to copy:

1. **The trade panel cannot execute when the gate is closed.** The button is
   genuinely disabled and the panel lists which conditions are unmet.
2. **The report marks uncited statements.** A citation id with no backing
   record renders as `uncited`, not as a plausible-looking reference.

---

## 7. Motion

Three layers:

- **Tokens** — `--fs-duration-{micro,fast,base,slow,slower,reveal,ambient}` and
  `--fs-ease-{out,inOut,spring,standard,decelerate,accelerate}`.
- **Variants** — `src/lib/fs/motion.ts` exports named JS variants *and* CSS
  class names, so an orchestrated entrance and a CSS-only entrance share one
  definition.
- **Gate** — `useMotionOK()` returns false when either the OS preference or the
  in-app opt-out is set, and listens for changes to both.

Rules: motion is never load-bearing; only `transform`, `opacity` and
`stroke-dashoffset` animate (compositor-friendly); every variant has an instant
`reduce` twin. Under `prefers-reduced-motion` the base layer zeroes all
durations, hides the scan-line and live-dot, and disables the shimmer.

**Micro-interactions:** press scale, hover lift, focus ring, link underline.
**Macro-transitions:** surface entrance, dialog/drawer slide+fade, brand wipe.
**Environmental motion:** the grain overlay, blueprint grid, prism rotation,
scan-line on working collectors, live-dot on live data.

---

## 8. Accessibility

- **Contrast** — 42 foreground/background pairs verified at ≥4.5:1 (body text)
  and ≥3:1 (large text, UI boundaries, chart series) in both themes, by
  `scripts/verify-token-contrast.mjs`. Wired into `bun test`.
- **Focus** — a single two-layer ring (solid outline for forced-colors, halo for
  both themes), `:focus-visible` only. Never removed, never `outline: none`.
- **Keyboard** — tabs implement the WAI-ARIA manual-activation pattern (arrow
  keys move focus, Enter/Space activates) because auto-activation would fetch
  every tab the user scrolls past. Graph nodes are real buttons in a positioned
  overlay, so they are reachable and ordered with the document.
- **Screen readers** — `role="status"` + `aria-busy` for loading,
  `role="alert"` for errors, `aria-live` for theme changes, and a visually
  hidden data table mirroring every chart (`ChartDataTable`).
- **Colour independence** — every badge tone pairs with a dot or a label
  (`aria-label`/text), so status is never conveyed by hue alone (WCAG 1.4.1).
- **Touch targets** — `.fs-touch` guarantees 44px; controls honour it.
- **Responsive graphs** — below ~560px the radial evidence graph becomes a list.
  Shrinking a radial layout to phone width pushes labels under 11px, which is a
  WCAG failure, so the component changes representation instead.
- **Forced colors** — borders map to `CanvasText`, skeletons to `GrayText`,
  animations disabled.
- **Zoom / reflow** — no fixed pixel heights on text containers; the layout
  reflows to 320px.

---

## 9. Playground

`/design-system` renders every section: brand (all marks, both glyph families,
all three prism tiers, the loader), tokens (surfaces, text, states, chart series,
radius, elevation, spacing), typography scale, buttons (6 variants × 4 sizes ×
disabled × loading), badges (all tones + all verification/claim classes),
forms (every control incl. invalid/disabled/indeterminate), surfaces (5
variants + interactive + structured), tables + pagination, overlays (dialog,
drawer, tooltip, tabs), the full state matrix, all 12 domain components with
realistic data, both graphs, the chart family, and motion + theme controls.

It is the visual-regression target and the acceptance surface: if a state
cannot be reached there, it is not part of the system.

---

## 10. Verification

```bash
npm run typecheck        # tsc --noEmit, zero errors
npm run tokens:contrast  # 42/42 WCAG pairs pass
npm run icons            # regenerate PNG icon set from SVG masters
npm run design:check     # typecheck + contrast
bun test                 # includes 65 design-system contract assertions
npm run lint
```

`tests/design-system.test.ts` guards:

1. Theme token parity (dark ⊂ light).
2. No literal hex colours in any component.
3. `"use client"` present on every stateful module.
4. Every `ViewState` variant declared **and** handled by `StateView`.
5. The barrel exports every component the directive names.
6. Brand assets are real SVG (no embedded raster).
7. Reduced-motion neutralisation exists and covers the in-app opt-out.
8. The 42-pair contrast run exits zero.
9. The theme bootstrap replaces the removed `forcedTheme`.
10. The prism degrades through three tiers and loads WebGL lazily.

---

## 11. Consuming the system

```tsx
import {
  Button, Card, Badge, VentureCard, EmptyState,
  LoadingState, ErrorState, SectionShell, toast, timeAgo,
} from "@/components/fs";
```

Rules for route code:

- Import from the barrel, never a deep `ui/` or `domain/` path.
- Never write a hex colour; use a token or a Tailwind utility backed by one.
- Inline `style` is reserved for computed values (`width: ${pct}%`).
- Render exactly one state per async region; do not invent local loading markup.
- Buttons that mutate must use `loading`; do not hand-roll a spinner.

---

## 12. Known gaps

- **Storybook was not added.** The playground at `/design-system` covers every
  variant and state and serves the same purpose without another build target and
  a second dependency tree. If isolated component development becomes a
  requirement, the components are already story-shaped (typed props, no route
  coupling) and can be lifted directly.
- **Visual regression is snapshot-free.** There is no committed pixel baseline;
  `/design-system` is the target for whatever visual-diff tool is adopted.
  Adding Playwright + a baseline set is the natural next step.
- **Cross-browser styling is verified by construction, not by a matrix run.**
  The system relies on widely supported features (`color-mix`, `:focus-visible`,
  `backdrop-filter`, custom properties). `backdrop-filter` degrades to a solid
  surface, which is why `--fs-surface-glass` carries sufficient alpha to stay
  legible without it.
- **Prism WebGL is untested on low-end mobile hardware.** The fallback chain is
  real and the scene is cheap, but the `canvas2d` tier is what those devices
  will actually exercise.
