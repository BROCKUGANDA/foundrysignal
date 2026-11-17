import { handler, ok, ApiHttpError } from "@/lib/contracts/http";
import { requireAuth } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { getTradingReadiness, REVIEW_GATE_KEYS } from "@/lib/domain/trading/gates";
import { recordAudit } from "@/lib/domain/shared/audit";
import { JupiterAdapter } from "@/lib/providers/jupiter";
import { SolanaAdapter, isValidSolanaAddress } from "@/lib/providers/solana";
import { ProviderError } from "@/lib/providers/framework";
import { z } from "zod";

const bodySchema = z.object({
  intentId: z.string().min(1),
  walletAddress: z.string().min(32).max(64),
  signedTransaction: z.string().min(256).max(8192),
});

/**
 * Execution endpoint. Refuses with EXECUTION_GATED unless every release gate
 * is APPROVED, the kill switch is CLEAR and TRADING_ENABLED=true. While gated
 * this route is a hard no-op: no provider calls, nothing signed or submitted.
 *
 * Post-gate pipeline (unreachable until all conditions pass):
 *   1. load the caller's ORDER_INTENT record (session + tenant bound),
 *   2. submit the CLIENT-signed transaction to Jupiter Swap V2 /execute —
 *      signing always happened in the user's own wallet; the platform never
 *      holds signing material,
 *   3. record the signature and resolve onchain status to CONFIRMED/UNCERTAIN,
 *      never silently assume success.
 */
export const POST = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();
  const readiness = await getTradingReadiness();

  if (!readiness.executionAllowed) {
    throw new ApiHttpError("EXECUTION_GATED", `Trading execution is disabled — ${readiness.blockReason}.`, false, {
      readiness,
      pendingGates: REVIEW_GATE_KEYS,
    });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiHttpError("BAD_REQUEST", "Execution requires intentId, walletAddress and signedTransaction (base64).", false);
  }
  const { intentId, walletAddress, signedTransaction } = parsed.data;
  if (!isValidSolanaAddress(walletAddress)) {
    throw new ApiHttpError("BAD_REQUEST", "walletAddress must be a valid Solana address.", false);
  }

  const intent = await db.transactionRecord.findUnique({ where: { id: intentId } });
  if (!intent || intent.userId !== ctx.userId || intent.kind !== "ORDER_INTENT") {
    throw new ApiHttpError("NOT_FOUND", "Order intent not found for this account.", false);
  }
  // Only a fresh, unconsumed, unexpired intent can execute. Consumed, failed
  // and stale-quote intents are rejected before any provider call (F-4).
  if (intent.status !== "GATED_EXECUTION_DISABLED" && intent.status !== "INTENT_RECORDED") {
    throw new ApiHttpError("CONFLICT", `Order intent is not executable (status ${intent.status}).`, false);
  }
  if (intent.quoteExpiresAt && intent.quoteExpiresAt.getTime() < Date.now()) {
    throw new ApiHttpError("QUOTE_EXPIRED", "Order intent quote has expired — record a fresh order intent.", false);
  }
  // Atomic claim (F-4): the conditional updateMany is the concurrency guard.
  // Exactly ONE concurrent caller wins the transition ORDER_INTENT → SWAP;
  // every other caller loses (count 0 → conflict) and can never double-submit.
  const claim = await db.transactionRecord.updateMany({
    where: { id: intent.id, userId: ctx.userId, kind: "ORDER_INTENT", status: { in: ["GATED_EXECUTION_DISABLED", "INTENT_RECORDED"] } },
    data: { kind: "SWAP", status: "SUBMITTED" },
  });
  if (claim.count !== 1) {
    throw new ApiHttpError("CONFLICT", "Order intent was already consumed by another execution attempt.", false);
  }

  const jup = new JupiterAdapter();
  let execution;
  try {
    execution = await jup.executeSwapOrder({ signedTransactionBase64: signedTransaction });
  } catch (err) {
    if (err instanceof ProviderError) {
      await db.transactionRecord.update({
        where: { id: intent.id },
        data: { status: "FAILED", failureReason: `Provider execution failed (${err.kind}): ${err.message}` },
      });
      throw new ApiHttpError("PROVIDER_UNAVAILABLE", `Execution provider unavailable (${err.kind}). No funds moved by this call.`, err.retryable);
    }
    // Unknown failure: release the claim to FAILED so the intent is auditable.
    await db.transactionRecord.update({
      where: { id: intent.id },
      data: { status: "FAILED", failureReason: `Execution aborted before submission: ${String(err)}` },
    }).catch(() => undefined);
    throw err;
  }

  // Resolve onchain status immediately; anything unconfirmed stays UNCERTAIN.
  let status: string = "UNCERTAIN";
  let confirmationError: string | null = null;
  if (execution.signature && execution.status === "Success") {
    try {
      const solana = new SolanaAdapter();
      const confirm = await solana.getSignatureStatus(execution.signature);
      status = confirm.err ? "FAILED" : confirm.confirmed ? "CONFIRMED" : "UNCERTAIN";
      confirmationError = confirm.err ? JSON.stringify(confirm.err) : null;
    } catch {
      status = "UNCERTAIN"; // confirmation probe failed — record stays UNCERTAIN, never fabricated
    }
  } else {
    status = "FAILED";
    confirmationError = execution.status;
  }

  const record = await db.transactionRecord.update({
    where: { id: intent.id },
    data: {
      status,
      signature: execution.signature,
      failureReason: status === "FAILED" ? `Execution ${execution.status}${confirmationError ? `: ${confirmationError}` : ""}` : null,
    },
  });

  await recordAudit({
    actorId: ctx.userId,
    action: "TRADING_EXECUTION",
    targetType: "TransactionRecord",
    targetId: record.id,
    summary: `Swap execution ${status}${execution.signature ? ` · sig ${execution.signature.slice(0, 16)}…` : ""}`,
    metadata: { intentId, walletAddress, providerStatus: execution.status, signature: execution.signature },
  });

  return {
    payload: ok(
      {
        recordId: record.id,
        status: record.status,
        signature: record.signature,
        failureReason: record.failureReason,
        note:
          "Onchain outcomes are recorded honestly: CONFIRMED only after onchain confirmation, UNCERTAIN when the network has not confirmed, FAILED with the provider-reported reason.",
      },
      requestId
    ),
  };
});
