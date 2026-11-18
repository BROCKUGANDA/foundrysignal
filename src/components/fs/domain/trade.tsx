"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { formatUsd } from "@/lib/fs/utils";
import { Badge } from "@/components/fs/ui/badge";
import { Button } from "@/components/fs/ui/button";
import { Glyph } from "@/components/fs/brand/glyphs";

/**
 * TradePanel — quote preview with an enforced execution gate.
 *
 * The single most important invariant in this component: **it cannot execute
 * unless the trading release gate is open.** That is not a visual state — the
 * button is genuinely disabled and the panel explains which gate is closed, so
 * a user never believes an order was placed when it was not.
 *
 * The gate is a server decision (GET /api/v1/trading/gates). The panel renders
 * whatever the server says and refuses to imply readiness it has not been
 * granted. `readiness.executionAllowed === false` renders `TradeGateNotice`
 * with the blocking reason and the list of unmet conditions.
 *
 * State contract:
 *   locked      gate closed — no input controls, reason shown
 *   ready       gate open, no quote yet
 *   quoting     quote request in flight
 *   quoted      quote returned; fields populated, expiry countdown shown
 *   stale       quote past its expiry — re-quote required
 *   error       quote failed; message shown, fields preserved
 *   submitting  execution in flight (only reachable when gate open)
 *   offline     no network — quote unavailable
 */

export interface TradeGateCondition {
  allReviewsApproved: boolean;
  killSwitchClear: boolean;
  envFlagSet: boolean;
}

export interface TradeGateState {
  key: string;
  title: string;
  /** OPEN | CLOSED | ... */
  state: string;
  /** Why it is closed, when it is. */
  reason?: string | null;
}

export interface TradingReadiness {
  gates: TradeGateState[];
  conditions: TradeGateCondition;
  executionAllowed: boolean;
  /** Human-readable explanation shown when execution is blocked. */
  blockReason: string;
}

export interface QuotePreview {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: number | null;
  slippageBps: number | null;
  /** ISO expiry; the quote must be re-fetched after this. */
  quoteExpiresAt: string;
  /** Route labels, e.g. ["Raydium", "Orca"]. */
  routeLabels?: string[];
}

export interface OrderIntent {
  id: string;
  kind: string;
  status: string;
  inputMint: string | null;
  outputMint: string | null;
  inAmount: string | null;
  outAmount: string | null;
  slippageBps: number | null;
  priceImpactPct: number | null;
  createdAt: string;
  failureReason?: string | null;
}

export interface TradePanelProps {
  readiness: TradingReadiness;
  quote?: QuotePreview | null;
  intents?: OrderIntent[];
  onQuote?: (input: { inputMint: string; outputMint: string; inAmount: string; slippageBps: number }) => void;
  onExecute?: () => void;
  /** Wallet address; null means no wallet connected. */
  walletAddress?: string | null;
  onConnectWallet?: () => void;
  quoting?: boolean;
  executing?: boolean;
  error?: string | null;
  offline?: boolean;
  className?: string;
  /** Base58 mint of the input token; defaults to SOL. */
  defaultInputMint?: string;
  defaultOutputMint?: string;
}

const SOL_MINT = "So11111111111111111111111111111111111111112";

/** Which conditions are still unmet, in plain language. */
function unmetConditions(readiness: TradingReadiness): string[] {
  const c = readiness.conditions;
  const out: string[] = [];
  if (!c.allReviewsApproved) out.push("product, jurisdiction, provider and security reviews must all be approved");
  if (!c.killSwitchClear) out.push("the trading kill switch must be clear");
  if (!c.envFlagSet) out.push("the execution environment flag must be enabled");
  return out;
}

/**
 * Gate notice. Rendered whenever execution is blocked, stating exactly which
 * conditions are unmet. This is the honest-state core of the trading surface.
 */
