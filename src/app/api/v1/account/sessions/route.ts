import { handler, ok } from "@/lib/contracts/http";
import { requireAuth } from "@/lib/auth/context";
import { db } from "@/lib/db";

/** Lists the caller's live (unrevoked, unexpired) sessions.
 * Device/user-agent is not captured by this deployment's Session model, so
 * the UI labels sessions by creation/activity time instead of fabricating a
 * device string. */
export const GET = handler(async ({ requestId }) => {
  const ctx = await requireAuth();

  const sessions = await db.session.findMany({
    where: { userId: ctx.userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      lastSeenAt: true,
      expiresAt: true,
      activeWsId: true,
    },
  });

  return {
    payload: ok(
      sessions.map((s) => ({
        id: s.id,
        createdAt: s.createdAt.toISOString(),
        lastActiveAt: s.lastSeenAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        activeWorkspaceId: s.activeWsId,
        current: s.id === ctx.session.sessionId,
      })),
      requestId
    ),
  };
});
