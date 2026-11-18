import { handler, ok, ApiHttpError } from "@/lib/contracts/http";
import { requireAuth } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { getTradingReadiness } from "@/lib/domain/trading/gates";
import { JupiterAdapter } from "@/lib/providers/jupiter";
import { ProviderError } from "@/lib/providers/framework";
import { isValidSolanaAddress } from "@/lib/providers/solana";
import { z } from "zod";

const bodySchema = z.object({
  inputMint: z.string().min(32).max(64),
  outputMint: z.string().min(32).max(64),
  amount: z.string().regex(/^\d+$/, "Amount must be a raw integer string").max(30),
  slippageBps: z.number().int().min(0).max(3000).default(50),
});

interface IntentShape {
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

function toIntent(r: {
  id: string; kind: string; status: string; inputMint: string | null; outputMint: string | null;
  inAmount: string | null; outAmount: string | null; slippageBps: number | null; priceImpactPct: number | null;
  quoteExpiresAt: Date | null; failureReason: string | null; createdAt: Date;
}): IntentShape {
  return {
    id: r.id,
    kind: r.kind,
    status: r.status,
    inputMint: r.inputMint,
    outputMint: r.outputMint,
    inAmount: r.inAmount,
    outAmount: r.outAmount,
    slippageBps: r.slippageBps,
    priceImpactPct: r.priceImpactPct,
    quoteExpiresAt: r.quoteExpiresAt?.toISOString() ?? null,
    failureReason: r.failureReason,
    createdAt: r.createdAt.toISOString(),
  };
}

/** List the caller's own order intents (gated records — never executions). */
export const GET = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();
  const rows = await db.transactionRecord.findMany({
    where: { userId: ctx.userId, kind: "ORDER_INTENT" },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return { payload: ok({ items: rows.map(toIntent), readiness: await getTradingReadiness() }, requestId) };
});

/**
 * Create an order INTENT. Fetches a REAL Jupiter quote, persists the intent
 * with status GATED_EXECUTION_DISABLED and returns the current readiness.
 * No order is created at the provider; no transaction is ever signed or sent.
 */
export const POST = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();
  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.parse(body);

  if (!isValidSolanaAddress(parsed.inputMint) || !isValidSolanaAddress(parsed.outputMint)) {
    throw new ApiHttpError("BAD_REQUEST", "Input and output mints must be valid Solana addresses.", false);
  }
  if (parsed.inputMint === parsed.outputMint) {
    throw new ApiHttpError("BAD_REQUEST", "Input and output mints must differ.", false);
  }

  // Real quote first — honest provider failures are surfaced, never hidden.
  const jup = new JupiterAdapter();
  let quote;
  try {
    quote = await jup.getQuote({
      inputMint: parsed.inputMint,
      outputMint: parsed.outputMint,
      amount: parsed.amount,
      slippageBps: parsed.slippageBps,
    });
  } catch (err) {
    if (err instanceof ProviderError) {
      throw new ApiHttpError(
        "PROVIDER_UNAVAILABLE",
        `Quote provider unavailable (${err.kind}). The order intent was NOT recorded — retry when the provider recovers.`,
        err.retryable
      );
    }
    throw err;
  }

  const readiness = await getTradingReadiness();
  const record = await db.transactionRecord.create({
    data: {
      userId: ctx.userId,
      kind: "ORDER_INTENT",
      status: readiness.executionAllowed ? "INTENT_RECORDED" : "GATED_EXECUTION_DISABLED",
      inputMint: quote.inMint,
      outputMint: quote.outMint,
      inAmount: quote.inAmount,
      outAmount: quote.outAmount,
      slippageBps: quote.slippageBps,
      priceImpactPct: quote.priceImpactPct,
      quoteId: quote.quoteId,
      quoteExpiresAt: new Date(Date.now() + 30_000), // quotes are short-lived; expiry recorded, never executed
      failureReason: readiness.executionAllowed
        ? null
        : `Execution disabled — ${readiness.blockReason}. Intent retained as a research record.`,
    },
  });

  return {
    payload: ok(
      {
        intent: toIntent(record),
        readiness,
        note:
          "Order intent recorded from a live Jupiter quote. While release gates are pending, intents are retained as records only — nothing is signed, submitted or executed.",
      },
      requestId
    ),
  };
});
