import { handler, ok } from "@/lib/contracts/http";
import { listActivePlans } from "@/lib/domain/billing/plans";

/**
 * Public plan catalog — prices come from the database (configuration data),
 * never hardcoded. Billing execution is a separate capability: when no
 * provider is configured the catalog is still real, purchases stay closed.
 */
export const GET = handler(async ({ requestId }) => {
  const plans = await listActivePlans();
  return {
    payload: ok(
      {
        plans,
        purchasingAvailable: !!process.env.BILLING_PROVIDER,
        note: process.env.BILLING_PROVIDER
          ? "Self-serve checkout is configured."
          : "Plans are published for transparency; checkout opens once a billing provider is configured. Contact us for Team and Enterprise in the meantime.",
      },
      requestId
    ),
  };
});
