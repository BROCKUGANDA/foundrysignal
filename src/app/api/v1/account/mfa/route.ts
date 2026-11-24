import { handler, ok } from "@/lib/contracts/http";
import { requireAuth } from "@/lib/auth/context";
import { getMfaStatus } from "@/lib/auth/mfa";

/** The caller's own second-factor status. Never reveals the secret. */
export const GET = handler(async ({ requestId }) => {
  const ctx = await requireAuth();
  return { payload: ok(await getMfaStatus(ctx.userId), requestId) };
});
