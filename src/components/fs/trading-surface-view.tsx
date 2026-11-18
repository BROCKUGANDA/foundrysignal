"use client";

// Trading surface — order intent -> quote preview -> wallet connect ->
// execute, all strictly governed by the trading release-gate flow.
//
// Honest posture: while any review gate is closed the panel renders
// TradeGateNotice with the exact blocking reason; nothing is signed,
// submitted or executed. Only after the review gates approve, the kill
// switch is clear and TRADING_ENABLED=true does execution become reachable.

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/client/api";
import { useApp } from "@/lib/client/store";
import { useWalletAvailability } from "@/lib/client/wallet";
import {
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  getTransactionDecoder,
  decodeTransactionFromRpcResponse,
  type Transaction,
} from "@solana/kit";
import {
  SectionShell,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  Field,
  Glyph,
  LoadingState,
  toast,
  cn,
  type BadgeTone,
  type ButtonProps,
} from "@/components/fs";
import {
  TradePanel,
  TradeGateNotice,
  QuotePreview,
  OrderIntent as TradeOrderIntent,
  TradingReadiness,
  TradeGateState,
} from "@/components/fs/domain/trade";

// ─── Types (mirror the server + trade domain) ─────────────────────────────

interface OrderIntent extends TradeOrderIntent {
  amountLabel?: string;
  statusLabel?: string;
  quoteExpiresAt?: string | null;
  routeLabels?: string[] | null;
}

/** Trade-readiness payload as served by /api/v1/trading/gates (release-authority view). */
interface TradingReady {
  gates: {
    key: string;
    title: string;
    state: string;
    decisionNotes?: string | null;
    describedBy?: string | null;
    decidedBy?: string | null;
    decidedAt?: string | null;
    updatedAt?: string | null;
  }[];
  conditions: { allReviewsApproved: boolean; killSwitchClear: boolean; envFlagSet: boolean };
  executionAllowed: boolean;
  blockReason: string;
}

interface IntentFormState {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  slippageBps: number;
}

// ─── Trading surface view ─────────────────────────────────────────────────

