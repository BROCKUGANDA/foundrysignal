import { handler, ok, ApiHttpError } from "@/lib/contracts/http";
import { requireAuth } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { JupiterAdapter } from "@/lib/providers/jupiter";
import { z } from "zod";

const SOL_MINT = "So11111111111111111111111111111111111111112";

export const GET = handler(async ({ requestId }) => {
  await requireAuth();
  // Real market snapshots from the registry, newest per token
  const tokens = await db.tokenAsset.findMany({ include: { venture: { select: { name: true, slug: true } }, marketSnapshots: { orderBy: { asOf: "desc" }, take: 1 } } });
  const jup = new JupiterAdapter();
  const mints = tokens.map((t) => t.mint);
  const prices = mints.length > 0 ? await jup.getPrices(mints.slice(0, 50)).catch(() => null) : null;
  return {
    payload: ok(
      tokens.map((t) => ({
        mint: t.mint,
        symbol: t.symbol,
        name: t.name,
        venture: t.venture,
        association: t.association,
        decimals: t.decimals,
        supply: t.supply,
        latestSnapshot: t.marketSnapshots[0]
          ? { priceUsd: t.marketSnapshots[0].priceUsd, liquidityUsd: t.marketSnapshots[0].liquidityUsd, asOf: t.marketSnapshots[0].asOf.toISOString(), provider: t.marketSnapshots[0].provider }
          : null,
        live: prices ? { priceUsd: prices[t.mint]?.usdPrice ?? null, liquidityUsd: prices[t.mint]?.liquidityUsd ?? null, asOf: prices[t.mint]?.asOf.toISOString() ?? null } : null,
      })),
      requestId
    ),
  };
});

/** Quote preview — REAL Jupiter quotes. Execution is gated OFF. */
export const POST = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();
  const body = await req.json().catch(() => ({}));
  const parsed = z
    .object({
      inputMint: z.string().min(32).max(64),
      outputMint: z.string().min(32).max(64),
      amount: z.string().regex(/^\d+$/, "Amount must be a raw integer string"),
      slippageBps: z.number().int().min(0).max(3000).default(50),
    })
    .parse(body);

  const jup = new JupiterAdapter();
  const quote = await jup.getQuote({
    inputMint: parsed.inputMint,
    outputMint: parsed.outputMint,
    amount: parsed.amount,
    slippageBps: parsed.slippageBps,
  });

  // Record the quote as a QUOTE_PREVIEW transaction record (never auto-executed)
  const record = await db.transactionRecord.create({
    data: {
      userId: ctx.userId,
      kind: "QUOTE_PREVIEW",
      status: "QUOTED",
      inputMint: quote.inMint,
      outputMint: quote.outMint,
      inAmount: quote.inAmount,
      outAmount: quote.outAmount,
      slippageBps: quote.slippageBps,
      priceImpactPct: quote.priceImpactPct,
      quoteId: quote.quoteId,
      quoteExpiresAt: new Date(Date.now() + 45_000), // quotes are short-lived
    },
  });

  return {
    payload: ok(
      {
        recordId: record.id,
        quoteId: quote.quoteId,
        inMint: quote.inMint,
        outMint: quote.outMint,
        inAmount: quote.inAmount,
        outAmount: quote.outAmount,
        slippageBps: quote.slippageBps,
        priceImpactPct: quote.priceImpactPct,
        expiresAt: record.quoteExpiresAt?.toISOString(),
        execution: {
          allowed: false,
          code: "EXECUTION_GATED",
          note: "Execution is disabled pending product, jurisdiction, provider and security review. Quotes are provided for research preview only.",
        },
      },
      requestId
    ),
    status: 200,
  };
});
