import { z } from "zod";
import { handler, ok, ApiHttpError } from "@/lib/contracts/http";
import { requireAuth, requireWorkspaceRole } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { assertPlanAllows } from "@/lib/domain/billing/entitlements";
import {
  createInvitation,
  assertInviteRoleAllowed,
  WORKSPACE_ROLE_VALUES,
} from "@/lib/domain/workspaces/invitations";

const CreateSchema = z.object({
  email: z.string().email().max(320),
  role: z.enum(WORKSPACE_ROLE_VALUES),
});

/** Creates an invitation for the *active* workspace. Workspace [id] must be
 * the caller's active workspace (multi-tenant guard), and the caller needs an
 * ADMIN (or OWNER) workspace role. */
export const POST = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();
  const id = req.nextUrl.pathname.split("/")[4];
  if (!id) throw new ApiHttpError("VALIDATION_FAILED", "Workspace id required.", false);
  if (id !== ctx.workspaceId) {
    throw new ApiHttpError("FORBIDDEN", "Resource belongs to a different workspace.", false);
  }
  requireWorkspaceRole(ctx, "ADMIN");

  // Seat limit: active memberships + pending (unaccepted, unexpired, unrevoked)
  // invitations must stay below the plan's seats entitlement.
  //
  // NOTE (accepted TOCTOU): the count above and the invitation creation below
  // are not atomic — two concurrent ADMIN requests can both pass the check and
  // jointly overshoot the seat cap by their respective counts. Closing it
  // properly requires a serializable transaction (or a counted seats column
  // with a conditional UPDATE). Accepted for now because the blast radius is a
  // one-seat overshoot within a paying workspace, seats are reclaimed on
  // revoke/expiry, and the 402 contract here is byte-identical either way.
  // If seat accuracy ever becomes billing-critical, wrap the count+create in
  // a serializable transaction.
  const seats = await assertPlanAllows(ctx, "seats");
  if (seats !== -1) {
    const [memberCount, pendingInvites] = await Promise.all([
      db.membership.count({ where: { workspaceId: ctx.workspaceId } }),
      db.membershipInvitation.count({
        where: { workspaceId: ctx.workspaceId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      }),
    ]);
    if (memberCount + pendingInvites >= seats) {
      throw new ApiHttpError(
        "PAYMENT_REQUIRED",
        "Workspace seat limit reached for your plan. Upgrade to invite more members.",
        false,
        { limit: seats, used: memberCount + pendingInvites },
      );
    }
  }

  const parsed = CreateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new ApiHttpError("VALIDATION_FAILED", "A valid email and role (OWNER|ADMIN|ANALYST|VIEWER) are required.", false);
  }
  assertInviteRoleAllowed(ctx.workspaceRole, parsed.data.role);

  const workspace = await db.workspace.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!workspace) throw new ApiHttpError("NOT_FOUND", "Workspace not found.", false);

  const result = await createInvitation({
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    email: parsed.data.email,
    role: parsed.data.role,
    createdById: ctx.userId,
  });

  return { payload: ok(result, requestId), status: 201 };
});
