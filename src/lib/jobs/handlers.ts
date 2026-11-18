import { registerJob } from "@/lib/jobs/queue";
import { executeResearchRun } from "@/lib/domain/research/engine";
import { db } from "@/lib/db";

// Research generation worker — user-triggered, bounded retries (2), long timeout.
registerJob("research_run", async (ctx) => {
  const { runId } = ctx.payload as { runId: string };
  ctx.log("executing research run", { runId });
  await executeResearchRun(runId);
});

// Alert evaluation worker — event-driven over recent deltas.
registerJob("evaluate_alerts", async (ctx) => {
  const { ventureId } = ctx.payload as { ventureId: string };
  ctx.log("evaluating alerts", { ventureId });
  const alerts = await db.alert.findMany({ where: { ventureId, active: true } });
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  for (const alert of alerts) {
    let summary: string | null = null;
    if (alert.kind === "RELEASE_PUBLISHED") {
      const release = await db.releaseObservation.findFirst({
        where: { repository: { ventureId }, publishedAt: { gte: since } },
        orderBy: { publishedAt: "desc" },
      });
      if (release) summary = `New release ${release.tagName} published`;
    } else if (alert.kind === "EVIDENCE_CONTRADICTED") {
      const contradicted = await db.claim.findFirst({
        where: { ventureId, status: "CONTRADICTED", updatedAt: { gte: since } },
      });
      if (contradicted) summary = `Claim contradicted: ${contradicted.statement.slice(0, 120)}`;
    } else if (alert.kind === "MARKET_MOVE") {
      const snap = await db.marketSnapshot.findFirst({
        where: { ventureId, asOf: { gte: since }, priceChange24h: { not: null } },
        orderBy: { asOf: "desc" },
      });
      const threshold = alert.thresholdJson ? (JSON.parse(alert.thresholdJson).priceChangePct ?? 20) : 20;
      if (snap?.priceChange24h && Math.abs(snap.priceChange24h) >= threshold) {
        summary = `24h price change ${snap.priceChange24h.toFixed(1)}% exceeds ${threshold}% threshold`;
      }
    } else if (alert.kind === "AUTHORITY_CHANGED") {
      const obs = await db.onchainObservation.findFirst({
        where: { ventureId, kind: "MINT_METADATA", observationTime: { gte: since } },
        orderBy: { observationTime: "desc" },
      });
      if (obs) {
        const prev = await db.onchainObservation.findFirst({
          where: { ventureId, kind: "MINT_METADATA", observationTime: { lt: obs.observationTime } },
          orderBy: { observationTime: "desc" },
        });
        if (prev) {
          const a = JSON.parse(String(obs.payload));
          const b = JSON.parse(String(prev.payload));
          if (a.mintAuthority !== b.mintAuthority || a.freezeAuthority !== b.freezeAuthority) {
            summary = "Token authority change detected between observations";
          }
        }
      }
    }
    if (summary) {
      await db.alertEvent.create({
        data: { alertId: alert.id, summary, payloadJson: null },
      });
    }
    await db.alert.update({ where: { id: alert.id }, data: { lastEvaluatedAt: new Date() } });
  }
});

// Data cleanup worker — scheduled; expires old completed jobs.
registerJob("cleanup_jobs", async (ctx) => {
  ctx.log("cleaning expired jobs");
  const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const res = await db.jobRecord.deleteMany({
    where: { status: "COMPLETED", finishedAt: { lt: cutoff } },
  });
  ctx.log("cleaned jobs", { count: res.count });
});
