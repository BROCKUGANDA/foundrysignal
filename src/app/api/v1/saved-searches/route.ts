import { handler, ok, ApiHttpError } from "@/lib/contracts/http";
import { requireAuth, requireWorkspaceRole } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { z } from "zod";

export const GET = handler(async ({ requestId }) => {
  const ctx = await requireAuth();
  const searches = await db.savedSearch.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { createdAt: "desc" },
  });
  return {
    payload: ok(
      searches.map((s) => ({ id: s.id, name: s.name, query: JSON.parse(s.queryJson), createdAt: s.createdAt.toISOString() })),
      requestId
    ),
  };
});

export const POST = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();
  requireWorkspaceRole(ctx, "VIEWER");
  const body = await req.json().catch(() => ({}));
  const parsed = z.object({ name: z.string().min(1).max(80), query: z.record(z.string(), z.unknown()) }).parse(body);
  const count = await db.savedSearch.count({ where: { workspaceId: ctx.workspaceId } });
  if (count >= 20) throw new ApiHttpError("CONFLICT", "Saved-search limit reached.", false);
  const s = await db.savedSearch.create({
    data: { workspaceId: ctx.workspaceId, name: parsed.name, queryJson: JSON.stringify(parsed.query) },
  });
  return { payload: ok({ id: s.id }, requestId), status: 201 };
});

export const DELETE = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) throw new ApiHttpError("BAD_REQUEST", "Missing id.", false);
  const s = await db.savedSearch.findUnique({ where: { id } });
  if (!s) throw new ApiHttpError("NOT_FOUND", "Saved search not found.", false);
  if (s.workspaceId !== ctx.workspaceId) throw new ApiHttpError("FORBIDDEN", "Cross-tenant access denied.", false);
  await db.savedSearch.delete({ where: { id } });
  return { payload: ok({ deleted: true }, requestId) };
});
