import { handler, ok, ApiHttpError } from "@/lib/contracts/http";
import { requireAuth } from "@/lib/auth/context";
import { changePassword } from "@/lib/auth/service";
import { z } from "zod";

const schema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(10).max(200) });

/** Change the signed-in user's password. Verifies the current password first. */
export const POST = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();
  const body = await req.json().catch(() => ({}));
  const parsed = schema.parse(body);
  const result = await changePassword(ctx.userId, parsed.currentPassword, parsed.newPassword);
  if (!result.ok) throw new ApiHttpError("VALIDATION_FAILED", "Current password is incorrect.", false);
  return { payload: ok({ changed: true }, requestId) };
});
