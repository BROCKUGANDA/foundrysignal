import { z } from "zod";
import { handler, ok, ApiHttpError } from "@/lib/contracts/http";
import { requireAuth, requirePlatformRole } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/domain/shared/audit";

const PatchSchema = z.object({
  resolution: z.enum(["UPHELD", "RESOLVED", "REJECTED"]),
  resolutionNote: z.string().max(2000).optional(),
});

/** Marks a dispute UPHELD/RESOLVED/REJECTED. MODERATOR+. Audit-logged. */
export const PATCH = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();
  await requirePlatformRole(ctx, ["MODERATOR", "PLATFORM_ADMIN"]);

  const id = req.nextUrl.pathname.split("/")[5];
  if (!id) throw new ApiHttpError("VALIDATION_FAILED", "Dispute id required.", false);

  const parsed = PatchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new ApiHttpError("VALIDATION_FAILED", "resolution must be one of UPHELD|RESOLVED|REJECTED.", false);
  }

  const dispute = await db.disputeRecord.findUnique({ where: { id } });
  if (!dispute) throw new ApiHttpError("NOT_FOUND", "Dispute not found.", false);

  const updated = await db.disputeRecord.update({
    where: { id: dispute.id },
    data: {
      resolution: parsed.data.resolution,
      resolutionNote: parsed.data.resolutionNote ?? dispute.resolutionNote,
      resolvedAt: new Date(),
    },
  });

  await recordAudit({
    actorId: ctx.userId,
    action: "DISPUTE_RESOLVE",
    targetType: "DISPUTE",
    targetId: dispute.id,
    summary: `Dispute ${parsed.data.resolution.toLowerCase()} (${dispute.kind})`,
    metadata: { claimId: dispute.claimId, resolution: parsed.data.resolution },
  });

  return {
    payload: ok(
      {
        id: updated.id,
        resolution: updated.resolution,
        resolutionNote: updated.resolutionNote,
        resolvedAt: updated.resolvedAt?.toISOString() ?? null,
      },
      requestId
    ),
  };
});
