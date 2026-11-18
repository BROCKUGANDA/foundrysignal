"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { formatUsd, formatPct, formatCompact, timeAgo, shortHash } from "@/lib/fs/utils";
import { Badge } from "@/components/fs/ui/badge";
import { Button } from "@/components/fs/ui/button";
import { Sparkline } from "./charts";
import { Glyph, Icon } from "@/components/fs/brand/glyphs";

/**
 * TokenCard — token structure and market context.
 *
 * Two things are kept strictly separate:
 *   structure   mint, supply, authorities, decimals  ← onchain observation
 *   market      price, liquidity, 24h change        ← provider snapshot
 *
 * They are never merged into one "value" figure, because onchain supply is not
 * market value and a price snapshot is not evidence about the project.
 *
 * State contract:
 *   default     both blocks present
 *   loading     skeleton preserving both block heights
 *   empty       no mint associated — explicit, with the next action
 *   stale       market snapshot older than policy; marked with its asOf time
 *   error       caller supplies the message; structure may still render
 *   offline     market block shows "unavailable offline", structure persists
 */

export interface TokenStructure {
  mint: string;
  symbol?: string | null;
  name?: string | null;
  decimals?: number | null;
  supply?: string | null;
  /** SPL Token-2022 vs legacy. */
  program?: string | null;
  /** When non-null, additional supply can still be minted. */
  mintAuthority?: string | null;
  /** When non-null, the token account can be frozen. */
  freezeAuthority?: string | null;
  /** VERIFIED | SELF_ASSERTED | ... */
  association?: string | null;
  /** Slot the observation was read at. */
  slot?: number | string | null;
  observedAt?: string | null;
  providerLimitations?: string | null;
}

export interface MarketSnapshot {
  priceUsd: number | null;
  liquidityUsd: number | null;
  priceChange24h: number | null;
  asOf: string;
  provider: string;
}

export interface TokenCardProps {
  structure: TokenStructure;
  market?: MarketSnapshot | null;
  /** Price points for the sparkline, oldest first. */
  priceHistory?: number[];
  onCopyMint?: () => void;
  onCollect?: () => void;
  collecting?: boolean;
  stale?: boolean;
  offline?: boolean;
  className?: string;
}

function StructureRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--fs-border)] py-1.5 last:border-b-0">
      <dt className="fs-label shrink-0">{label}</dt>
      <dd className="fs-data min-w-0 truncate text-right text-xs text-ink">{children}</dd>
    </div>
  );
}

