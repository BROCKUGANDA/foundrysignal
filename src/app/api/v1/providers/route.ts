import { handler, ok } from "@/lib/contracts/http";
import { requireAuth, requirePlatformRole } from "@/lib/auth/context";
import { GithubAdapter } from "@/lib/providers/github";
import { SolanaAdapter } from "@/lib/providers/solana";
import { JupiterAdapter } from "@/lib/providers/jupiter";
import { breakerSnapshot } from "@/lib/providers/framework";
import { db } from "@/lib/db";

export const GET = handler(async ({ requestId }) => {
  const ctx = await requireAuth();
  await requirePlatformRole(ctx, ["PLATFORM_ADMIN", "MODERATOR"]);
  const gh = new GithubAdapter();
  const sol = new SolanaAdapter();
  const jup = new JupiterAdapter();

  const [ghHealth, ghRate, solHealth, solRate, jupHealth, jupRate] = await Promise.all([
    gh.getHealth(),
    gh.getRateLimitState(),
    sol.getHealth(),
    sol.getRateLimitState(),
    jup.getHealth().catch(() => "UNAVAILABLE" as const),
    jup.getRateLimitState(),
  ]);

  const queueDepth = await db.jobRecord.groupBy({ by: ["status"], _count: { _all: true } });

  return {
    payload: ok(
      {
        providers: [
          {
            name: "github",
            health: ghHealth,
            configured: gh.isConfigured,
            note: gh.isConfigured ? "Authenticated collection enabled." : "No GITHUB_TOKEN configured — unauthenticated quota on the shared egress IP is exhausted; collection reports RATE_LIMITED honestly.",
            rateLimit: { limit: ghRate.limit, remaining: ghRate.remaining, resetAt: ghRate.resetAt?.toISOString() ?? null },
            breaker: breakerSnapshot("github"),
          },
          {
            name: "solana-rpc",
            health: solHealth,
            configured: true,
            note: `${sol.rpcEndpoint}${sol.indexedProviderConfigured ? "" : " · Helius indexed provider not configured (reads only, public RPC limits)"}`,
            rateLimit: { limit: solRate.limit, remaining: solRate.remaining, resetAt: solRate.resetAt?.toISOString() ?? null },
            breaker: breakerSnapshot("solana-rpc"),
          },
          {
            name: "jupiter",
            health: jupHealth,
            configured: true,
            note: "Jupiter Lite API — price snapshots and quote previews. Execution release gate: OFF.",
            rateLimit: { limit: jupRate.limit, remaining: jupRate.remaining, resetAt: jupRate.resetAt?.toISOString() ?? null },
            breaker: breakerSnapshot("jupiter"),
          },
          {
            name: "website",
            health: "HEALTHY" as const,
            configured: true,
            note: "SSRF-guarded server-side collection; some sites block collectors (surfaced as PROVIDER_BLOCKED).",
            rateLimit: { limit: null, remaining: null, resetAt: null },
            breaker: breakerSnapshot("website"),
          },
          {
            name: "helius-indexed",
            health: sol.indexedProviderConfigured ? ("HEALTHY" as const) : ("MISCONFIGURED" as const),
            configured: sol.indexedProviderConfigured,
            note: sol.indexedProviderConfigured ? "Indexed provider enabled." : "HELIUS_API_KEY not set — enhanced APIs unavailable (honest state, not simulated).",
            rateLimit: { limit: null, remaining: null, resetAt: null },
            breaker: null,
          },
        ],
        queue: queueDepth.map((q) => ({ status: q.status, count: q._count._all })),
      },
      requestId
    ),
  };
});
