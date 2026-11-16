import { NextRequest } from "next/server";
import { handler, ok, ApiHttpError } from "@/lib/contracts/http";
import { requireAuth } from "@/lib/auth/context";
import { db } from "@/lib/db";

export const GET = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();
  const id = req.nextUrl.pathname.split("/")[5]; // /api/v1/research/runs/{id}
  const run = await db.researchRun.findUnique({ where: { id }, include: { report: true } });
  if (!run) throw new ApiHttpError("NOT_FOUND", "Research run not found.", false);
  if (run.workspaceId !== ctx.workspaceId) throw new ApiHttpError("FORBIDDEN", "Cross-tenant access denied.", false);
  return {
    payload: ok(
      {
        id: run.id,
        question: run.question,
        status: run.status,
        failureReason: run.failureReason,
        startedAt: run.startedAt?.toISOString() ?? null,
        finishedAt: run.finishedAt?.toISOString() ?? null,
        report: run.report
          ? {
              id: run.report.id,
              title: run.report.title,
              validationStatus: run.report.validationStatus,
              validationIssues: run.report.validationIssues ? (JSON.parse(run.report.validationIssues) as string[]) : [],
              sections: JSON.parse(run.report.sectionsJson),
              citations: JSON.parse(run.report.citationsJson),
              createdAt: run.report.createdAt.toISOString(),
            }
          : null,
      },
      requestId
    ),
  };
});
