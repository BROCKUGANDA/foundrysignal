import { handler, ok, ApiHttpError } from "@/lib/contracts/http";
import { requireAuth, requirePlatformRole } from "@/lib/auth/context";
import { decideGate, ensureTradingGates, getTradingReadiness, KILL_SWITCH_KEY } from "@/lib/domain/trading/gates";
import { z } from "zod";

const patchSchema = z.object({
  key: z.string().min(1).max(64),
  state: z.string().min(1).max(32),
  decisionNotes: z.string().min(3).max(2000),
});

/** Review-gate management: list current states + computed readiness. */
export const GET = handler(async ({ requestId }) => {
  const ctx = await requireAuth();
  await requirePlatformRole(ctx, ["PLATFORM_ADMIN"]);
  await ensureTradingGates();
  return { payload: ok(await getTradingReadiness(), requestId) };
});

/**
 * Apply a gate decision (approve/reject/review) or toggle the kill switch.
 * PLATFORM_ADMIN only; notes mandatory; every decision is audit-logged.
 * Execution additionally requires TRADING_ENABLED=true — recorded human
 * review and the operator env flag are independent conditions by design.
 */
export const PATCH = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();
  await requirePlatformRole(ctx, ["PLATFORM_ADMIN"]);
  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.parse(body);

  if (parsed.key !== KILL_SWITCH_KEY) {
    const valid = ["PRODUCT_REVIEW", "LEGAL_JURISDICTION_REVIEW", "PROVIDER_INTEGRATION_REVIEW", "SECURITY_REVIEW"];
    if (!valid.includes(parsed.key)) {
      throw new ApiHttpError("NOT_FOUND", `Unknown gate key: ${parsed.key}`, false);
    }
    if (!["NOT_STARTED", "IN_REVIEW", "APPROVED", "REJECTED"].includes(parsed.state)) {
      throw new ApiHttpError("BAD_REQUEST", `Invalid gate state: ${parsed.state}`, false);
    }
  } else if (!["CLEAR", "ENGAGED"].includes(parsed.state)) {
    throw new ApiHttpError("BAD_REQUEST", "Kill switch state must be CLEAR or ENGAGED.", false);
  }

  try {
    const gate = await decideGate({
      key: parsed.key,
      state: parsed.state,
      decisionNotes: parsed.decisionNotes,
      adminUserId: ctx.userId,
    });
    return { payload: ok({ gate, readiness: await getTradingReadiness() }, requestId) };
  } catch (err) {
    const code = (err as Error & { code?: string }).code;
    if (code === "INVALID_TRANSITION" || code === "NOT_FOUND") {
      throw new ApiHttpError("INVALID_TRANSITION" , (err as Error).message, false);
    }
    throw err;
  }
});
