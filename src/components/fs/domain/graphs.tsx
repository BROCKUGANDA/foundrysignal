"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Glyph, type GlyphName } from "@/components/fs/brand/glyphs";
import { useMotionOK } from "@/lib/fs/motion";

/**
 * Graph rendering — EvidenceGraph and FounderGraph.
 *
 * Both share one deterministic layout engine so nodes never jitter between
 * renders (no Math.random, no physics simulation). Deterministic layout
 * matters for a research product: the same dossier must produce the same
 * picture, so two analysts can compare notes.
 *
 * Layout: radial. The venture sits at the centre; evidence nodes distribute on
 * up to two rings, alternating radius to keep labels legible. Ring assignment
 * is by node kind, so an EVIDENCE node never drifts into the FOUNDER band.
 *
 * Responsiveness: the SVG uses a fixed viewBox and scales with `width="100%"`,
 * so the graph reflows without recomputing geometry. Below `compactBelow` the
 * component switches to a list rendering — a scaled-down radial graph becomes
 * unreadable at phone widths, and shrinking text would fail WCAG.
 *
 * Accessibility:
 *  - `role="group"` with an aria-label naming the graph and node count
 *  - nodes are real `<button>` elements in an overlay layer, positioned by
 *    percentage so they remain keyboard reachable and screen-reader ordered
 *  - a `<figcaption>`/`<p>` summary states the relationship counts
 *  - `prefers-reduced-motion` disables the edge draw-on animation
 *
 * Interaction:
 *  - hover/focus on a node highlights its incident edges and dims the rest
 *  - Enter/Space selects; selection is lifted to the parent via onSelect
 */

export type GraphNodeKind =
  | "VENTURE"
  | "FOUNDER"
  | "REPOSITORY"
  | "CLAIM"
  | "EVIDENCE"
  | "TOKEN";

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  /** Verification / attribution class; rendered as a badge when present. */
  verification?: string;
  /** Optional secondary line (e.g. repo owner/name). */
  sublabel?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  /** SUPPORTS | CONTRADICTS | ATTRIBUTED | ASSOCIATED | ISSUES | ... */
  relation: string;
  label?: string;
}

const NODE_META: Record<
  GraphNodeKind,
  { glyph: GlyphName; color: string; size: number; ring: number }
> = {
  VENTURE: { glyph: "venture", color: "var(--fs-accent)", size: 34, ring: 0 },
  FOUNDER: { glyph: "founder", color: "var(--fs-chart-2)", size: 26, ring: 1 },
  REPOSITORY: { glyph: "repository", color: "var(--fs-chart-3)", size: 26, ring: 1 },
  TOKEN: { glyph: "onchain", color: "var(--fs-chart-6)", size: 24, ring: 1 },
  CLAIM: { glyph: "attestation", color: "var(--fs-chart-4)", size: 24, ring: 2 },
  EVIDENCE: { glyph: "evidence", color: "var(--fs-chart-5)", size: 20, ring: 2 },
};

const VIEW = { w: 640, h: 420 };
const CENTER = { x: VIEW.w / 2, y: VIEW.h / 2 };

interface PlacedNode {
  node: GraphNode;
  x: number;
  y: number;
  ring: number;
}

/**
 * Deterministic radial placement.
 * Nodes are grouped by ring; within a ring they are ordered by id so the
 * layout is stable regardless of the order the API returned them in.
 */
function layout(nodes: GraphNode[]): PlacedNode[] {
  const center = nodes.find((n) => n.kind === "VENTURE");
  const others = nodes.filter((n) => n !== center);
  const placed: PlacedNode[] = center ? [{ node: center, x: CENTER.x, y: CENTER.y, ring: 0 }] : [];

  for (const ring of [1, 2]) {
    const inRing = others
      .filter((n) => NODE_META[n.kind].ring === ring)
      .sort((a, b) => a.id.localeCompare(b.id));
    const radiusX = ring === 1 ? 190 : 285;
    const radiusY = ring === 1 ? 128 : 180;

    inRing.forEach((node, i) => {
      // Start at -90° and distribute; odd counts get a half-step offset so
      // nodes never stack on the vertical axis.
      const angle = (i / inRing.length) * Math.PI * 2 - Math.PI / 2;
      placed.push({
        node,
        x: CENTER.x + Math.cos(angle) * radiusX,
        y: CENTER.y + Math.sin(angle) * radiusY,
        ring,
      });
    });
  }

  return placed;
}

