import { handler, ok, ApiHttpError } from "@/lib/contracts/http";
import { requireAuth, requireWorkspaceRole } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { revokeInvitation } from "@/lib/domain/workspaces/invitations";

/** Revokes a pending invitation in the caller's active workspace (ADMIN+). */
export const DELETE = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();
  const id = req.nextUrl.pathname.split("/")[4];
  if (!id) throw new ApiHttpError("VALIDATION_FAILED", "Invitation id required.", false);

  const invitation = await db.membershipInvitation.findUnique({ where: { id }, select: { workspaceId: true } });
  if (!invitation || invitation.workspaceId !== ctx.workspaceId) {
    throw new ApiHttpError("NOT_FOUND", "Invitation not found.", false);
  }
  requireWorkspaceRole(ctx, "ADMIN");

  const result = await revokeInvitation({ invitationId: id, workspaceId: ctx.workspaceId, actorId: ctx.userId });
  return { payload: ok(result, requestId) };
});
