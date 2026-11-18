"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { formatUsd } from "@/lib/fs/utils";
import { useMotionOK, transition } from "@/lib/fs/motion";

/**
 * Market chart system — dependency-free SVG.
 *
 * Why not recharts/visx: the charts here are small, single-series or
 * two-series, and must render identically in SSR and CSR with no hydration
 * drift. Hand-rolled SVG gives us exact control over the axis budget, the
 * empty-data path, and the theme tokens, and removes a 40 kB dependency from
 * a bundle that is already heavy.
 *
 * Components:
 *   Sparkline     dense inline trend, no axes — for cards and table rows
 *   LineChart     single series with axes, gridlines and a hover readout
 *   AreaChart     LineChart with a gradient fill under the curve
 *   BarSeries     categorical comparison
 *
 * State contract:
 *   default      data
 *   empty        <2 points → explicit "insufficient observations" (never a
 *                fabricated flat line)
 *   stale        `stale` prop renders an amber marker on the last point
 *   loading      caller renders <ChartSkeleton/> with the same box
 *   error        caller renders the state; the chart never throws
 *
 * Accessibility: each chart carries `role="img"` + a text alternative that
 * states the series name, point count, and the min/max range. A visually
 * hidden data table is available via `<ChartDataTable/>` for screen-reader
 * users who need exact values.
 */

function extent(values: number[]): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) return [min - 1, max + 1];
  return [min, max];
}

/** Catmull-Rom → cubic Bézier, so lines read as curves without overshooting. */
function smoothPath(points: Array<[number, number]>): string {
  if (points.length < 2) return "";
  if (points.length === 2) return `M${points[0][0]},${points[0][1]} L${points[1][0]},${points[1][1]}`;
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return d;
}

/* ─── Sparkline ─────────────────────────────────────────────────────── */

export interface SparklineProps {
  points: number[];
  width?: number;
  height?: number;
  color?: string;
  /** Text alternative; also states point count. */
  ariaLabel: string;
  /** Render the final point larger. */
  emphasiseEnd?: boolean;
  className?: string;
}

export function Sparkline({
  points,
  width = 220,
  height = 48,
  color = "var(--fs-chart-1)",
  ariaLabel,
  emphasiseEnd = true,
  className,
}: SparklineProps) {
  const gradientId = React.useId();
  const ok = useMotionOK();

  if (points.length < 2) {
    return (
      <div
        role="img"
        aria-label={`${ariaLabel}: insufficient observations (${points.length} point${points.length === 1 ? "" : "s"})`}
        className={cn("flex items-center justify-center rounded-sm bg-[var(--fs-shimmer-base)]", className)}
        style={{ width, height }}
      >
        <span className="px-2 text-center text-2xs text-ink-faint">
          {points.length === 0 ? "no observations" : "need ≥2 observations"}
        </span>
      </div>
    );
  }

  const [min, max] = extent(points);
  const span = max - min;
  const pad = 3;
  const stepX = (width - pad * 2) / (points.length - 1);
  const coords: Array<[number, number]> = points.map((p, i) => [
    pad + i * stepX,
    height - pad - ((p - min) / span) * (height - pad * 2),
  ]);

  const line = smoothPath(coords);
  const area = `${line} L${coords[coords.length - 1][0].toFixed(2)},${height} L${coords[0][0].toFixed(2)},${height} Z`;
  const last = coords[coords.length - 1];

  return (
    <svg
      role="img"
      aria-label={`${ariaLabel}: ${points.length} observations, range ${min.toFixed(4)} to ${max.toFixed(4)}`}
      width={width}
      height={height}
      className={className}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={ok ? { strokeDasharray: 600, animation: "fs-draw 900ms cubic-bezier(0.22,1,0.36,1) both", ["--fs-path-length" as string]: "600" } : undefined}
      />
      {emphasiseEnd ? (
        <>
          <circle cx={last[0]} cy={last[1]} r="4.5" fill={color} opacity="0.18" />
          <circle cx={last[0]} cy={last[1]} r="2.2" fill={color} />
        </>
      ) : null}
    </svg>
  );
}

/* ─── LineChart ─────────────────────────────────────────────────────── */

export interface SeriesPoint {
  /** ISO timestamp or a numeric x value. */
  x: string | number;
  y: number;
}

export interface Series {
  id: string;
  label: string;
  points: SeriesPoint[];
  color?: string;
}

export interface LineChartProps {
  series: Series[];
  height?: number;
  /** Show the y-axis scale on the left. */
  yAxis?: boolean;
  /** Show x-axis tick labels (first / middle / last). */
  xAxis?: boolean;
  /** Format a y value for the axis. */
  formatY?: (value: number) => string;
  /** Render an area fill under the first series. */
  area?: boolean;
  ariaLabel: string;
  className?: string;
  /** Marks the last point as older than its freshness policy. */
  stale?: boolean;
}

const MARGIN = { top: 12, right: 16, bottom: 22, left: 56 };