/* ─── Shared frame ──────────────────────────────────────────────────── */

function GraphFrame({
  children,
  summary,
  className,
  height,
}: {
  children: React.ReactNode;
  summary: string;
  className?: string;
  height?: number;
}) {
  return (
    <figure
      className={cn("fs-panel relative m-0 overflow-hidden p-2", className)}
      style={height ? { height } : undefined}
      data-slot="graph-frame"
    >
      {children}
      <figcaption className="fs-sr-only">{summary}</figcaption>
    </figure>
  );
}

/** Empty-graph placeholder. Never a blank panel. */
function GraphEmpty({ label, hint }: { label: string; hint?: string }) {
  return (
    <div
      className="flex h-56 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-[var(--fs-border-strong)] text-center"
      data-slot="graph-empty"
    >
      <span aria-hidden="true" className="text-ink-faint">
        <Glyph name="evidence" size={22} />
      </span>
      <p className="text-xs font-medium text-ink">{label}</p>
      {hint ? <p className="max-w-xs px-4 text-2xs text-ink-faint">{hint}</p> : null}
    </div>
  );
}

/* ─── EvidenceGraph ─────────────────────────────────────────────────── */

export interface EvidenceGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onSelect?: (id: string) => void;
  selectedId?: string | null;
  className?: string;
  /** Viewport width (px) below which the graph renders as a list. */
  compactBelow?: number;
  height?: number;
  /** Caption rendered visibly under the graph. */
  showLegend?: boolean;
}

const RELATION_LABEL: Record<string, string> = {
  SUPPORTS: "supports",
  CONTRADICTS: "contradicts",
  ATTRIBUTED: "attributed to",
  ASSOCIATED: "associated with",
  ISSUES: "issues",
  REFERENCES: "references",
};

