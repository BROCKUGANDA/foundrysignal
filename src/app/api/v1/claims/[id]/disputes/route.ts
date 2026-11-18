import { z } from "zod";
import { handler, ok, ApiHttpError } from "@/lib/contracts/http";
import { requireAuth, requireWorkspaceRole } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/domain/shared/audit";

const BodySchema = z.object({
  kind: z.enum(["DISPUTE", "CORRECTION", "FOUNDER_RESPONSE"]).default("DISPUTE"),
  statement: z.string().min(8, "Provide at least a sentence of detail.").max(4000),
});

/** Raises a dispute/correction against a claim. Any authenticated ANALYST+
 * workspace role may raise — VIEWERs may not. */
export const POST = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();
  requireWorkspaceRole(ctx, "ANALYST");

  const claimId = req.nextUrl.pathname.split("/")[4];
  if (!claimId) throw new ApiHttpError("VALIDATION_FAILED", "Claim id required.", false);

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    const issue = parsed.error?.issues?.[0]?.message ?? "A statement of at least 8 characters is required.";
    throw new ApiHttpError("VALIDATION_FAILED", issue, false);
  }

  const claim = await db.claim.findUnique({ where: { id: claimId }, select: { id: true, ventureId: true } });
  if (!claim) throw new ApiHttpError("NOT_FOUND", "Claim not found.", false);

  const dispute = await db.disputeRecord.create({
    data: {
      workspaceId: ctx.workspaceId,
      ventureId: claim.ventureId,
      claimId: claim.id,
      raisedById: ctx.userId,
      kind: parsed.data.kind,
      statement: parsed.data.statement,
      resolution: "OPEN",
    },
  });

  await recordAudit({
    actorId: ctx.userId,
    action: "DISPUTE_RAISE",
    targetType: "CLAIM",
    targetId: claim.id,
    summary: `${parsed.data.kind} raised against claim ${claim.id.slice(0, 8)}…`,
    metadata: { disputeId: dispute.id, kind: parsed.data.kind, ventureId: claim.ventureId },
  });

  return { payload: ok({ disputeId: dispute.id, resolution: dispute.resolution }, requestId), status: 201 };
});
