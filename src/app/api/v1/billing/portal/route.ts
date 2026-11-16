import { handler, ok } from "@/lib/contracts/http";
import { requireAuth, requireWorkspaceRole } from "@/lib/auth/context";
import { createPortalSession, resolveAllowedOrigin } from "@/lib/domain/billing/stripe";

// Financial actions require workspace ADMIN+ (F-10).
export const POST = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();
  requireWorkspaceRole(ctx, "ADMIN");

  const origin = resolveAllowedOrigin(req.headers.get("origin"), new URL(req.url).origin);
  const result = await createPortalSession({ workspaceId: ctx.workspaceId, origin, email: "" });
  return { payload: ok({ url: result.url, provider: "stripe" }, requestId), status: 200 };
});