export function TokenCard({
  structure,
  market,
  priceHistory = [],
  onCopyMint,
  onCollect,
  collecting,
  stale,
  offline,
  className,
}: TokenCardProps) {
  const delta = market?.priceChange24h ?? null;
  const deltaTone =
    delta === null ? "text-ink-muted" : delta >= 0 ? "text-[var(--fs-positive-fg)]" : "text-[var(--fs-danger-fg)]";

  return (
    <div className={cn("flex flex-col gap-4", className)} data-slot="token-card">
      {/* Structure */}
      <section className="fs-panel flex flex-col gap-3 p-5" aria-label="Token structure">
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="text-[var(--fs-accent-fg)]">
              <Glyph name="token" size={16} />
            </span>
            <div>
              <h3 className="fs-brand text-sm font-semibold text-ink">
                {structure.name ?? "Unnamed token"}
                {structure.symbol ? (
                  <span className="fs-data ml-1.5 text-xs font-normal text-ink-muted">
                    {structure.symbol}
                  </span>
                ) : null}
              </h3>
              <p className="fs-data mt-0.5 text-2xs text-ink-faint">
                {structure.mint.slice(0, 6)}…{structure.mint.slice(-4)}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Badge tone={structure.association === "VERIFIED" ? "success" : "neutral"} size="sm" dot>
              {structure.association ?? "unverified"}
            </Badge>
            {onCopyMint ? (
              <Button variant="ghost" size="icon-sm" aria-label="Copy mint address" onClick={onCopyMint}>
                <Icon name="copy" size={14} />
              </Button>
            ) : null}
          </div>
        </header>

        <dl className="flex flex-col">
          <StructureRow label="Decimals">{structure.decimals ?? "—"}</StructureRow>
          <StructureRow label="Supply">
            {structure.supply ? formatCompact(Number(structure.supply)) : "—"}
          </StructureRow>
          <StructureRow label="Program">{structure.program ?? "SPL Token"}</StructureRow>
          <StructureRow label="Mint authority">
            {structure.mintAuthority ? (
              <span className="text-[var(--fs-warning-fg)]" title={structure.mintAuthority}>
                retained
              </span>
            ) : (
              <span className="text-[var(--fs-positive-fg)]">revoked</span>
            )}
          </StructureRow>
          {structure.freezeAuthority ? (
            <StructureRow label="Freeze authority">
              <span className="text-[var(--fs-warning-fg)]" title={structure.freezeAuthority}>
                retained
              </span>
            </StructureRow>
          ) : null}
          {structure.slot !== null && structure.slot !== undefined ? (
            <StructureRow label="Slot">{String(structure.slot)}</StructureRow>
          ) : null}
        </dl>

        {structure.providerLimitations ? (
          <p className="text-2xs leading-relaxed text-ink-faint">
            <span className="font-semibold">Limitations: </span>
            {structure.providerLimitations}
          </p>
        ) : null}
      </section>

      {/* Market */}
      <section className="fs-panel flex flex-col gap-3 p-5" aria-label="Market snapshot">
        <header className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="text-[var(--fs-accent-2)]">
              <Glyph name="market" size={16} />
            </span>
            <h3 className="fs-brand text-sm font-semibold text-ink">Market snapshot</h3>
          </div>
          {onCollect ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onCollect}
              loading={collecting}
              loadingLabel="Collecting"
              className="shrink-0"
            >
              <Icon name="refresh" size={13} />
              Collect
            </Button>
          ) : null}
        </header>

        {offline ? (
          <p className="text-xs text-ink-faint">
            Market data unavailable offline. The structure above is from the last onchain observation.
          </p>
        ) : !market ? (
          <p className="text-xs text-ink-faint">
            No market snapshot recorded. Collect one to fetch a live quote with its asOf timestamp.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div>
                <div className="fs-label">Price</div>
                <div className="fs-data fs-num mt-1 text-lg font-semibold text-ink">
                  {formatUsd(market.priceUsd)}
                </div>
              </div>
              <div>
                <div className="fs-label">Liquidity</div>
                <div className="fs-data fs-num mt-1 text-lg font-semibold text-ink">
                  {market.liquidityUsd === null ? "—" : `$${formatCompact(market.liquidityUsd)}`}
                </div>
              </div>
              <div>
                <div className="fs-label">24h change</div>
                <div className={cn("fs-data fs-num mt-1 text-lg font-semibold", deltaTone)}>
                  {formatPct(delta)}
                </div>
              </div>
            </div>

            {priceHistory.length >= 2 ? (
              <Sparkline points={priceHistory} ariaLabel="Price history" width={360} height={72} />
            ) : (
              <p className="text-2xs text-ink-faint">
                {priceHistory.length} snapshot(s) — need two to plot a trend.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={stale ? "warning" : "neutral"} size="sm" dot={stale}>
                {stale ? "stale" : "as of"} {timeAgo(market.asOf)}
              </Badge>
              <span className="fs-data text-2xs text-ink-faint">provider {market.provider}</span>
            </div>

            <p className="text-2xs leading-relaxed text-ink-faint">
              Prices are reference data from a market provider, not investment guidance. Onchain holders are not
              verified users, and onchain activity is not revenue.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

/** Skeleton preserving both block heights. */
export function TokenCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-4", className)} aria-hidden="true">
      {[0, 1].map((block) => (
        <div key={block} className="fs-panel flex flex-col gap-3 p-5">
          <div className="flex justify-between">
            <div className="h-3 w-32 rounded-sm bg-[var(--fs-shimmer-base)]" />
            <div className="h-4 w-16 rounded-full bg-[var(--fs-surface-3)]" />
          </div>
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="flex justify-between">
              <div className="h-2.5 w-20 rounded-sm bg-[var(--fs-surface-3)]" />
              <div className="h-2.5 w-24 rounded-sm bg-[var(--fs-surface-3)]" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Compact mint line for dense table rows. */
export function TokenMintLine({ mint, symbol }: { mint: string; symbol?: string | null }) {
  return (
    <span className="fs-data inline-flex items-center gap-1.5 text-2xs text-ink-muted">
      <span aria-hidden="true" className="text-ink-faint">
        <Glyph name="token" size={11} />
      </span>
      {symbol ? <span className="text-ink">{symbol}</span> : null}
      <span title={mint}>{shortHash(mint, 6, 4)}</span>
    </span>
  );
}