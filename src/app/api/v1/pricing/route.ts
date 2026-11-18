import { handler, ok } from "@/lib/contracts/http";
import { listActivePlans } from "@/lib/domain/billing/plans";

/**
 * Public plan catalog — prices come from the database (configuration data),
 * never hardcoded. Billing execution is a separate capability: when no
 * provider is configured the catalog is still real, purchases stay closed.
 */
export const GET = handler(async ({ requestId }) => {
  const plans = await listActivePlans();
  const provider = process.env.BILLING_PROVIDER?.trim();
  const { getCheckoutConfig } = await import("@/lib/domain/billing/crypto");
  const checkout = getCheckoutConfig();
  const purchasingAvailable = !!provider && checkout.configured;
  return {
    payload: ok(
      {
        plans,
        purchasingAvailable,
        checkoutProvider: provider ?? null,
        missingEnv: purchasingAvailable ? [] : [...(provider ? [] : ["BILLING_PROVIDER"]), ...checkout.missingEnv],
        note: purchasingAvailable
          ? "Self-serve USDC checkout is configured."
          : "Plans are published for transparency; checkout opens once a billing provider is configured. Contact us for Team and Enterprise in the meantime.",
      },
      requestId
    ),
  };
});
