import { handler, ok, ApiHttpError } from "@/lib/contracts/http";
import { verifyEmailToken } from "@/lib/auth/service";
import { z } from "zod";

export const POST = handler(async ({ req, requestId }) => {
  const body = await req.json().catch(() => ({}));
  const token = z.string().min(10).parse(body?.token);
  const result = await verifyEmailToken(token);
  if (!result.ok) throw new ApiHttpError("VALIDATION_FAILED", `Verification failed: ${result.reason}`, false);
  return { payload: ok({ verified: true }, requestId) };
});
