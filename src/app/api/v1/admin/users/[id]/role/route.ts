import { z } from "zod";
import { handler, ok, ApiHttpError } from "@/lib/contracts/http";
import { requireAuth, requirePlatformRole } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/domain/shared/audit";
import { PLATFORM_ROLES } from "@/lib/contracts/api";

const PatchSchema = z.object({
  platformRole: z.enum(PLATFORM_ROLES),
});

/** Changes a user's platform role. PLATFORM_ADMIN only. Refuses to demote the
 * last remaining PLATFORM_ADMIN. Audit-logged. */
export const PATCH = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();
  await requirePlatformRole(ctx, ["PLATFORM_ADMIN"]);

  const id = req.nextUrl.pathname.split("/")[5];
  if (!id) throw new ApiHttpError("VALIDATION_FAILED", "User id required.", false);

  const parsed = PatchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new ApiHttpError("VALIDATION_FAILED", "platformRole must be one of USER|MODERATOR|PLATFORM_ADMIN.", false);
  }
  const next = parsed.data.platformRole;

  const target = await db.user.findUnique({ where: { id } });
  if (!target || target.status === "DELETED") {
    throw new ApiHttpError("NOT_FOUND", "User not found.", false);
  }

  if (target.platformRole === "PLATFORM_ADMIN" && next !== "PLATFORM_ADMIN") {
    const admins = await db.user.count({ where: { platformRole: "PLATFORM_ADMIN", status: "ACTIVE" } });
    if (admins <= 1) {
      throw new ApiHttpError("CONFLICT", "Refusing to demote the last PLATFORM_ADMIN.", false);
    }
  }

  const updated = await db.user.update({ where: { id: target.id }, data: { platformRole: next } });

  await recordAudit({
    actorId: ctx.userId,
    action: "ADMIN_PLATFORM_ROLE",
    targetType: "USER",
    targetId: target.id,
    summary: `Platform role changed ${target.platformRole} → ${next} (${target.email})`,
    metadata: { from: target.platformRole, to: next },
  });

  return { payload: ok({ id: updated.id, email: updated.email, platformRole: updated.platformRole }, requestId) };
});
