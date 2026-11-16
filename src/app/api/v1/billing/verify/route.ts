import { handler, ok } from "@/lib/contracts/http";
import { requireAuth } from "@/lib/auth/context";
import { z } from "zod";
import { verifyCheckoutIntent } from "@/lib/domain/billing/crypto";

/**
 * Verification endpoint for USDC checkout. The client polls this after the
 * payer reports sending funds; the server reads the chain and only ever grants
 * an entitlement for a matching transfer that actually reached the platform
 * wallet with the intent's memo attached.
 */
export const POST = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();
  const body = z
    .object({ memo: z.string().min(4).max(64) })
    .parse(await req.json().catch(() => ({})));

  const result = await verifyCheckoutIntent({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    memo: body.memo,
  });

  return { payload: ok(result, requestId), status: 200 };
});
