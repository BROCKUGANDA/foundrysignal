import { handler, ok } from "@/lib/contracts/http";
import { requireAuth, requirePlatformRole } from "@/lib/auth/context";
import { db } from "@/lib/db";

const RESOLUTIONS = ["OPEN", "UPHELD", "RESOLVED", "REJECTED"] as const;

/** Lists disputes for the admin console (MODERATOR+). `resolution` query
 * param filters; defaults to OPEN. */
export const GET = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();
  await requirePlatformRole(ctx, ["MODERATOR", "PLATFORM_ADMIN"]);

  const raw = (req.nextUrl.searchParams.get("resolution") ?? "OPEN").toUpperCase();
  const resolution = (RESOLUTIONS as readonly string[]).includes(raw) ? raw : raw === "ALL" ? "ALL" : "OPEN";

  const disputes = await db.disputeRecord.findMany({
    where: resolution === "ALL" ? {} : { resolution },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const claimIds = [...new Set(disputes.map((d) => d.claimId).filter((v): v is string => !!v))];
  const claims = claimIds.length
    ? await db.claim.findMany({
        where: { id: { in: claimIds } },
        select: { id: true, statement: true, category: true, status: true, venture: { select: { name: true, slug: true } } },
      })
    : [];
  const claimMap = new Map(claims.map((c) => [c.id, c]));

  return {
    payload: ok(
      disputes.map((d) => {
        const claim = d.claimId ? claimMap.get(d.claimId) : undefined;
        return {
          id: d.id,
          kind: d.kind,
          statement: d.statement,
          resolution: d.resolution,
          resolutionNote: d.resolutionNote,
          createdAt: d.createdAt.toISOString(),
          resolvedAt: d.resolvedAt?.toISOString() ?? null,
          claimId: d.claimId,
          claimStatement: claim?.statement ?? null,
          claimCategory: claim?.category ?? null,
          claimStatus: claim?.status ?? null,
          ventureName: claim?.venture?.name ?? null,
          ventureSlug: claim?.venture?.slug ?? null,
        };
      }),
      requestId
    ),
  };
});
