import { handler, ok, ApiHttpError } from "@/lib/contracts/http";
import { requireAuth, requireWorkspaceRole } from "@/lib/auth/context";
import { listPendingInvitations } from "@/lib/domain/workspaces/invitations";

/** Lists pending invitations for the caller's active workspace (ADMIN+). */
export const GET = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();
  const workspace = req.nextUrl.searchParams.get("workspace");
  if (!workspace) {
    throw new ApiHttpError("VALIDATION_FAILED", "workspace query parameter is required.", false);
  }
  if (workspace !== ctx.workspaceId) {
    throw new ApiHttpError("FORBIDDEN", "Resource belongs to a different workspace.", false);
  }
  requireWorkspaceRole(ctx, "ADMIN");

  const invitations = await listPendingInvitations(workspace);
  return { payload: ok({ invitations }, requestId) };
});