export function TradeGateNotice({
  readiness,
  className,
}: {
  readiness: TradingReadiness;
  className?: string;
}) {
  const unmet = unmetConditions(readiness);
  const closedGates = readiness.gates.filter((g) => g.state.toUpperCase() !== "OPEN");

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-md border border-[var(--fs-warning-border)] bg-[var(--fs-warning-bg)] px-4 py-3",
        className,
      )}
      data-slot="trade-gate-notice"
      role="status"
    >
      <div className="flex items-start gap-2">
        <span aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--fs-warning-fg)]">
          <Glyph name="risk" size={15} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">Execution gated</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-secondary">
            {readiness.blockReason || "Trading execution is disabled pending review."}
          </p>
        </div>
      </div>

      {closedGates.length > 0 ? (
        <ul className="ml-6 flex flex-col gap-1">
          {closedGates.map((g) => (
            <li key={g.key} className="flex items-start gap-1.5 text-2xs leading-relaxed text-ink-secondary">
              <Badge tone="warning" size="sm" className="mt-0.5 shrink-0">
                {g.state.toLowerCase()}
              </Badge>
              <span>
                {g.title}
                {g.reason ? <span className="text-ink-faint"> — {g.reason}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {unmet.length > 0 ? (
        <ul className="ml-6 flex list-disc flex-col gap-0.5">
          {unmet.map((u) => (
            <li key={u} className="text-2xs leading-relaxed text-ink-secondary">
              {u}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function TradePanel({
  readiness,
  quote,
  intents = [],
  onQuote,
  onExecute,
  walletAddress,
  onConnectWallet,
  quoting,
  executing,
  error,
  offline,
  className,
  defaultInputMint = SOL_MINT,
  defaultOutputMint = "",
}: TradePanelProps) {
  const [inputMint, setInputMint] = React.useState(defaultInputMint);
  const [outputMint, setOutputMint] = React.useState(defaultOutputMint);
  const [inAmount, setInAmount] = React.useState("");
  const [slippageBps, setSlippageBps] = React.useState(50);

  const now = useNow(1000);
  const quoteExpired = quote
    ? new Date(quote.quoteExpiresAt).getTime() <= now
    : false;

  const locked = !readiness.executionAllowed;
  const canQuote = !locked && !offline && inputMint.trim() && outputMint.trim() && Number(inAmount) > 0;

  return (
    <div className={cn("flex flex-col gap-4", className)} data-slot="trade-panel">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="text-[var(--fs-accent-2)]">
            <Glyph name="market" size={16} />
          </span>
          <h2 className="fs-brand text-base font-semibold text-ink">Trade</h2>
        </div>
        <Badge tone={locked ? "warning" : "success"} dot>
          {locked ? "gated" : "enabled"}
        </Badge>
      </header>

      {locked ? <TradeGateNotice readiness={readiness} /> : null}

      {offline ? (
        <p className="text-xs text-[var(--fs-warning-fg)]">
          Offline — quotes are unavailable until the connection returns.
        </p>
      ) : null}

      {/* Wallet */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--fs-border)] bg-surface-2 px-3 py-2">
        <span className="fs-data text-2xs text-ink-muted">
          {walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}` : "No wallet connected"}
        </span>
        {walletAddress ? (
          <Badge tone="neutral" size="sm">
            connected
          </Badge>
        ) : onConnectWallet ? (
          <Button variant="outline" size="sm" onClick={onConnectWallet} disabled={locked}>
            Connect wallet
          </Button>
        ) : null}
      </div>

      {/* Quote form */}
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="fs-label">Input mint</span>
          <input
            value={inputMint}
            onChange={(e) => setInputMint(e.target.value)}
            disabled={locked}
            spellCheck={false}
            className={inputClass(locked)}
            aria-label="Input token mint address"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="fs-label">Output mint</span>
          <input
            value={outputMint}
            onChange={(e) => setOutputMint(e.target.value)}
            disabled={locked}
            spellCheck={false}
            placeholder="Token mint to receive"
            className={inputClass(locked)}
            aria-label="Output token mint address"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="fs-label">Amount in</span>
            <input
              value={inAmount}
              onChange={(e) => setInAmount(e.target.value)}
              disabled={locked}
              inputMode="decimal"
              className={inputClass(locked)}
              aria-label="Input amount"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="fs-label">Slippage (bps)</span>
            <input
              value={String(slippageBps)}
              onChange={(e) => setSlippageBps(Number(e.target.value) || 0)}
              disabled={locked}
              inputMode="numeric"
              className={inputClass(locked)}
              aria-label="Slippage in basis points"
            />
          </label>
        </div>

        <Button
          variant="secondary"
          onClick={() => onQuote?.({ inputMint, outputMint, inAmount, slippageBps })}
          loading={quoting}
          loadingLabel="Quoting"
          disabled={!canQuote || quoting}
        >
          Get quote
        </Button>
      </div>

      {/* Quote result */}
      {quote ? (
        <div
          className={cn(
            "flex flex-col gap-2 rounded-md border px-4 py-3",
            quoteExpired
              ? "border-[var(--fs-warning-border)] bg-[var(--fs-warning-bg)]"
              : "border-[var(--fs-border)] bg-surface-2",
          )}
          data-slot="quote-preview"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="fs-label">Quote</span>
            <Badge tone={quoteExpired ? "warning" : "success"} size="sm" dot>
              {quoteExpired ? "expired — re-quote" : "valid"}
            </Badge>
          </div>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div>
              <dt className="fs-label">You pay</dt>
              <dd className="fs-data mt-0.5 text-sm text-ink">{quote.inAmount}</dd>
            </div>
            <div>
              <dt className="fs-label">You receive</dt>
              <dd className="fs-data mt-0.5 text-sm text-ink">{quote.outAmount}</dd>
            </div>
            <div>
              <dt className="fs-label">Price impact</dt>
              <dd
                className={cn(
                  "fs-data mt-0.5 text-sm",
                  (quote.priceImpactPct ?? 0) > 1
                    ? "text-[var(--fs-danger-fg)]"
                    : "text-ink",
                )}
              >
                {quote.priceImpactPct === null ? "—" : `${quote.priceImpactPct.toFixed(2)}%`}
              </dd>
            </div>
          </dl>
          {quote.routeLabels && quote.routeLabels.length > 0 ? (
            <p className="fs-data text-2xs text-ink-faint">
              route: {quote.routeLabels.join(" → ")}
            </p>
          ) : null}
          <p className="fs-data text-2xs text-ink-faint">
            expires {new Date(quote.quoteExpiresAt).toLocaleTimeString()}
          </p>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs leading-relaxed text-[var(--fs-danger-fg)]">
          {error}
        </p>
      ) : null}

      {/* Execution — only reachable when the gate is open. */}
      {locked ? (
        <p className="text-2xs leading-relaxed text-ink-faint">
          Execution is disabled. No order will be submitted while any release gate is closed.
        </p>
      ) : (
        <Button
          onClick={onExecute}
          loading={executing}
          loadingLabel="Submitting"
          disabled={!quote || quoteExpired || executing}
          title={quoteExpired ? "Quote expired — request a new quote" : undefined}
          className="w-full"
        >
          Review &amp; execute
        </Button>
      )}

      {/* Intent log */}
      {intents.length > 0 ? (
        <details className="rounded-md border border-[var(--fs-border)] bg-surface-2">
          <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-medium text-ink transition-colors duration-fast ease-out hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus-ring)]">
            <span aria-hidden="true" className="text-ink-faint">
              <Glyph name="claim" size={13} />
            </span>
            Order intents ({intents.length})
          </summary>
          <ul className="flex flex-col gap-1.5 border-t border-[var(--fs-border)] px-3 py-2">
            {intents.map((intent) => (
              <li key={intent.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <Badge
                  tone={
                    intent.status === "EXECUTED"
                      ? "success"
                      : intent.status === "FAILED"
                        ? "danger"
                        : "neutral"
                  }
                  size="sm"
                >
                  {intent.status.toLowerCase()}
                </Badge>
                <span className="fs-data text-2xs text-ink-secondary">
                  {intent.inAmount ?? "—"} → {intent.outAmount ?? "—"}
                </span>
                {intent.priceImpactPct !== null ? (
                  <span className="fs-data text-2xs text-ink-faint">
                    impact {intent.priceImpactPct.toFixed(2)}%
                  </span>
                ) : null}
                <span className="fs-data ml-auto text-2xs text-ink-faint">{intent.createdAt}</span>
                {intent.failureReason ? (
                  <p className="w-full text-2xs text-[var(--fs-danger-fg)]">{intent.failureReason}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <p className="text-2xs leading-relaxed text-ink-faint">
        Quotes are reference data from a market provider. Trading execution is disabled pending
        product, jurisdiction, provider and security review — no launchpad is operated here.
      </p>
    </div>
  );
}

const inputClass = (locked: boolean) =>
  cn(
    "fs-data h-9 w-full rounded-md border bg-surface px-3 text-xs text-ink",
    "placeholder:text-ink-faint",
    "transition-[border-color,box-shadow] duration-fast ease-out",
    "focus-visible:border-[var(--fs-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus-ring)]",
    locked
      ? "cursor-not-allowed border-[var(--fs-disabled-border)] bg-[var(--fs-disabled-bg)] text-[var(--fs-disabled-fg)]"
      : "border-[var(--fs-border-strong)] hover:border-[var(--fs-border-emphasis)]",
  );

/* ─── Quote expiry ticker ───────────────────────────────────────────── */

/** Re-renders every `intervalMs`; used to expire quotes without a timer per card. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Compact current price string for callers that need a value, not a component. */
export function quotePriceLabel(quote: QuotePreview): string {
  const inAmount = Number(quote.inAmount);
  const outAmount = Number(quote.outAmount);
  if (!Number.isFinite(inAmount) || inAmount === 0) return "—";
  return formatUsd(outAmount / inAmount);
}