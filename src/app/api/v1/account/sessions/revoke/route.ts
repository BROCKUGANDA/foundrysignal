import { z } from "zod";
import { cookies } from "next/headers";
import { handler, ok, ApiHttpError } from "@/lib/contracts/http";
import { requireAuth } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { recordAudit } from "@/lib/domain/shared/audit";

const BodySchema = z.object({
  sessionId: z.string().min(1).max(64),
});

/** Revokes one of the caller's sessions. Revoking the current session also
 * clears the session cookie. */
export const POST = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new ApiHttpError("VALIDATION_FAILED", "sessionId is required.", false);
  }

  const session = await db.session.findUnique({ where: { id: parsed.data.sessionId } });
  if (!session || session.userId !== ctx.userId) {
    throw new ApiHttpError("NOT_FOUND", "Session not found.", false);
  }

  if (!session.revokedAt) {
    await db.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
  }

  const isCurrent = session.id === ctx.session.sessionId;
  if (isCurrent) {
    const jar = await cookies();
    jar.delete(SESSION_COOKIE);
  }

  await recordAudit({
    actorId: ctx.userId,
    action: "ACCOUNT_SESSION_REVOKE",
    targetType: "SESSION",
    targetId: session.id,
    summary: isCurrent ? "Current session revoked (signed out)" : "Session revoked",
  });

  return { payload: ok({ revoked: true, current: isCurrent }, requestId) };
});
