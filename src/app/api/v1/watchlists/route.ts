import { handler, ok, ApiHttpError } from "@/lib/contracts/http";
import { requireAuth, requireWorkspaceRole } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { z } from "zod";

export const GET = handler(async ({ requestId }) => {
  const ctx = await requireAuth();
  const watchlists = await db.watchlist.findMany({
    where: { workspaceId: ctx.workspaceId },
    include: { items: { include: { venture: { select: { id: true, slug: true, name: true, category: true, status: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  return {
    payload: ok(
      watchlists.map((w) => ({
        id: w.id,
        name: w.name,
        createdAt: w.createdAt.toISOString(),
        items: w.items.map((i) => ({ ventureId: i.venture.id, slug: i.venture.slug, name: i.venture.name, category: i.venture.category, note: i.note, addedAt: i.createdAt.toISOString() })),
      })),
      requestId
    ),
  };
});

export const POST = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();
  requireWorkspaceRole(ctx, "ANALYST");
  const body = await req.json().catch(() => ({}));
  const parsed = z.object({ name: z.string().min(1).max(80) }).parse(body);
  const count = await db.watchlist.count({ where: { workspaceId: ctx.workspaceId } });
  if (count >= 12) throw new ApiHttpError("CONFLICT", "Watchlist limit reached for this workspace.", false);
  const wl = await db.watchlist.create({ data: { workspaceId: ctx.workspaceId, name: parsed.name } });
  return { payload: ok({ id: wl.id, name: wl.name }, requestId), status: 201 };
});

export const DELETE = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();
  requireWorkspaceRole(ctx, "ANALYST");
  const id = req.nextUrl.searchParams.get("id");
  if (!id) throw new ApiHttpError("BAD_REQUEST", "Missing watchlist id.", false);
  const wl = await db.watchlist.findUnique({ where: { id } });
  if (!wl) throw new ApiHttpError("NOT_FOUND", "Watchlist not found.", false);
  if (wl.workspaceId !== ctx.workspaceId) throw new ApiHttpError("FORBIDDEN", "Cross-tenant access denied.", false);
  await db.watchlist.delete({ where: { id } });
  return { payload: ok({ deleted: true }, requestId) };
});
