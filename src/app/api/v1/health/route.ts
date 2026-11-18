import { handler, ok } from "@/lib/contracts/http";
import { SolanaAdapter } from "@/lib/providers/solana";
import { JupiterAdapter } from "@/lib/providers/jupiter";
import { db } from "@/lib/db";

// /api/v1/health is unauthenticated and probes external providers on every
// call, so its computed payload is cached for 15 seconds at module scope.
// The two full-table count()s are served from the same cache, keeping them
// off the hot path; a slightly stale registry count is acceptable for a
// health signal. Per-process cache (single instance today).
const HEALTH_TTL_MS = 15_000;
let healthCache: { at: number; data: Record<string, unknown> } | null = null;

export const GET = handler(async ({ requestId }) => {
  const now = Date.now();
  if (healthCache && now - healthCache.at < HEALTH_TTL_MS) {
    return { payload: ok(healthCache.data, requestId) };
  }
  const sol = new SolanaAdapter();
  const jup = new JupiterAdapter();
  const [solHealth, slot, jupHealth] = await Promise.all([
    sol.getHealth(),
    sol.getSlot().catch(() => null),
    jup.getHealth().catch(() => "UNAVAILABLE" as const),
  ]);
  const ventureCount = await db.venture.count();
  const evidenceCount = await db.evidenceSource.count();
  const data = {
    service: "foundrysignal-api",
    version: "v1",
    solanaRpc: { health: solHealth, slot },
    jupiter: { health: jupHealth },
    registry: { ventures: ventureCount, evidenceRecords: evidenceCount },
    time: new Date().toISOString(),
  };
  healthCache = { at: now, data };
  return { payload: ok(data, requestId) };
});