export function TradingView() {
  const { section, params } = useApp();
  const { wallets, checked } = useWalletAvailability();
  const walletAddress = wallets[0]?.accounts?.[0]?.address ?? null;

  const gates = useQuery({
    queryKey: ["trading-gates"],
    queryFn: () => (api.get<TradingReady>("/api/v1/trading/gates") as Promise<TradingReady>),
    refetchInterval: 10_000,
    enabled: !!walletAddress, // trading surface is user-scoped; hide while unauthenticated
  });

  const intents = useQuery({
    queryKey: ["trading-intents", walletAddress],
    queryFn: () => api.get<{ items: OrderIntent[]; readiness: TradingReadiness }>("/api/v1/trading/order-intents"),
    enabled: !!walletAddress,
    refetchInterval: 15_000,
  });

  const createIntent = useMutation({
    mutationFn: (input: IntentFormState) =>
      api.post<{ intent: OrderIntent; readiness: TradingReadiness; note: string }>(
        "/api/v1/trading/order-intents",
        input
      ),
    onSuccess: (data) => {
      toast.success("Order intent recorded from live Jupiter quote");
      // refresh both intents + readiness so the panel shows the new quote
      intents.refetch();
      gates.refetch();
    },
    onError: (e: unknown) => toast.apiError("Could not create quote", e as Error),
  });

  const execute = useMutation({
    mutationFn: async (intentId: string) => {
      if (!walletAddress) throw new Error("Connect a Solana wallet before executing.");
      // 1) Build the unsigned order (server -> Jupiter). The platform never
      //    holds signing material; the wallet signs it on the client.
      const unsigned = await api.post<{
        orderId: string;
        transactionBase64: string;
      }>("/api/v1/trading/swap", {
        inputMint: selectedQuote?.inputMint ?? "",
        outputMint: selectedQuote?.outputMint ?? "",
        amount: selectedQuote?.inAmount ?? "",
        slippageBps: selectedQuote ? (selectedQuote.slippageBps ?? 0) : 0,
        user: walletAddress,
      });
      // 2) Wallet signs off-device (platform never holds keys).
      const signed = await signWithWallet(walletAddress, unsigned.transactionBase64);
      // 3) Execute server-side; returns CONFIRMED/UNCERTAIN/FAILED (never fabricated).
      return api.post<{ recordId: string; status: string; signature: string | null }>(
        "/api/v1/trading/execute",
        { intentId, walletAddress, signedTransaction: signed }
      );
    },
    onSuccess: () => {
      toast.success("Execution submitted — awaiting onchain confirmation");
      intents.refetch();
      gates.refetch();
    },
    onError: (e: unknown) => {
      const err = e as Error & { code?: string };
      if (err.code === "EXECUTION_GATED") {
        toast.warning("Execution blocked", { description: err.message });
      } else {
        toast.apiError("Execution failed to submit", e as Error);
      }
    },
  });

  const selectedQuote = intents.data?.items.find(
    (i) => i.status === "QUOTED" || i.status === "INTENT_RECORDED"
  ) as OrderIntent | null;

  if (gates.isLoading || intents.isLoading) {
    return (
      <SectionShell title="Trade" glyph="market" id="fs-trade">
        <LoadingState rows={6} kind="card" label="Loading trading surface" />
      </SectionShell>
    );
  }

  if (gates.error || intents.error) {
    const err = gates.error || intents.error;
    return (
      <SectionShell title="Trade" glyph="market" id="fs-trade">
        <ErrorState
          title="Trading surface unavailable"
          message={err instanceof Error ? err.message : "Unknown error"}
          onRetry={() => {
            gates.refetch();
            intents.refetch();
          }}
        />
      </SectionShell>
    );
  }

  const r = gates.data;

  return (
    <SectionShell
      title="Trade"
      glyph="market"
      id="fs-trade"
      aside={r ? <TradeGateStatus readiness={r} /> : null}
    >
      <TradePanel
        readiness={
          r
            ? {
                gates: r.gates.map((g) => ({ key: g.key, title: g.title, state: g.state })),
                conditions: r.conditions,
                executionAllowed: r.executionAllowed,
                blockReason: r.blockReason,
              }
            : {
                gates: [] as TradeGateState[],
                conditions: { allReviewsApproved: false, killSwitchClear: false, envFlagSet: false },
                executionAllowed: false,
                blockReason: "Trading is unavailable",
              }
        }
        quote={
          selectedQuote && selectedQuote.inAmount
            ? {
                inputMint: selectedQuote.inputMint ?? "",
                outputMint: selectedQuote.outputMint ?? "",
                inAmount: selectedQuote.inAmount,
                outAmount: selectedQuote.outAmount ?? "",
                slippageBps: selectedQuote.slippageBps ?? null,
                priceImpactPct: selectedQuote.priceImpactPct ?? null,
                quoteExpiresAt: selectedQuote.quoteExpiresAt ?? new Date().toISOString(),
                routeLabels: selectedQuote.routeLabels ?? undefined,
              }
            : undefined
        }
        intents={
          intents.data?.items.map((i) => ({
            ...i,
            statusLabel: statusLabel(i.status),
          })) ?? []
        }
        onQuote={(input) => createIntent.mutate(input)}
        onExecute={() =>
          execute.mutate(
            intents.data?.items.find((i) => i.status === "QUOTED" || i.status === "INTENT_RECORDED")?.id ?? ""
          )
        }
        walletAddress={walletAddress}
        onConnectWallet={() => {
          toast.info("Wallet prompt will appear in your connected wallet app.");
        }}
        quoting={createIntent.isPending}
        executing={execute.isPending}
        error={
          execute.error
            ? (execute.error as Error).message
            : createIntent.error
              ? (createIntent.error as Error).message
              : null
        }
        offline={!checked}
      />
    </SectionShell>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Turn the stored status string into a human-facing label. */
function statusLabel(s: string): string {
  switch (s) {
    case "QUOTED":
      return "Quoted";
    case "GATED_EXECUTION_DISABLED":
      return "Gated (execution disabled)";
    case "INTENT_RECORDED":
      return "Recorded";
    case "SUBMITTED":
      return "Submitted";
    case "CONFIRMED":
      return "Confirmed";
    case "UNCERTAIN":
      return "Uncertain";
    case "FAILED":
      return "Failed";
    default:
      return s;
  }
}

// ─── Trade-gate status badge (for the shell aside) ───────────────────────

function TradeGateStatus({ readiness }: { readiness: TradingReady }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone={readiness.executionAllowed ? "success" : "warning"} dot aria-live="polite">
        {readiness.executionAllowed ? "EXECUTION PERMITTED" : "EXECUTION GATED"}
      </Badge>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen((o) => !o)}
        className="text-2xs"
        title="Expand to review each release gate"
      >
        <Glyph name="attestation" size={13} />
        {open ? "Hide" : "Gate review"}
      </Button>
      {open && (
        <div className="mt-2 w-[340px] rounded-md border bg-surface-2 p-3 text-xs text-ink-secondary">
          <p className="text-lg font-semibold text-ink mb-2">Release gates — {readiness.blockReason}</p>
          <ul className="list-disc list-inside space-y-1">
            {readiness.gates.map((g) => (
              <li key={g.key}>
                {g.title}: {g.state.toUpperCase()}
                {g.decidedBy || g.decidedAt ? (
                  <span className="text-ink-faint">
                    {" "}
                    · {new Date(g.decidedAt || "").toLocaleString()}
                    {g.decidedBy ? ` · ${g.decidedBy.slice(0, 6)}` : ""}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Wallet signing (client-side only; the platform never holds keys) ─────

/** Decode a base64 string to a Uint8Array (browser-safe, no Buffer). */
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function signWithWallet(
  walletAddress: string,
  base64Transaction: string,
): Promise<string> {
  const { getWallets } = await import("@wallet-standard/app");
  const wallets = getWallets();
  // Wallet Standard holds public addresses and features on accounts; the matching
  // wallet (and its private key) stays entirely in the user's device.
  const match = await Promise.all(
    wallets.get().map(async (w) => {
      const accounts = w.accounts ?? [];
      return { wallet: w, account: accounts.find((a) => a.address === walletAddress) };
    })
  ).then((r) => r.find((m) => m.account !== undefined));
  if (!match) throw new Error("No connected wallet found for the active session.");
  const target = match.wallet;
  if (!target.accounts.find((a) => a.address === walletAddress)) {
    throw new Error("Connected wallet account not found.");
  }

  // Decode the Jupiter unsigned transaction (base64 wire transaction) into a
  // transaction message the wallet can sign. Signing is always off-device.
  const decoder = getTransactionDecoder();
  const transaction = decoder.decode(base64ToUint8Array(base64Transaction)) as Transaction;

  // The `standard:sign` feature exposes signTransaction; the wallet keeps its
  // keys locally and returns only the signatures.
  const signer = target.features?.["standard:sign"] as {
    signTransaction(request: { transaction: Transaction }): Promise<Transaction>;
  } | undefined;
  if (!signer || typeof signer.signTransaction !== "function") {
    throw new Error("Connected wallet does not support transaction signing.");
  }
  const signed = await signer.signTransaction({ transaction }) as Transaction;
  return getBase64EncodedWireTransaction(signed);
}
