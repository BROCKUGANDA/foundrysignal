import { handler, ok } from "@/lib/contracts/http";
import { requireAuth } from "@/lib/auth/context";
import { revokeSession } from "@/lib/auth/service";
import { recordAudit } from "@/lib/domain/shared/audit";

/** Revokes one of the caller's sessions by id. */
export const DELETE = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();
  // /api/v1/account/sessions/<id>
  const id = req.nextUrl.pathname.split("/").filter(Boolean).pop();
  if (!id) return { payload: ok({ revoked: false }, requestId), status: 400 };
  const revoked = await revokeSession(ctx.userId, id);
  if (revoked) {
    await recordAudit({
      actorId: ctx.userId,
      action: "SESSION_REVOKE",
      targetType: "SESSION",
      targetId: id,
      summary: `Revoked session ${id}`,
    });
  }
  return { payload: ok({ revoked }, requestId) };
});
