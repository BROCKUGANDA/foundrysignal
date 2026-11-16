"use client";

// Markets view — token explorer with live Jupiter data + wallet connection
// (Wallet Standard) + quote preview. Execution is GATED OFF and shown honestly.

import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DegradedState,
  EmptyState,
  ErrorState,
  Field,
  Glyph,
  Icon,
  Input,
  LoadingState,
  SectionShell,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableScroll,
  TokenCard,
  shortHash,
  timeAgo,
  toast,
  type BadgeTone,
  type MarketSnapshot,
} from "@/components/fs";
import { api, type Capabilities } from "@/lib/client/api";
import { useWalletAvailability } from "@/lib/client/wallet";

interface MarketAsset {
  mint: string;
  symbol: string | null;
  name: string | null;
  venture: { name: string; slug: string } | null;
  association: string;
  decimals: number | null;
  supply: string | null;
  latestSnapshot: { priceUsd: number | null; liquidityUsd: number | null; asOf: string; provider: string } | null;
  live: { priceUsd: number | null; liquidityUsd: number | null; asOf: string | null } | null;
}

interface GateView {
  key: string;
  title: string;
  state: string;
}

interface TradingReadiness {
  gates: GateView[];
  conditions: { allReviewsApproved: boolean; killSwitchClear: boolean; envFlagSet: boolean };
  executionAllowed: boolean;
  blockReason: string;
}

interface OrderIntent {
  id: string;
  kind: string;
  status: string;
  inputMint: string | null;
  outputMint: string | null;
  inAmount: string | null;
  outAmount: string | null;
  slippageBps: number | null;
  priceImpactPct: number | null;
  quoteExpiresAt: string | null;
  failureReason: string | null;
  createdAt: string;
}

interface QuoteResult {
  recordId: string;
  outAmount: string;
  slippageBps: number;
  priceImpactPct: number | null;
  expiresAt: string;
  execution: { allowed: boolean; code: string; note: string };
}

interface IntentsResponse {
  items: OrderIntent[];
  readiness: TradingReadiness;
}

const SOL = "So11111111111111111111111111111111111111112";

const GATE_TONE: Record<string, BadgeTone> = {
  APPROVED: "success",
  ENGAGED: "danger",
};

const FALLBACK_BLOCK_REASON =
  "Trading execution is disabled pending product, jurisdiction, provider and security review.";

function snapshotToMarket(a: MarketAsset): MarketSnapshot | null {
  if (a.live?.asOf) {
    return {
      priceUsd: a.live.priceUsd,
      liquidityUsd: a.live.liquidityUsd,
      priceChange24h: null,
      asOf: a.live.asOf,
      provider: "Jupiter",
    };
  }
  if (!a.latestSnapshot) return null;
  return {
    priceUsd: a.latestSnapshot.priceUsd,
    liquidityUsd: a.latestSnapshot.liquidityUsd,
    priceChange24h: null,
    asOf: a.latestSnapshot.asOf,
    provider: a.latestSnapshot.provider,
  };
}

