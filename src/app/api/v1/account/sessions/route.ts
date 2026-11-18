import { handler, ok } from "@/lib/contracts/http";
import { requireAuth } from "@/lib/auth/context";
import { listSessions, revokeOtherSessions } from "@/lib/auth/service";
import { recordAudit } from "@/lib/domain/shared/audit";

/** Lists the caller's active sessions (no token material is ever returned). */
export const GET = handler(async ({ requestId }) => {
  const ctx = await requireAuth();
  const sessions = await listSessions(ctx.userId, ctx.session.sessionId);
  return { payload: ok({ sessions, currentId: ctx.session.sessionId }, requestId) };
});

/**
 * Bulk revoke. Body `{ exceptCurrent?: boolean }` (default true): revoke
 * every session except the one issuing the request. `exceptCurrent: false`
 * revokes all of the caller's sessions, including this one.
 */
export const DELETE = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();
  const body = await req.json().catch(() => ({}));
  const exceptCurrent = body?.exceptCurrent !== false;
  const count = await revokeOtherSessions(ctx.userId, ctx.session.sessionId, exceptCurrent);
  await recordAudit({
    actorId: ctx.userId,
    action: "SESSION_REVOKE_OTHERS",
    targetType: "USER",
    targetId: ctx.userId,
    summary: `Revoked ${count} session(s)${exceptCurrent ? " (others only)" : " (all)"}`,
  });
  return { payload: ok({ revoked: count }, requestId) };
});