export function EvidenceGraph({
  nodes,
  edges,
  onSelect,
  selectedId,
  className,
  compactBelow = 560,
  height = 420,
  showLegend = true,
}: EvidenceGraphProps) {
  const ok = useMotionOK();
  const [hovered, setHovered] = React.useState<string | null>(null);
  const [compact, setCompact] = React.useState(false);
  const frameRef = React.useRef<HTMLDivElement>(null);

  // Width-driven mode switch: a radial graph under ~560px has labels that
  // collide, so it becomes a list instead of shrinking type below 11px.
  React.useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setCompact(w > 0 && w < compactBelow);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [compactBelow]);

  if (nodes.length === 0) {
    return (
      <GraphFrame
        className={className}
        summary="Evidence graph: no nodes recorded."
      >
        <GraphEmpty
          label="No evidence relationships yet"
          hint="Relationships appear once collection succeeds. FoundrySignal never draws edges it has not observed."
        />
      </GraphFrame>
    );
  }

  const placed = layout(nodes);
  const posById = new Map(placed.map((p) => [p.node.id, p]));
  const activeId = hovered ?? selectedId ?? null;
  const activeEdges = activeId
    ? edges.filter((e) => e.from === activeId || e.to === activeId)
    : [];
  const activeEdgeKeys = new Set(activeEdges.map((e) => `${e.from}->${e.to}`));

  const summary = `Evidence graph with ${nodes.length} nodes and ${edges.length} relationships. ${edges
    .slice(0, 8)
    .map((e) => `${e.from} ${RELATION_LABEL[e.relation] ?? e.relation.toLowerCase()} ${e.to}`)
    .join("; ")}`;

  /* Compact rendering — accessible list of relationships. */
  if (compact) {
    return (
      <GraphFrame className={className} summary={summary}>
        <div ref={frameRef} className="fs-scroll max-h-96 overflow-y-auto p-2">
          <ul className="flex flex-col gap-1.5">
            {nodes.map((n) => {
              const meta = NODE_META[n.kind];
              const incident = edges.filter((e) => e.from === n.id || e.to === n.id);
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => onSelect?.(n.id)}
                    disabled={!onSelect}
                    className={cn(
                      "fs-press flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left",
                      "transition-colors duration-fast ease-out",
                      selectedId === n.id
                        ? "border-[var(--fs-accent-border)] bg-[var(--fs-accent-subtle)]"
                        : "border-[var(--fs-border)] hover:bg-surface-2",
                      !onSelect && "cursor-default",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="mt-0.5 shrink-0"
                      style={{ color: meta.color }}
                    >
                      <Glyph name={meta.glyph} size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-ink">{n.label}</span>
                      <span className="fs-data block text-2xs text-ink-faint">
                        {n.kind.toLowerCase()}
                        {incident.length > 0
                          ? ` · ${incident
                              .map(
                                (e) =>
                                  `${RELATION_LABEL[e.relation] ?? e.relation.toLowerCase()} ${
                                    e.from === n.id ? e.to : e.from
                                  }`,
                              )
                              .slice(0, 3)
                              .join(", ")}`
                          : " · no relationships"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </GraphFrame>
    );
  }

  return (
    <GraphFrame className={className} summary={summary}>
      <div ref={frameRef} className="relative w-full" style={{ height }}>
        <svg
          viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
          width="100%"
          height="100%"
          role="group"
          aria-label={summary}
          className="absolute inset-0"
        >
          {/* Edges */}
          <g>
            {edges.map((e, i) => {
              const a = posById.get(e.from);
              const b = posById.get(e.to);
              if (!a || !b) return null;
              const contradicts = e.relation === "CONTRADICTS";
              const dimmed = activeId !== null && !activeEdgeKeys.has(`${e.from}->${e.to}`);
              const key = `${e.from}->${e.to}`;
              return (
                <line
                  key={`${key}-${i}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={contradicts ? "var(--fs-danger)" : "var(--fs-border-emphasis)"}
                  strokeWidth={contradicts ? 1.8 : 1.2}
                  strokeDasharray={contradicts ? "5 4" : undefined}
                  opacity={dimmed ? 0.18 : 1}
                  style={{
                    transition: ok ? "opacity 130ms cubic-bezier(0.22,1,0.36,1)" : undefined,
                  }}
                />
              );
            })}
          </g>

          {/* Node bodies */}
          {placed.map(({ node, x, y, ring }) => {
            const meta = NODE_META[node.kind];
            const half = meta.size / 2;
            const isSelected = selectedId === node.id;
            const isHovered = hovered === node.id;
            const dimmed = activeId !== null && activeId !== node.id && !activeEdges.some(
              (e) => e.from === node.id || e.to === node.id,
            );

            return (
              <g
                key={node.id}
                transform={`translate(${x} ${y})`}
                opacity={dimmed ? 0.35 : 1}
                style={{
                  transition: ok ? "opacity 130ms cubic-bezier(0.22,1,0.36,1)" : undefined,
                }}
                pointerEvents="none"
              >
                {ring === 0 ? (
                  <circle r={half + 10} fill="none" stroke={meta.color} strokeWidth="1" opacity="0.28" />
                ) : null}
                {(isSelected || isHovered) && (
                  <rect
                    x={-half - 4}
                    y={-half - 4}
                    width={meta.size + 8}
                    height={meta.size + 8}
                    rx={10}
                    fill="none"
                    stroke={meta.color}
                    strokeWidth="1.6"
                    opacity="0.55"
                  />
                )}
                <rect
                  x={-half}
                  y={-half}
                  width={meta.size}
                  height={meta.size}
                  rx={8}
                  fill="var(--fs-surface-2)"
                  stroke={meta.color}
                  strokeWidth="1.5"
                />
                <g transform={`translate(${-half + 5} ${-half + 5})`} style={{ color: meta.color }}>
                  <Glyph name={meta.glyph} size={meta.size - 10} />
                </g>
                <text
                  y={half + 13}
                  textAnchor="middle"
                  fontSize={ring === 0 ? 11 : 9.5}
                  fill="var(--fs-text-muted)"
                  style={{ fontFamily: "var(--fs-font-mono)" }}
                >
                  {node.label.length > 22 ? `${node.label.slice(0, 21)}…` : node.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Keyboard-reachable node overlay. Percent positioning keeps it in
            sync with the viewBox at any container width. */}
        <div className="absolute inset-0">
          {placed.map(({ node, x, y }) => {
            const meta = NODE_META[node.kind];
            return (
              <button
                key={node.id}
                type="button"
                onClick={() => onSelect?.(node.id)}
                onPointerEnter={() => setHovered(node.id)}
                onPointerLeave={() => setHovered((h) => (h === node.id ? null : h))}
                onFocus={() => setHovered(node.id)}
                onBlur={() => setHovered((h) => (h === node.id ? null : h))}
                aria-pressed={selectedId === node.id}
                disabled={!onSelect}
                className={cn(
                  "absolute -translate-x-1/2 -translate-y-1/2 rounded-lg",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus-ring)]",
                  onSelect ? "cursor-pointer" : "cursor-default",
                )}
                style={{
                  left: `${(x / VIEW.w) * 100}%`,
                  top: `${(y / VIEW.h) * 100}%`,
                  width: meta.size,
                  height: meta.size,
                }}
              >
                <span className="fs-sr-only">
                  {node.kind.toLowerCase()}: {node.label}
                  {node.verification ? ` (${node.verification})` : ""}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {showLegend ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--fs-border)] px-2 py-2">
          {(Object.keys(NODE_META) as GraphNodeKind[])
            .filter((k) => nodes.some((n) => n.kind === k))
            .map((k) => (
              <span key={k} className="flex items-center gap-1.5 text-2xs text-ink-muted">
                <span aria-hidden="true" style={{ color: NODE_META[k].color }}>
                  <Glyph name={NODE_META[k].glyph} size={11} />
                </span>
                {k.toLowerCase()}
              </span>
            ))}
          {edges.some((e) => e.relation === "CONTRADICTS") ? (
            <span className="flex items-center gap-1.5 text-2xs text-ink-muted">
              <span
                aria-hidden="true"
                className="inline-block h-px w-4 border-t border-dashed border-[var(--fs-danger)]"
              />
              contradiction
            </span>
          ) : null}
        </div>
      ) : null}
    </GraphFrame>
  );
}

/* ─── FounderGraph ──────────────────────────────────────────────────── */

/**
 * FounderGraph — attribution relationships across founders and ventures.
 *
 * Semantically distinct from EvidenceGraph: edges here are *attribution*
 * claims (who is a founder of what), each carrying its own confidence, so the
 * graph answers "who is connected to whom, and how sure are we".
 *
 * Rendered as a bipartite two-column layout rather than radial: founders on
 * the left, ventures on the right, because the question a reader brings is
 * "what else has this person built?" and a radial layout buries that.
 */
export interface FounderGraphNode {
  id: string;
  label: string;
  /** PERSON or VENTURE. */
  type: "PERSON" | "VENTURE";
  sublabel?: string;
}

export interface FounderGraphEdge {
  from: string;
  to: string;
  /** Attribution class for this specific link. */
  confidence: string;
  role?: string | null;
}

export interface FounderGraphProps {
  nodes: FounderGraphNode[];
  edges: FounderGraphEdge[];
  onSelect?: (id: string) => void;
  selectedId?: string | null;
  className?: string;
}

export function FounderGraph({
  nodes,
  edges,
  onSelect,
  selectedId,
  className,
}: FounderGraphProps) {
  const ok = useMotionOK();
  const [hovered, setHovered] = React.useState<string | null>(null);

  const people = nodes.filter((n) => n.type === "PERSON");
  const ventures = nodes.filter((n) => n.type === "VENTURE");

  if (nodes.length === 0) {
    return (
      <GraphFrame className={className} summary="Founder graph: no attribution recorded.">
        <GraphEmpty
          label="No founder attribution recorded"
          hint="FoundrySignal never infers founders from commits or wallet activity. Attribution is recorded explicitly and stays self-asserted until evidence supports it."
        />
      </GraphFrame>
    );
  }

  const activeId = hovered ?? selectedId ?? null;

  // Column geometry — fixed viewBox, scaled by the SVG.
  const COL = { w: 320, pad: 16, rowH: 64, topPad: 28 };
  const height = Math.max(people.length, ventures.length) * COL.rowH + COL.topPad * 2;
  const leftX = COL.pad + 120;
  const rightX = COL.w - COL.pad - 120;

  const personY = (i: number) => COL.topPad + i * COL.rowH + COL.rowH / 2;
  const ventureY = (i: number) => COL.topPad + i * COL.rowH + COL.rowH / 2;

  const personIndex = new Map(people.map((p, i) => [p.id, i]));
  const ventureIndex = new Map(ventures.map((v, i) => [v.id, i]));

  const summary = `Founder attribution graph: ${people.length} people, ${ventures.length} ventures, ${edges.length} attribution links.`;

  return (
    <GraphFrame className={className} summary={summary}>
      <div className="fs-scroll overflow-x-auto">
        <svg
          viewBox={`0 0 ${COL.w} ${height}`}
          width="100%"
          style={{ minWidth: 280, height }}
          role="group"
          aria-label={summary}
        >
          {/* Column headers */}
          <text x={leftX} y={16} textAnchor="middle" fontSize="9" fill="var(--fs-chart-axis)" style={{ fontFamily: "var(--fs-font-mono)" }}>
            PEOPLE
          </text>
          <text x={rightX} y={16} textAnchor="middle" fontSize="9" fill="var(--fs-chart-axis)" style={{ fontFamily: "var(--fs-font-mono)" }}>
            VENTURES
          </text>

          {/* Edges — cubic Béziers read better than straight lines here. */}
          {edges.map((e, i) => {
            const pi = personIndex.get(e.from);
            const vi = ventureIndex.get(e.to);
            if (pi === undefined || vi === undefined) return null;
            const x1 = leftX + 52;
            const y1 = personY(pi);
            const x2 = rightX - 52;
            const y2 = ventureY(vi);
            const mid = (x1 + x2) / 2;
            const dimmed = activeId !== null && activeId !== e.from && activeId !== e.to;
            return (
              <path
                key={`${e.from}-${e.to}-${i}`}
                d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`}
                fill="none"
                stroke={e.confidence === "SELF_ASSERTED" ? "var(--fs-border-emphasis)" : "var(--fs-accent)"}
                strokeWidth="1.4"
                strokeDasharray={e.confidence === "SELF_ASSERTED" ? "4 3" : undefined}
                opacity={dimmed ? 0.16 : 0.85}
                style={{ transition: ok ? "opacity 130ms cubic-bezier(0.22,1,0.36,1)" : undefined }}
              />
            );
          })}

          {/* People */}
          {people.map((p, i) => {
            const selected = selectedId === p.id;
            return (
              <g key={p.id} transform={`translate(${leftX - 52} ${personY(i)})`}>
                <rect
                  x={-52}
                  y={-20}
                  width={104}
                  height={40}
                  rx={7}
                  fill={selected ? "var(--fs-accent-subtle)" : "var(--fs-surface-2)"}
                  stroke={selected ? "var(--fs-accent)" : "var(--fs-border)"}
                  strokeWidth="1.3"
                />
                <text
                  x={0}
                  y={-2}
                  textAnchor="middle"
                  fontSize="10"
                  fill="var(--fs-text)"
                  style={{ fontFamily: "var(--fs-font-sans)", fontWeight: 600 }}
                >
                  {p.label.length > 16 ? `${p.label.slice(0, 15)}…` : p.label}
                </text>
                <text
                  x={0}
                  y={10}
                  textAnchor="middle"
                  fontSize="8"
                  fill="var(--fs-text-faint)"
                  style={{ fontFamily: "var(--fs-font-mono)" }}
                >
                  {p.sublabel ?? "person"}
                </text>
              </g>
            );
          })}

          {/* Ventures */}
          {ventures.map((v, i) => {
            const selected = selectedId === v.id;
            return (
              <g key={v.id} transform={`translate(${rightX - 52} ${ventureY(i)})`}>
                <rect
                  x={-52}
                  y={-20}
                  width={104}
                  height={40}
                  rx={7}
                  fill={selected ? "var(--fs-accent-subtle)" : "var(--fs-surface-2)"}
                  stroke={selected ? "var(--fs-accent)" : "var(--fs-border)"}
                  strokeWidth="1.3"
                />
                <text
                  x={0}
                  y={-2}
                  textAnchor="middle"
                  fontSize="10"
                  fill="var(--fs-text)"
                  style={{ fontFamily: "var(--fs-font-sans)", fontWeight: 600 }}
                >
                  {v.label.length > 16 ? `${v.label.slice(0, 15)}…` : v.label}
                </text>
                <text
                  x={0}
                  y={10}
                  textAnchor="middle"
                  fontSize="8"
                  fill="var(--fs-text-faint)"
                  style={{ fontFamily: "var(--fs-font-mono)" }}
                >
                  {v.sublabel ?? "venture"}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Interactive layer — real buttons over the nodes. */}
      <div className="relative" style={{ height: 0 }}>
        {people.map((p) => {
          const meta = NODE_META.FOUNDER;
          return (
            <button
              key={p.id}
              type="button"
              disabled={!onSelect}
              onClick={() => onSelect?.(p.id)}
              onPointerEnter={() => setHovered(p.id)}
              onPointerLeave={() => setHovered((h) => (h === p.id ? null : h))}
              onFocus={() => setHovered(p.id)}
              onBlur={() => setHovered((h) => (h === p.id ? null : h))}
              aria-pressed={selectedId === p.id}
              className="fs-sr-only"
            >
              person: {p.label}
              <Glyph name={meta.glyph} size={10} />
            </button>
          );
        })}
        {ventures.map((v) => (
          <button
            key={v.id}
            type="button"
            disabled={!onSelect}
            onClick={() => onSelect?.(v.id)}
            aria-pressed={selectedId === v.id}
            className="fs-sr-only"
          >
            venture: {v.label}
          </button>
        ))}
      </div>

      {/* Edge legend with confidence classes */}
      <ul className="flex flex-wrap gap-x-3 gap-y-1 border-t border-[var(--fs-border)] px-2 py-2">
        <li className="flex items-center gap-1.5 text-2xs text-ink-muted">
          <span aria-hidden="true" className="inline-block h-px w-4 bg-[var(--fs-accent)]" />
          corroborated attribution
        </li>
        <li className="flex items-center gap-1.5 text-2xs text-ink-muted">
          <span
            aria-hidden="true"
            className="inline-block h-px w-4 border-t border-dashed border-[var(--fs-border-emphasis)]"
          />
          self-asserted attribution
        </li>
      </ul>
    </GraphFrame>
  );
}

/* ─── Shared exports ────────────────────────────────────────────────── */

export { NODE_META as GRAPH_NODE_META, RELATION_LABEL as GRAPH_RELATION_LABEL };
export type { PlacedNode as GraphPlacedNode };