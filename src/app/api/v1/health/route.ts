import { handler, ok } from "@/lib/contracts/http";
import { SolanaAdapter } from "@/lib/providers/solana";
import { JupiterAdapter } from "@/lib/providers/jupiter";
import { db } from "@/lib/db";

export const GET = handler(async ({ requestId }) => {
  const sol = new SolanaAdapter();
  const jup = new JupiterAdapter();
  const [solHealth, slot, jupHealth] = await Promise.all([
    sol.getHealth(),
    sol.getSlot().catch(() => null),
    jup.getHealth().catch(() => "UNAVAILABLE" as const),
  ]);
  const ventureCount = await db.venture.count();
  const evidenceCount = await db.evidenceSource.count();
  return {
    payload: ok(
      {
        service: "foundrysignal-api",
        version: "v1",
        solanaRpc: { health: solHealth, slot },
        jupiter: { health: jupHealth },
        registry: { ventures: ventureCount, evidenceRecords: evidenceCount },
        time: new Date().toISOString(),
      },
      requestId
    ),
  };
});
