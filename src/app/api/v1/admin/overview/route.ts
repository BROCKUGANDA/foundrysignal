import { handler, ok, ApiHttpError } from "@/lib/contracts/http";
import { requireAuth, requirePlatformRole } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { breakerSnapshot } from "@/lib/providers/framework";
import { getBillingStatus } from "@/lib/domain/billing/stripe";
import { emailDeliveryStatus } from "@/lib/domain/email/service";
export const GET = handler(async ({ requestId }) => {
  const ctx = await requireAuth();
  await requirePlatformRole(ctx, ["PLATFORM_ADMIN", "MODERATOR"]);

  const [queue, deadLetter, recentJobs, audits, users, venturesCount, evidenceCount, disputedClaims, researchFailures] = await Promise.all([
    db.jobRecord.groupBy({ by: ["status"], _count: { _all: true } }),
    db.jobRecord.findMany({ where: { status: "DEAD" }, orderBy: { finishedAt: "desc" }, take: 20 }),
    db.jobRecord.findMany({ orderBy: { createdAt: "desc" }, take: 25 }),
    db.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 40, include: { actor: { select: { email: true } } } }),
    db.user.count({ where: { status: "ACTIVE" } }),
    db.venture.count(),
    db.evidenceSource.count(),
    db.claim.count({ where: { status: "CONTRADICTED" } }),
    db.researchRun.count({ where: { status: "FAILED" } }),
  ]);

  return {
    payload: ok(
      {
        queue: queue.map((q) => ({ status: q.status, count: q._count._all })),
        deadLetters: deadLetter.map((j) => ({ id: j.id, kind: j.kind, lastError: j.lastError, attempts: j.attempts, failureClass: j.failureClass, finishedAt: j.finishedAt?.toISOString() ?? null })),
        recentJobs: recentJobs.map((j) => ({ id: j.id, kind: j.kind, status: j.status, attempts: j.attempts, failureClass: j.failureClass, lastError: j.lastError, createdAt: j.createdAt.toISOString(), finishedAt: j.finishedAt?.toISOString() ?? null })),
        auditLog: audits.map((a) => ({ id: a.id, action: a.action, summary: a.summary, actor: a.actor?.email ?? "system", createdAt: a.createdAt.toISOString() })),
        stats: { users, ventures: venturesCount, evidence: evidenceCount, contradictedClaims: disputedClaims, researchFailures },
        breakers: {
          github: breakerSnapshot("github"),
          jupiter: breakerSnapshot("jupiter"),
        },
        integrations: {
          githubToken: {
            configured: !!process.env.GITHUB_TOKEN,
            requiredEnv: process.env.GITHUB_TOKEN ? [] : ["GITHUB_TOKEN"],
            note: process.env.GITHUB_TOKEN
              ? "Authenticated GitHub collection active (5,000 req/h)."
              : "Unauthenticated quota (60 req/h per egress IP) — collection reports RATE_LIMITED honestly until GITHUB_TOKEN is set.",
          },
          billing: getBillingStatus(),
          tradingExecutionEnv: {
            configured: process.env.TRADING_ENABLED === "true",
            note: process.env.TRADING_ENABLED === "true"
              ? "TRADING_ENABLED=true present — execution additionally requires all review gates APPROVED and the kill switch CLEAR."
              : "TRADING_ENABLED not set — execution stays blocked regardless of gate states (default-deny).",
          },
          email: emailDeliveryStatus(),
        },
      },
      requestId
    ),
  };
});
