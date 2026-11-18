// Jupiter adapter — real market data via Jupiter Price API V3 (Lite).
// Quote API (Lite) powers the trading *preview* surface; execution
// (/order + /execute) is implemented behind a release gate held OFF.

import { createBaseProvider, ProviderError } from "./framework";

const PRICE_ROOT = "https://lite-api.jup.ag/price/v3";
const QUOTE_ROOT = "https://lite-api.jup.ag/swap/v1";
// Swap API V2 execution endpoints — implemented for the release-gated
// execution surface; routes never call these until the release gate lifts.
const SWAP_V2_ROOT = "https://lite-api.jup.ag/swap/v2";

export interface TokenPriceResult {
  id: string;
  usdPrice: number | null;
  liquidityUsd: number | null;
  priceChange24h: number | null;
  decimals: number | null;
  blockId: string | null;
  asOf: Date;
}

export interface QuoteResult {
  quoteId: string | null;
  inMint: string;
  outMint: string;
  inAmount: string;
  outAmount: string;
  slippageBps: number;
  priceImpactPct: number | null;
  /** Number of legs in the routed plan (0 when the provider omits routePlan). */
  routeLegs: number;
  raw: unknown;
}

export class JupiterAdapter {
  private provider = createBaseProvider({ name: "jupiter", timeoutMs: 12_000 });

  async getHealth() {
    return this.provider.getHealth();
  }

  async getRateLimitState() {
    return this.provider.getRateLimitState();
  }

  /** Price API V3: `GET /price/v3?ids=<mint>[,<mint>]` */
  async getPrices(mints: string[]): Promise<Record<string, TokenPriceResult>> {
    if (mints.length === 0) return {};
    if (mints.length > 50) throw new ProviderError("PERMANENT", "Max 50 mints per request", false);
    const res = await this.provider.fetch(
      { url: `${PRICE_ROOT}?ids=${mints.map(encodeURIComponent).join(",")}` },
      (raw) => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("expected object");
        return raw as Record<string, Record<string, unknown>>;
      }
    );
    const out: Record<string, TokenPriceResult> = {};
    for (const mint of mints) {
      const entry = res.data[mint];
      if (!entry) {
        out[mint] = { id: mint, usdPrice: null, liquidityUsd: null, priceChange24h: null, decimals: null, blockId: null, asOf: res.collectedAt };
        continue;
      }
      out[mint] = {
        id: mint,
        usdPrice: typeof entry.usdPrice === "number" ? entry.usdPrice : null,
        liquidityUsd: typeof entry.liquidity === "number" ? entry.liquidity : null,
        priceChange24h: typeof entry.priceChange24h === "number" ? entry.priceChange24h : null,
        decimals: typeof entry.decimals === "number" ? entry.decimals : null,
        blockId: typeof entry.blockId === "number" ? String(entry.blockId) : null,
        asOf: res.collectedAt,
      };
    }
    return out;
  }

  /** Quote API (Lite): `GET /swap/v1/quote?...` — preview only, no execution. */
  async getQuote(params: {
    inputMint: string;
    outputMint: string;
    amount: string; // raw integer (adjusted for decimals)
    slippageBps: number;
  }): Promise<QuoteResult> {
    if (!Number.isInteger(Number(params.amount)) || Number(params.amount) <= 0) {
      throw new ProviderError("PERMANENT", "Amount must be a positive integer in raw units", false);
    }
    const qs = new URLSearchParams({
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      amount: params.amount,
      slippageBps: String(params.slippageBps),
    });
    const res = await this.provider.fetch({ url: `${QUOTE_ROOT}/quote?${qs.toString()}` }, (raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("expected quote object");
      return raw as Record<string, unknown>;
    });
    const q = res.data;
    return {
      quoteId: (q.quoteId as string | null) ?? null,
      inMint: String(q.inputMint ?? params.inputMint),
      outMint: String(q.outputMint ?? params.outputMint),
      inAmount: String(q.inAmount ?? params.amount),
      outAmount: String(q.outAmount ?? ""),
      slippageBps: Number(q.slippageBps ?? params.slippageBps),
      priceImpactPct: q.priceImpactPct !== undefined && q.priceImpactPct !== null ? Number(q.priceImpactPct) : null,
      routeLegs: Array.isArray(q.routePlan) ? (q.routePlan as unknown[]).length : 0,
      raw: q,
    };
  }

  /**
   * Swap API V2 — step 1: create an order. Returns an unsigned transaction
   * that MUST be signed client-side by the user's own wallet. The platform
   * never holds signing material. Only reachable after the release gate lifts.
   */
  async createSwapOrder(params: {
    inputMint: string;
    outputMint: string;
    amount: string; // raw integer (adjusted for decimals)
    slippageBps: number;
    user: string; // user's wallet pubkey (base58) — signing happens in their wallet
  }): Promise<{ orderId: string | null; inAmount: string; outAmount: string; transactionBase64: string; raw: unknown }> {
    const res = await this.provider.fetch(
      {
        url: `${SWAP_V2_ROOT}/order`,
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inputMint: params.inputMint,
            outputMint: params.outputMint,
            amount: params.amount,
            slippageBps: params.slippageBps,
            user: params.user,
          }),
        },
        timeoutMs: 15_000,
      },
      (raw) => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("expected order object");
        const o = raw as Record<string, unknown>;
        if (typeof o.transaction !== "string" || o.transaction.length === 0) {
          throw new Error("order response missing unsigned transaction");
        }
        return o;
      }
    );
    const o = res.data;
    return {
      orderId: typeof o.id === "string" ? o.id : null,
      inAmount: String(o.inAmount ?? params.amount),
      outAmount: String(o.outAmount ?? ""),
      transactionBase64: String(o.transaction),
      raw: o,
    };
  }

  /**
   * Swap API V2 — step 2: execute a wallet-signed transaction. Jupiter
   * submits to the network and returns the signature; status stays UNCERTAIN
   * until confirmed onchain. Only reachable after the release gate lifts.
   */
  async executeSwapOrder(params: {
    signedTransactionBase64: string;
  }): Promise<{ signature: string | null; status: string; raw: unknown }> {
    const res = await this.provider.fetch(
      {
        url: `${SWAP_V2_ROOT}/execute`,
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signedTransaction: params.signedTransactionBase64 }),
        },
        timeoutMs: 30_000,
      },
      (raw) => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("expected execute object");
        return raw as Record<string, unknown>;
      }
    );
    const e = res.data;
    const signature = typeof e.signature === "string" ? e.signature : null;
    const status = typeof e.status === "string" ? e.status : signature ? "Success" : "Failed";
    return { signature, status, raw: e };
  }
}
