import { handler, ok } from "@/lib/contracts/http";
import { requireAuth } from "@/lib/auth/context";
import { createVenture, listVentures } from "@/lib/domain/ventures/service";
import { ZodError } from "zod";
import { ApiHttpError } from "@/lib/contracts/http";

export const GET = handler(async ({ req, requestId }) => {
  await requireAuth(); // discovery requires an account (platform gating choice; documented)
  const sp = req.nextUrl.searchParams;
  const result = await listVentures({
    q: sp.get("q") ?? undefined,
    category: sp.get("category") ?? undefined,
    status: sp.get("status") ?? undefined,
    ecosystem: sp.get("ecosystem") ?? undefined,
    hasToken: sp.get("hasToken") === "true",
    hasRepo: sp.get("hasRepo") === "true",
    sort: (sp.get("sort") as "RECENT" | "NAME" | "ACTIVITY" | null) ?? undefined,
    cursor: sp.get("cursor") ? parseInt(sp.get("cursor")!, 10) : undefined,
    limit: sp.get("limit") ? parseInt(sp.get("limit")!, 10) : undefined,
  });
  return { payload: ok(result, requestId, result.nextCursor ? String(result.nextCursor) : undefined) };
});

export const POST = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();
  const body = await req.json().catch(() => ({}));
  try {
    const result = await createVenture(body, ctx.userId);
    // 201 = fresh registration; 200 = matched an existing venture by normalized
    // website identity (idempotent re-submission, nothing duplicated).
    return { payload: ok(result, requestId), status: result.existing ? 200 : 201 };
  } catch (err) {
    if (err instanceof ZodError) {
      throw new ApiHttpError("VALIDATION_FAILED", "Invalid venture submission.", false, {
        issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    throw err;
  }
});
