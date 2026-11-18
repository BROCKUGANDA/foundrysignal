import { handler, ok, ApiHttpError } from "@/lib/contracts/http";
import { resetPassword } from "@/lib/auth/service";
import { z } from "zod";

const schema = z.object({ token: z.string().min(10), newPassword: z.string().min(10).max(200) });

export const POST = handler(async ({ req, requestId }) => {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.parse(body);
  const result = await resetPassword(parsed.token, parsed.newPassword);
  if (!result.ok) throw new ApiHttpError("VALIDATION_FAILED", `Reset failed: ${result.reason}`, false);
  return { payload: ok({ reset: true }, requestId) };
});
