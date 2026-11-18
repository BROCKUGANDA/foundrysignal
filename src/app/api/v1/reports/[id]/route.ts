import { NextRequest } from "next/server";
import { handler, ok, ApiHttpError } from "@/lib/contracts/http";
import { requireAuth } from "@/lib/auth/context";
import { db } from "@/lib/db";

interface ReportSectionJson {
  id: string;
  heading: string;
  body: string;
}

export const GET = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();
  const id = req.nextUrl.pathname.split("/")[4]; // /api/v1/reports/{id}
  const report = await db.researchReport.findUnique({ where: { id } });
  if (!report) throw new ApiHttpError("NOT_FOUND", "Report not found.", false);
  if (report.workspaceId !== ctx.workspaceId) throw new ApiHttpError("FORBIDDEN", "Cross-tenant access denied.", false);
  return {
    payload: ok(
      {
        id: report.id,
        title: report.title,
        validationStatus: report.validationStatus,
        validationIssues: report.validationIssues ? (JSON.parse(report.validationIssues) as string[]) : [],
        sections: JSON.parse(report.sectionsJson) as ReportSectionJson[],
        citations: JSON.parse(report.citationsJson),
        createdAt: report.createdAt.toISOString(),
      },
      requestId
    ),
  };
});
