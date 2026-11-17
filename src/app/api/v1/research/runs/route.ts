import { handler, ok, ApiHttpError } from "@/lib/contracts/http";
import { requireAuth } from "@/lib/auth/context";
import { startResearchRun } from "@/lib/domain/research/engine";
import { db } from "@/lib/db";
import { z } from "zod";

const StartRunSchema = z.object({ ventureId: z.string().min(1), question: z.string().min(8).max(500) });

export const GET = handler(async ({ requestId }) => {
  const ctx = await requireAuth();
  const runs = await db.researchRun.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { venture: { select: { name: true, slug: true } }, report: { select: { id: true, title: true, validationStatus: true } } },
  });
  return {
    payload: ok(
      runs.map((r) => ({
        id: r.id,
        question: r.question,
        status: r.status,
        failureReason: r.failureReason,
        venture: r.venture,
        report: r.report,
        createdAt: r.createdAt.toISOString(),
        finishedAt: r.finishedAt?.toISOString() ?? null,
      })),
      requestId
    ),
  };
});

export const POST = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();
  const body = await req.json().catch(() => ({}));
  const parsed = StartRunSchema.parse(body);
  const venture = await db.venture.findFirst({ where: { id: parsed.ventureId, visibility: "PUBLIC" } });
  if (!venture) throw new ApiHttpError("NOT_FOUND", "Venture not found.", false);

  // Concurrency guard: one running run per workspace per venture
  const running = await db.researchRun.count({ where: { workspaceId: ctx.workspaceId, ventureId: venture.id, status: { in: ["QUEUED", "RUNNING"] } } });
  if (running >= 2) {
    throw new ApiHttpError("RATE_LIMITED", "A research run for this venture is already in progress. Wait for it to finish.", true);
  }
  const run = await startResearchRun(ctx.workspaceId, venture.id, parsed.question, ctx.userId);
  return { payload: ok({ runId: run.id, status: run.status }, requestId), status: 202 };
});
