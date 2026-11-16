import { handler, ok } from "@/lib/contracts/http";
import { requireAuth } from "@/lib/auth/context";
import { getTradingReadiness } from "@/lib/domain/trading/gates";

/** Current trading release-gate status (authenticated read; decisions are admin-only). */
export const GET = handler(async ({ requestId }) => {
  await requireAuth();
  const readiness = await getTradingReadiness();
  return { payload: ok(readiness, requestId) };
});