export function LineChart({
  series,
  height = 240,
  yAxis = true,
  xAxis = true,
  formatY = (v) => v.toFixed(2),
  area,
  ariaLabel,
  className,
  stale,
}: LineChartProps) {
  const gradientId = React.useId();
  const width = 720; // viewBox width; the SVG scales to container
  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top - MARGIN.bottom;

  const allPoints = series.flatMap((s) => s.points);
  const totalPoints = allPoints.length;

  if (totalPoints < 2) {
    return (
      <div
        role="img"
        aria-label={`${ariaLabel}: insufficient observations (${totalPoints} points)`}
        className={cn("flex items-center justify-center rounded-md bg-[var(--fs-surface-2)]", className)}
        style={{ height }}
      >
        <span className="text-xs text-ink-faint">
          {totalPoints === 0 ? "No observations recorded" : "Need at least two observations to plot a trend"}
        </span>
      </div>
    );
  }

  const [minY, maxY] = extent(allPoints.map((p) => p.y));
  const pad = (maxY - minY) * 0.08;
  const domainMin = minY - pad;
  const domainMax = maxY + pad;

  // x is categorical (index) when the series carry non-numeric x.
  const usesTime = typeof allPoints[0]?.x === "string";
  const xValues = usesTime
    ? allPoints.map((p) => new Date(p.x as string).getTime())
    : allPoints.map((p) => Number(p.x));
  const [minX, maxX] = extent(xValues);

  const scaleX = (x: string | number, i: number) => {
    if (!usesTime) return MARGIN.left + (i / Math.max(allPoints.length - 1, 1)) * innerW;
    const t = new Date(x as string).getTime();
    return MARGIN.left + ((t - minX) / Math.max(maxX - minX, 1)) * innerW;
  };
  const scaleY = (y: number) =>
    MARGIN.top + innerH - ((y - domainMin) / Math.max(domainMax - domainMin, 1e-9)) * innerH;

  // Y gridlines — four is the readability sweet spot.
  const ticks = Array.from({ length: 4 }, (_, i) => domainMin + ((domainMax - domainMin) * i) / 3);

  // Track a global index across series so x positioning is stable.
  let runningIndex = 0;

  const rendered = series.map((s, si) => {
    const color = s.color ?? `var(--fs-chart-${(si % 6) + 1})`;
    const coords: Array<[number, number]> = s.points.map((p, i) => [
      scaleX(p.x, runningIndex + i),
      scaleY(p.y),
    ]);
    runningIndex += s.points.length;
    return { ...s, color, coords };
  });

  const first = rendered[0];
  const firstLine = smoothPath(first.coords);
  const areaPath = `${firstLine} L${first.coords[first.coords.length - 1][0]},${MARGIN.top + innerH} L${first.coords[0][0]},${MARGIN.top + innerH} Z`;

  // X labels: first, middle, last of the union.
  const xLabelIdx = [0, Math.floor(allPoints.length / 2), allPoints.length - 1];
  const xLabelValue = (idx: number) => {
    const p = allPoints[idx];
    return usesTime
      ? new Date(p.x as string).toLocaleDateString(undefined, { month: "short", day: "numeric" })
      : String(p.x);
  };

  return (
    <figure className={cn("m-0", className)}>
      <svg
        role="img"
        aria-label={`${ariaLabel}: ${series.length} series, ${totalPoints} observations`}
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={first.color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={first.color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Gridlines + y labels */}
        {ticks.map((t, i) => {
          const y = scaleY(t);
          return (
            <g key={i}>
              <line
                x1={MARGIN.left}
                y1={y}
                x2={width - MARGIN.right}
                y2={y}
                stroke="var(--fs-chart-grid)"
                strokeWidth="1"
              />
              {yAxis ? (
                <text
                  x={MARGIN.left - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fontSize="9"
                  fill="var(--fs-chart-axis)"
                  style={{ fontFamily: "var(--fs-font-mono)" }}
                >
                  {formatY(t)}
                </text>
              ) : null}
            </g>
          );
        })}

        {/* Axis baseline */}
        <line
          x1={MARGIN.left}
          y1={MARGIN.top + innerH}
          x2={width - MARGIN.right}
          y2={MARGIN.top + innerH}
          stroke="var(--fs-border-strong)"
          strokeWidth="1"
        />

        {area && first.coords.length > 1 ? <path d={areaPath} fill={`url(#${gradientId})`} /> : null}

        {rendered.map((s) => (
          <path
            key={s.id}
            d={smoothPath(s.coords)}
            fill="none"
            stroke={s.color}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* Last-point markers */}
        {rendered.map((s) => {
          const lastPt = s.coords[s.coords.length - 1];
          const tone = stale ? "var(--fs-warning)" : s.color;
          return (
            <g key={`end-${s.id}`}>
              <circle cx={lastPt[0]} cy={lastPt[1]} r="4" fill={tone} opacity="0.18" />
              <circle cx={lastPt[0]} cy={lastPt[1]} r="2.2" fill={tone} />
            </g>
          );
        })}

        {/* X labels */}
        {xAxis
          ? xLabelIdx.map((idx) => {
              const x = MARGIN.left + (idx / Math.max(allPoints.length - 1, 1)) * innerW;
              return (
                <text
                  key={idx}
                  x={x}
                  y={height - 6}
                  textAnchor={idx === 0 ? "start" : idx === allPoints.length - 1 ? "end" : "middle"}
                  fontSize="9"
                  fill="var(--fs-chart-axis)"
                  style={{ fontFamily: "var(--fs-font-mono)" }}
                >
                  {xLabelValue(idx)}
                </text>
              );
            })
          : null}
      </svg>

      {/* Legend — required whenever there is more than one series. */}
      {series.length > 1 ? (
        <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {rendered.map((s) => (
            <span key={s.id} className="flex items-center gap-1.5 text-2xs text-ink-muted">
              <span
                aria-hidden="true"
                className="inline-block h-0.5 w-3 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              {s.label}
            </span>
          ))}
        </figcaption>
      ) : null}
    </figure>
  );
}

/* ─── AreaChart ─────────────────────────────────────────────────────── */

export function AreaChart(props: LineChartProps) {
  return <LineChart {...props} area />;
}

/* ─── BarSeries ─────────────────────────────────────────────────────── */

export interface BarDatum {
  label: string;
  value: number;
  /** Optional emphasis for one bar. */
  highlight?: boolean;
}

export function BarSeries({
  data,
  height = 180,
  formatValue,
  ariaLabel,
  className,
}: {
  data: BarDatum[];
  height?: number;
  formatValue?: (value: number) => string;
  ariaLabel: string;
  className?: string;
}) {
  if (data.length === 0) {
    return (
      <div
        role="img"
        aria-label={`${ariaLabel}: no data`}
        className={cn("flex items-center justify-center rounded-md bg-[var(--fs-surface-2)]", className)}
        style={{ height }}
      >
        <span className="text-xs text-ink-faint">No data</span>
      </div>
    );
  }

  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  const width = 640;
  const gap = 8;
  const barW = (width - gap * (data.length - 1)) / data.length;
  const chartH = height - 26;

  return (
    <svg
      role="img"
      aria-label={`${ariaLabel}: ${data
        .map((d) => `${d.label} ${formatValue ? formatValue(d.value) : d.value}`)
        .join(", ")}`}
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      className={className}
    >
      {data.map((d, i) => {
        const h = (Math.abs(d.value) / max) * (chartH - 8);
        const x = i * (barW + gap);
        const y = chartH - h;
        return (
          <g key={d.label}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={Math.max(h, 2)}
              rx="2"
              fill={d.highlight ? "var(--fs-accent)" : "var(--fs-chart-2)"}
              opacity={d.highlight ? 1 : 0.7}
            />
            <text
              x={x + barW / 2}
              y={height - 8}
              textAnchor="middle"
              fontSize="9"
              fill="var(--fs-chart-axis)"
              style={{ fontFamily: "var(--fs-font-mono)" }}
            >
              {d.label.length > 10 ? `${d.label.slice(0, 9)}…` : d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ─── Accessible data table ─────────────────────────────────────────── */

/**
 * Visually hidden table mirroring the chart data. Screen-reader users get
 * exact values instead of a summary, and sighted keyboard users can reach it
 * with the "View data table" toggle the caller controls.
 */
export function ChartDataTable({
  series,
  caption,
  className,
  visible,
}: {
  series: Series[];
  caption: string;
  className?: string;
  /** When true, render inline; otherwise sr-only. */
  visible?: boolean;
}) {
  const rows = Math.max(...series.map((s) => s.points.length), 0);
  return (
    <table className={cn(visible ? "w-full text-xs" : "fs-sr-only", className)}>
      <caption className="fs-label mb-2 text-left">{caption}</caption>
      <thead>
        <tr>
          <th scope="col" className="border-b border-[var(--fs-border)] py-1 pr-3 text-left">
            Index
          </th>
          {series.map((s) => (
            <th
              key={s.id}
              scope="col"
              className="border-b border-[var(--fs-border)] py-1 pr-3 text-right"
            >
              {s.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }, (_, i) => (
          <tr key={i}>
            <td className="py-0.5 pr-3 text-ink-faint fs-data">{i + 1}</td>
            {series.map((s) => (
              <td key={s.id} className="py-0.5 pr-3 text-right fs-data">
                {s.points[i] ? formatUsd(s.points[i].y) : "—"}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Skeleton matching the LineChart box. */
export function ChartSkeleton({ height = 240 }: { height?: number }) {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col justify-end gap-2 rounded-md bg-[var(--fs-surface-2)] p-3"
      style={{ height }}
    >
      {[0.9, 0.6, 0.75, 0.45].map((scale, i) => (
        <div
          key={i}
          className="rounded-sm bg-[var(--fs-shimmer-base)]"
          style={{ height: 2, width: `${scale * 100}%`, marginLeft: "auto" }}
        />
      ))}
    </div>
  );
}

export { transition };