import { handler, ok, ApiHttpError } from "@/lib/contracts/http";
import { requireAuth, requireWorkspaceRole } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { z } from "zod";

const CreateAlertSchema = z.object({
  ventureId: z.string().min(1),
  kind: z.enum(["RELEASE_PUBLISHED", "AUTHORITY_CHANGED", "EVIDENCE_CONTRADICTED", "REPO_ACTIVITY", "MARKET_MOVE"]),
  threshold: z.record(z.string(), z.unknown()).optional(),
});

export const GET = handler(async ({ requestId }) => {
  const ctx = await requireAuth();
  const alerts = await db.alert.findMany({
    where: { workspaceId: ctx.workspaceId },
    include: { venture: { select: { name: true, slug: true } }, events: { orderBy: { createdAt: "desc" }, take: 10 } },
    orderBy: { createdAt: "desc" },
  });
  return {
    payload: ok(
      alerts.map((a) => ({
        id: a.id,
        kind: a.kind,
        active: a.active,
        venture: a.venture,
        lastEvaluatedAt: a.lastEvaluatedAt?.toISOString() ?? null,
        events: a.events.map((e) => ({ id: e.id, summary: e.summary, createdAt: e.createdAt.toISOString(), readAt: e.readAt?.toISOString() ?? null })),
      })),
      requestId
    ),
  };
});

export const POST = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();
  requireWorkspaceRole(ctx, "ANALYST");
  const body = await req.json().catch(() => ({}));
  const parsed = CreateAlertSchema.parse(body);
  const venture = await db.venture.findUnique({ where: { id: parsed.ventureId } });
  if (!venture) throw new ApiHttpError("NOT_FOUND", "Venture not found.", false);
  const existing = await db.alert.count({ where: { workspaceId: ctx.workspaceId, ventureId: venture.id, kind: parsed.kind } });
  if (existing > 0) throw new ApiHttpError("CONFLICT", "An alert of this kind already exists for this venture.", false);
  const alert = await db.alert.create({
    data: {
      workspaceId: ctx.workspaceId,
      ventureId: venture.id,
      kind: parsed.kind,
      thresholdJson: parsed.threshold ? JSON.stringify(parsed.threshold) : null,
    },
  });
  return { payload: ok({ id: alert.id }, requestId), status: 201 };
});

export const PATCH = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();
  const body = await req.json().catch(() => ({}));
  const parsed = z.object({ id: z.string().min(1), active: z.boolean() }).parse(body);
  const alert = await db.alert.findUnique({ where: { id: parsed.id } });
  if (!alert) throw new ApiHttpError("NOT_FOUND", "Alert not found.", false);
  if (alert.workspaceId !== ctx.workspaceId) throw new ApiHttpError("FORBIDDEN", "Cross-tenant access denied.", false);
  await db.alert.update({ where: { id: parsed.id }, data: { active: parsed.active } });
  return { payload: ok({ updated: true }, requestId) };
});

export const DELETE = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) throw new ApiHttpError("BAD_REQUEST", "Missing id.", false);
  const alert = await db.alert.findUnique({ where: { id } });
  if (!alert) throw new ApiHttpError("NOT_FOUND", "Alert not found.", false);
  if (alert.workspaceId !== ctx.workspaceId) throw new ApiHttpError("FORBIDDEN", "Cross-tenant access denied.", false);
  await db.alert.delete({ where: { id } });
  return { payload: ok({ deleted: true }, requestId) };
});
