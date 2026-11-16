import { NextRequest } from "next/server";
import { handler, ok, ApiHttpError } from "@/lib/contracts/http";
import { requireAuth, requireWorkspaceRole, assertTenant } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { z } from "zod";

const AddItemSchema = z.object({ ventureId: z.string().min(1), note: z.string().max(500).optional() });

async function resolveWatchlist(req: NextRequest, ctx: { workspaceId: string }) {
  const id = req.nextUrl.pathname.split("/")[4]; // /api/v1/watchlists/{id}/items
  const wl = await db.watchlist.findUnique({ where: { id } });
  if (!wl) throw new ApiHttpError("NOT_FOUND", "Watchlist not found.", false);
  assertTenant({ ...ctx } as never, wl.workspaceId);
  return wl;
}

export const POST = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();
  requireWorkspaceRole(ctx, "VIEWER");
  const wl = await resolveWatchlist(req, ctx);
  const body = await req.json().catch(() => ({}));
  const parsed = AddItemSchema.parse(body);
  const venture = await db.venture.findUnique({ where: { id: parsed.ventureId } });
  if (!venture) throw new ApiHttpError("NOT_FOUND", "Venture not found.", false);
  await db.watchlistItem.upsert({
    where: { watchlistId_ventureId: { watchlistId: wl.id, ventureId: venture.id } },
    create: { watchlistId: wl.id, ventureId: venture.id, note: parsed.note },
    update: { note: parsed.note },
  });
  return { payload: ok({ watchlistId: wl.id, ventureId: venture.id }, requestId), status: 201 };
});

export const DELETE = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();
  requireWorkspaceRole(ctx, "VIEWER");
  const wl = await resolveWatchlist(req, ctx);
  const ventureId = req.nextUrl.searchParams.get("ventureId");
  if (!ventureId) throw new ApiHttpError("BAD_REQUEST", "Missing ventureId.", false);
  await db.watchlistItem.deleteMany({ where: { watchlistId: wl.id, ventureId } });
  return { payload: ok({ removed: true }, requestId) };
});
