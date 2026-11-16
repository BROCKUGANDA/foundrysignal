import { handler, ok } from "@/lib/contracts/http";
import { requireAuth } from "@/lib/auth/context";
import { db } from "@/lib/db";

export const GET = handler(async ({ requestId }) => {
  const ctx = await requireAuth();
  const events = await db.alertEvent.findMany({
    where: { alert: { workspaceId: ctx.workspaceId } },
    include: { alert: { select: { kind: true, venture: { select: { name: true, slug: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return {
    payload: ok(
      events.map((e) => ({
        id: e.id,
        kind: e.alert.kind,
        venture: e.alert.venture,
        summary: e.summary,
        createdAt: e.createdAt.toISOString(),
        read: !!e.readAt,
      })),
      requestId
    ),
  };
});
