import { handler, ok } from "@/lib/contracts/http";
import { requireAuth, requirePlatformRole } from "@/lib/auth/context";
import { getWorkspaceSubscription } from "@/lib/domain/billing/stripe";
import { getCheckoutConfig } from "@/lib/domain/billing/crypto";
import { listActivePlans } from "@/lib/domain/billing/plans";

/** Billing state for the current session: provider config + subscription. */
export const GET = handler(async ({ requestId }) => {
  const ctx = await requireAuth();
  await requirePlatformRole(ctx, ["PLATFORM_ADMIN", "MODERATOR"]);
  const config = getCheckoutConfig();
  const plans = (await listActivePlans())
    .filter((p) => p.monthlyPriceMicros >= 0)
    .map((p) => ({ code: p.code, name: p.name, monthlyPriceMicros: p.monthlyPriceMicros, currency: p.currency }));
  const subscription = await getWorkspaceSubscription(ctx.workspaceId);

  return {
    payload: ok(
      {
        provider: config.provider,
        configured: config.configured,
        checkoutReady: config.checkoutReady,
        mint: config.mint,
        destination: config.destination,
        // Explicit configuration gap — never a silent "payments coming soon".
        missingEnv: config.missingEnv,
        plans,
        note: config.configured
          ? "USDC checkout live: intents settle on Solana and are verified onchain before entitlement."
          : "USDC checkout not configured: set PAYOUT_WALLET to the platform USDC receiving wallet.",
        subscription,
      },
      requestId
    ),
  };
});
