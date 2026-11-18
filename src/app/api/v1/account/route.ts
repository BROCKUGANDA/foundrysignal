import { handler, ok } from "@/lib/contracts/http";
import { requireAuth, requireWorkspaceRole } from "@/lib/auth/context";
import { getAccountState, requestAccountDeletion, updateAccount } from "@/lib/auth/service";
import { ApiHttpError } from "@/lib/contracts/http";

export const GET = handler(async ({ requestId }) => {
  const ctx = await requireAuth();
  const state = await getAccountState(ctx.userId);
  return { payload: ok({ ...state, workspaceRole: ctx.workspaceRole, activeWorkspaceId: ctx.workspaceId }, requestId) };
});

/** Self-service profile update — name and registration persona only. */
export const PATCH = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();
  const body = await req.json().catch(() => ({}));
  const state = await updateAccount(ctx.userId, body);
  return { payload: ok({ ...state, workspaceRole: ctx.workspaceRole, activeWorkspaceId: ctx.workspaceId }, requestId) };
});

export const DELETE = handler(async ({ requestId }) => {
  const ctx = await requireAuth();
  await requestAccountDeletion(ctx.userId);
  return { payload: ok({ deleted: true }, requestId) };
});
