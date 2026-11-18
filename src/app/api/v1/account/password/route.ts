import { z } from "zod";
import { handler, ok, ApiHttpError } from "@/lib/contracts/http";
import { requireAuth } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { verifyPassword, hashPassword } from "@/lib/auth/session";
import { recordAudit } from "@/lib/domain/shared/audit";

const BodySchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(10, "Password must be at least 10 characters.").max(200),
});

/** Changes the caller's password. Verifies the current password, enforces the
 * minimum length, stores the new hash, and revokes every other session
 * (the current one is kept). */
export const POST = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    const issue = parsed.error?.issues?.[0]?.message ?? "Current password and a new password of at least 10 characters are required.";
    throw new ApiHttpError("VALIDATION_FAILED", issue, false);
  }

  const user = await db.user.findUnique({ where: { id: ctx.userId }, select: { passwordHash: true } });
  if (!user) throw new ApiHttpError("UNAUTHENTICATED", "Session is no longer valid.", false);

  const valid = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!valid) {
    throw new ApiHttpError("UNAUTHENTICATED", "Current password is incorrect.", false);
  }

  await db.user.update({
    where: { id: ctx.userId },
    data: { passwordHash: await hashPassword(parsed.data.newPassword) },
  });

  const revoked = await db.session.updateMany({
    where: { userId: ctx.userId, revokedAt: null, id: { not: ctx.session.sessionId } },
    data: { revokedAt: new Date() },
  });

  await recordAudit({
    actorId: ctx.userId,
    action: "ACCOUNT_PASSWORD_CHANGE",
    targetType: "USER",
    targetId: ctx.userId,
    summary: `Password changed; ${revoked.count} other session(s) revoked`,
  });

  return { payload: ok({ ok: true, otherSessionsRevoked: revoked.count }, requestId) };
});
