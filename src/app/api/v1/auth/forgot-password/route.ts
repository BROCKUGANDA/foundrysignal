import { handler, ok } from "@/lib/contracts/http";
import { requestPasswordReset } from "@/lib/auth/service";
import { z } from "zod";

/** Request a password reset email. Always succeeds — never leaks account existence. */
export const POST = handler(async ({ req, requestId }) => {
  const body = await req.json().catch(() => ({}));
  const email = z.string().email().parse(body?.email);
  const result = await requestPasswordReset(email);
  return { payload: ok({ sent: true, delivered: result.delivered, reason: result.reason ?? null }, requestId) };
});