export function MarketsView() {
  const caps = useQuery({ queryKey: ["capabilities"], queryFn: () => api.get<Capabilities>("/api/v1/capabilities") });
  const assets = useQuery({ queryKey: ["markets", "assets"], queryFn: () => api.get<MarketAsset[]>("/api/v1/markets") });
  const readiness = useQuery({
    queryKey: ["trading", "readiness"],
    queryFn: () => api.get<TradingReadiness>("/api/v1/trading/gates"),
    staleTime: 30_000,
  });
  const intents = useQuery({
    queryKey: ["trading", "intents"],
    queryFn: () => api.get<IntentsResponse>("/api/v1/trading/order-intents"),
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header>
        <h1 className="fs-brand text-xl font-bold text-ink">Markets</h1>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">
          Real market data from Jupiter (Lite API) with asOf timestamps, kept structurally separate from venture evidence.
          Reference data only — never investment advice.
        </p>
      </header>

      <WalletConnectPanel caps={caps.data} readiness={readiness.data} />

      <TokenExplorer assets={assets} />

      <QuotePreview
        readiness={readiness.data}
        caps={caps.data}
        onIntentRecorded={() => void intents.refetch()}
      />

      <OrderIntents intents={intents} />
    </div>
  );
}

/* ─── Token explorer ────────────────────────────────────────────────── */

function TokenExplorer({ assets }: { assets: UseQueryResult<MarketAsset[]> }) {
  return (
    <SectionShell title="Associated tokens" glyph="onchain" id="fs-tokens">
      {assets.isLoading && <LoadingState kind="card" rows={3} label="Tokens loading" />}
      {assets.isError && (
        <ErrorState title="Market data unavailable" message={(assets.error as Error).message} onRetry={() => assets.refetch()} />
      )}
      {assets.data?.length === 0 && (
        <EmptyState
          glyph="onchain"
          title="No tokens associated yet"
          description="Associate a Solana mint with a venture (dossier → Onchain tab) to collect mint metadata and market snapshots."
        />
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {(assets.data ?? []).map((t) => (
          <div key={t.mint} className="flex flex-col gap-2">
            {t.venture ? (
              <p className="flex items-center gap-1.5 text-xs text-ink-muted">
                <Glyph name="venture" size={12} />
                {t.venture.name}
              </p>
            ) : null}
            <TokenCard
              structure={{
                mint: t.mint,
                symbol: t.symbol,
                name: t.name,
                decimals: t.decimals,
                supply: t.supply,
                association: t.association,
              }}
              market={snapshotToMarket(t)}
              onCopyMint={() => {
                void navigator.clipboard
                  .writeText(t.mint)
                  .then(() => toast.success("Mint address copied"))
                  .catch(() => toast.apiError("Mint not copied", new Error("Clipboard unavailable")));
              }}
            />
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

/* ─── Quote preview (execution gated) ───────────────────────────────── */

function QuotePreview({
  readiness,
  caps,
  onIntentRecorded,
}: {
  readiness?: TradingReadiness;
  caps?: Capabilities;
  onIntentRecorded: () => void;
}) {
  // Quote preview state (real Jupiter quotes; execution gated)
  const [inMint, setInMint] = useState(SOL);
  const [outMint, setOutMint] = useState("");
  const [amount, setAmount] = useState("100000000"); // 0.1 SOL in raw units
  const [lastQuote, setLastQuote] = useState<{ inputMint: string; outputMint: string; amount: string } | null>(null);

  const quote = useMutation({
    mutationFn: () => api.post<QuoteResult>("/api/v1/markets", { inputMint: inMint, outputMint: outMint, amount, slippageBps: 50 }),
    onSuccess: () => {
      setLastQuote({ inputMint: inMint, outputMint: outMint, amount });
      toast.success("Real quote retrieved — preview only, execution gated");
    },
    onError: (e) => toast.apiError("Quote unavailable", e),
  });

  const recordIntent = useMutation({
    mutationFn: () =>
      api.post<{ intent: OrderIntent; readiness: TradingReadiness; note: string }>("/api/v1/trading/order-intents", {
        inputMint: lastQuote?.inputMint ?? inMint,
        outputMint: lastQuote?.outputMint ?? outMint,
        amount: lastQuote?.amount ?? amount,
        slippageBps: 50,
      }),
    onSuccess: () => {
      toast.success("Order intent recorded — retained as a gated record, nothing executed");
      setLastQuote(null);
      onIntentRecorded();
    },
    onError: (e) => toast.apiError("Order intent not recorded", e),
  });

  const blockReason = readiness?.blockReason ?? caps?.tradingExecution.reason ?? FALLBACK_BLOCK_REASON;

  return (
    <SectionShell title="Quote preview & order intents" glyph="liquidity" id="fs-quotes">
      <div className="rounded-lg border border-[var(--fs-border-strong)] bg-surface-2 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <span aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--fs-warning-fg)]">
            <Glyph name="risk" size={15} />
          </span>
          <div className="min-w-0 text-xs leading-relaxed text-ink-muted">
            <span className="fs-data font-semibold text-ink-secondary">
              {readiness?.executionAllowed ? "EXECUTION_PERMITTED" : "EXECUTION_GATED"}
            </span>{" "}
            —{" "}
            {readiness?.executionAllowed
              ? "All release gates approved and the kill switch is clear. Execution calls are audit-logged and require a client-signed transaction from your own wallet."
              : blockReason}{" "}
            Quotes below are real Jupiter quotes. While gated, quotes can be recorded as order intents — retained records, never
            executions.
          </div>
        </div>
        {readiness && !readiness.executionAllowed && (
          <ul className="mt-2.5 flex flex-wrap gap-1.5 pl-7" aria-label="Release gates">
            {readiness.gates.map((g) => (
              <li key={g.key}>
                <Badge tone={GATE_TONE[g.state] ?? "neutral"} size="sm" title={`${g.title}: ${g.state}`}>
                  {g.title}: {g.state}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Card>
        <CardContent>
          <form
            className="grid gap-3 sm:grid-cols-[1fr_1fr_140px_auto] sm:items-end"
            aria-label="Quote preview"
            onSubmit={(e) => {
              e.preventDefault();
              quote.mutate();
            }}
          >
            <Field id="q-in" label="Input mint">
              {(props) => <Input {...props} mono value={inMint} onChange={(e) => setInMint(e.target.value)} />}
            </Field>
            <Field id="q-out" label="Output mint">
              {(props) => (
                <Input {...props} mono value={outMint} onChange={(e) => setOutMint(e.target.value)} placeholder="Base58 mint" />
              )}
            </Field>
            <Field id="q-amt" label="Raw amount">
              {(props) => (
                <Input
                  {...props}
                  mono
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
                />
              )}
            </Field>
            <Button
              type="submit"
              disabled={!outMint}
              disabledReason={!outMint ? "Enter an output mint" : undefined}
              loading={quote.isPending}
              loadingLabel="Quoting"
            >
              Get real quote
            </Button>
          </form>
        </CardContent>
      </Card>

      {quote.data && (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <dl className="grid gap-3 sm:grid-cols-4">
              {[
                ["Output (raw)", quote.data.outAmount],
                ["Slippage", `${quote.data.slippageBps} bps`],
                ["Price impact", quote.data.priceImpactPct !== null ? `${(quote.data.priceImpactPct * 100).toFixed(2)}%` : "—"],
                ["Expires", new Date(quote.data.expiresAt).toLocaleTimeString()],
              ].map(([k, val]) => (
                <div key={k} className="rounded-md border border-[var(--fs-border)] bg-surface-2 p-3">
                  <dt className="fs-label">{k}</dt>
                  <dd className="fs-data fs-num mt-1 truncate text-sm font-semibold text-ink" title={String(val)}>
                    {String(val)}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => recordIntent.mutate()}
                loading={recordIntent.isPending}
                loadingLabel="Recording intent"
              >
                <Icon name="copy" size={13} />
                Record as order intent
              </Button>
              <span className="fs-data text-2xs text-ink-faint">
                quote record {quote.data.recordId} · wallet signing would occur locally in your own wallet; the platform never
                holds signing material
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </SectionShell>
  );
}

/* ─── Order intents (gated records) ─────────────────────────────────── */

function OrderIntents({ intents }: { intents: UseQueryResult<IntentsResponse> }) {
  const items = (intents.data?.items ?? []).slice(0, 10);

  return (
    <SectionShell title="Your order intents" id="fs-intents">
      {intents.isLoading && <LoadingState kind="table" rows={2} label="Order intents loading" />}
      {intents.isError && (
        <ErrorState title="Order intents unavailable" message={(intents.error as Error).message} onRetry={() => intents.refetch()} />
      )}
      {intents.data?.items.length === 0 && (
        <EmptyState
          glyph="market"
          title="No order intents recorded"
          description="Get a real quote above and record it as an intent. Intents persist your research trail while execution remains gated — they are never sent to a provider or signed."
        />
      )}

      {items.length > 0 && (
        <TableScroll>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Input</TableHeaderCell>
                <TableHeaderCell>Output</TableHeaderCell>
                <TableHeaderCell align="end">Slippage</TableHeaderCell>
                <TableHeaderCell align="end">Impact</TableHeaderCell>
                <TableHeaderCell align="end">Recorded</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell>
                    <Badge
                      tone={it.status === "GATED_EXECUTION_DISABLED" ? "warning" : "success"}
                      dot
                      title={it.failureReason ?? it.status}
                    >
                      {it.status}
                    </Badge>
                  </TableCell>
                  <TableCell mono>
                    <span className="block truncate" title={it.inputMint ?? ""}>
                      {it.inputMint ? shortHash(it.inputMint, 8, 4) : "—"} · {it.inAmount ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell mono>
                    <span className="block truncate" title={it.outputMint ?? ""}>
                      {it.outputMint ? shortHash(it.outputMint, 8, 4) : "—"} · {it.outAmount ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell align="end" mono>
                    {it.slippageBps ?? "—"} bps
                  </TableCell>
                  <TableCell align="end" mono>
                    {it.priceImpactPct !== null ? `${(it.priceImpactPct * 100).toFixed(2)}%` : "—"}
                  </TableCell>
                  <TableCell align="end" mono className="text-ink-faint">
                    {timeAgo(it.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableScroll>
      )}
    </SectionShell>
  );
}

/* ─── Wallet ────────────────────────────────────────────────────────── */

function WalletConnectPanel({ caps, readiness }: { caps?: Capabilities; readiness?: TradingReadiness }) {
  const { wallets, checked } = useWalletAvailability();
  const [announced, setAnnounced] = useState(false);
  const enabled = Boolean(readiness?.executionAllowed || caps?.tradingExecution.available);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-[var(--fs-accent-2)]"
          >
            <Glyph name="onchain" size={20} />
          </span>
          <div>
            <CardTitle className="text-sm">Wallet connection (Wallet Standard)</CardTitle>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-ink-muted">
              Wallet detection runs against the browser&apos;s Wallet Standard registry via{" "}
              <span className="fs-data">@wallet-standard/app</span>. Signing always happens inside your own wallet — the platform
              never requests seed phrases and holds no signing material (execution is gated, so nothing to hold).
            </p>
          </div>
        </div>
        <Badge tone={enabled ? "success" : "warning"} dot className="shrink-0">
          {enabled ? "EXECUTION ENABLED" : "EXECUTION GATED"}
        </Badge>
      </CardHeader>
      <CardContent>
        {!checked && <p className="fs-data text-xs text-ink-muted">Scanning for Wallet Standard providers…</p>}

        {checked && wallets.length === 0 && (
          <DegradedState
            provider="Wallet Standard"
            message="No Wallet Standard wallets detected in this environment. Install a Solana Wallet Standard-compatible wallet extension to connect. This is an honest detection result — the platform does not simulate wallet availability."
          />
        )}

        {checked && wallets.length > 0 && (
          <div className="flex flex-col gap-2">
            <ul className="flex flex-wrap gap-2" aria-label="Detected wallets">
              {wallets.map((w) => (
                <li key={w.name}>
                  <Badge tone="success" dot>
                    <span>{w.name} detected</span>
                    <a
                      href="https://docs.solana.com/wallet-guide"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Learn about connecting ${w.name}`}
                      onClick={() => {
                        if (!announced) {
                          toast.info("Wallet connection requires a signing session in your wallet");
                          setAnnounced(true);
                        }
                      }}
                      className="inline-flex"
                    >
                      <Icon name="externalLink" size={11} />
                    </a>
                  </Badge>
                </li>
              ))}
            </ul>
            <p className="text-2xs leading-relaxed text-ink-muted">
              Detected wallets register via Wallet Standard. Transaction signing flows are enabled only after the execution release
              gate is lifted; quote previews remain available.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
