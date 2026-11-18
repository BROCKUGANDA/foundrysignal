import { z } from "zod";
import { handler, ok, ApiHttpError } from "@/lib/contracts/http";
import { requireAuth, requireWorkspaceRole } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/domain/shared/audit";
import { WORKSPACE_ROLE_VALUES } from "@/lib/domain/workspaces/invitations";

const PatchSchema = z.object({
  role: z.enum(WORKSPACE_ROLE_VALUES),
});

/**
 * Changes a member's workspace role in the active workspace.
 * - Caller must be OWNER or ADMIN of that workspace.
 * - OWNER may assign any role (subject to the last-OWNER guard).
 * - ADMIN may only manage members whose current role is ANALYST or VIEWER,
 *   and may only assign ANALYST or VIEWER — no escalation above caller rank.
 * - The workspace must always retain at least one OWNER.
 */
export const PATCH = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();
  const parts = req.nextUrl.pathname.split("/");
  const workspaceId = parts[4];
  const memberId = parts[6];
  if (!workspaceId || !memberId) {
    throw new ApiHttpError("VALIDATION_FAILED", "Workspace id and member id are required.", false);
  }
  if (workspaceId !== ctx.workspaceId) {
    throw new ApiHttpError("FORBIDDEN", "Resource belongs to a different workspace.", false);
  }
  requireWorkspaceRole(ctx, "ADMIN");

  const parsed = PatchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new ApiHttpError("VALIDATION_FAILED", "Role must be one of OWNER|ADMIN|ANALYST|VIEWER.", false);
  }
  const next = parsed.data.role;

  const membership = await db.membership.findUnique({ where: { id: memberId } });
  if (!membership || membership.workspaceId !== workspaceId) {
    throw new ApiHttpError("NOT_FOUND", "Membership not found.", false);
  }

  if (ctx.workspaceRole === "ADMIN") {
    if (membership.role !== "ANALYST" && membership.role !== "VIEWER") {
      throw new ApiHttpError("FORBIDDEN", "ADMIN can only manage ANALYST/VIEWER memberships.", false);
    }
    if (next !== "ANALYST" && next !== "VIEWER") {
      throw new ApiHttpError("FORBIDDEN", "ADMIN can only assign the ANALYST or VIEWER role.", false);
    }
  }

  if (membership.role === "OWNER" && next !== "OWNER") {
    const owners = await db.membership.count({ where: { workspaceId, role: "OWNER" } });
    if (owners <= 1) {
      throw new ApiHttpError("CONFLICT", "Refusing to demote the last OWNER of this workspace.", false);
    }
  }

  const updated = await db.membership.update({ where: { id: membership.id }, data: { role: next } });

  await recordAudit({
    actorId: ctx.userId,
    action: "WORKSPACE_MEMBERSHIP_ROLE",
    targetType: "MEMBERSHIP",
    targetId: membership.id,
    summary: `Membership role changed ${membership.role} → ${next}`,
    metadata: { workspaceId, userId: membership.userId, from: membership.role, to: next },
  });

  return { payload: ok({ id: updated.id, userId: updated.userId, workspaceId: updated.workspaceId, role: updated.role }, requestId) };
});
