import { handler, ok } from "@/lib/contracts/http";
import { requireAuth, requireWorkspaceRole } from "@/lib/auth/context";
import { z } from "zod";
import { createCheckoutIntent } from "@/lib/domain/billing/crypto";

// Financial actions require workspace ADMIN+ (F-10): a VIEWER must never be
// able to start a purchase for the workspace.
//
// Checkout is onchain: the response carries the destination wallet, the exact
// USDC amount and the memo the payer must include. Nothing redirects to a
// third-party hosted page.
export const POST = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();
  requireWorkspaceRole(ctx, "ADMIN");

  const body = z
    .object({ planCode: z.string().min(2).max(32) })
    .parse(await req.json().catch(() => ({})));

  const intent = await createCheckoutIntent({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    planCode: body.planCode,
  });

  return { payload: ok({ provider: "usdc", ...intent }, requestId), status: 200 };
});
