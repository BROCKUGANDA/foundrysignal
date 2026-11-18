import { handler, ok } from "@/lib/contracts/http";
import { requireAuth } from "@/lib/auth/context";
import { requestEmailVerification } from "@/lib/auth/service";

/** Re-sends the verification email for the signed-in user. No-auth enumeration risk: requires session. */
export const POST = handler(async ({ requestId }) => {
  const ctx = await requireAuth();
  const result = await requestEmailVerification(ctx.userId);
  return { payload: ok({ sent: true, delivered: result.delivered, reason: result.reason ?? null }, requestId) };
});
