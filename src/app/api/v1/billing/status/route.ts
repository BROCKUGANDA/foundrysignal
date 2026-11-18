import { handler, ok } from "@/lib/contracts/http";
import { requireAuth, requireWorkspaceRole } from "@/lib/auth/context";
import { getWorkspaceSubscription } from "@/lib/domain/billing/stripe";
import { getCheckoutConfig } from "@/lib/domain/billing/crypto";
import { listActivePlans } from "@/lib/domain/billing/plans";

/**
 * Billing state for the caller's own workspace: purchasable plans + the
 * workspace's subscription. Workspace ADMIN+ only — a VIEWER/ANALYST never
 * sees billing internals. Deployment-level details (destination wallet, exact
 * missing env names) are platform-administrator-only; workspace admins get the
 * same "is checkout available" answer without env-var disclosure.
 */
export const GET = handler(async ({ requestId }) => {
  const ctx = await requireAuth();
  requireWorkspaceRole(ctx, "ADMIN");
  const isPlatformAdmin = ctx.platformRole === "PLATFORM_ADMIN" || ctx.platformRole === "MODERATOR";

  const config = getCheckoutConfig();
  const plans = (await listActivePlans())
    .filter((p) => p.monthlyPriceMicros >= 0)
    .map((p) => ({ code: p.code, name: p.name, monthlyPriceMicros: p.monthlyPriceMicros, currency: p.currency }));
  const subscription = await getWorkspaceSubscription(ctx.workspaceId);

  return {
    payload: ok(
      {
        workspace: {
          provider: config.provider,
          configured: config.configured,
          checkoutReady: config.checkoutReady,
          mint: config.mint,
          // Explicit configuration gap — never a silent "payments coming soon".
          // Env-var names are deployment internals: platform admins only.
          note: config.configured
            ? "USDC checkout live: intents settle on Solana and are verified onchain before entitlement."
            : isPlatformAdmin
              ? "USDC checkout not configured: set PAYOUT_WALLET to the platform USDC receiving wallet."
              : "USDC checkout is not enabled on this deployment yet.",
          ...(isPlatformAdmin ? { destination: config.destination, missingEnv: config.missingEnv } : {}),
          subscription,
        },
        plans,
      },
      requestId
    ),
  };
});
