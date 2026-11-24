import { z } from "zod";
import { handler, ok, ApiHttpError } from "@/lib/contracts/http";
import { requireAuth } from "@/lib/auth/context";
import { verifyPassword } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  confirmEnrollment,
  disableMfa,
  regenerateRecoveryCodes,
  startEnrollment,
} from "@/lib/auth/mfa";

const PasswordSchema = z.object({ password: z.string().min(1).max(200) });
const CodeSchema = z.object({ code: z.string().regex(/^\d{6,8}$/) });
const DisableSchema = z.object({
  code: z.string().regex(/^\d{6,8}$/).optional(),
  recoveryCode: z.string().min(8).max(64).optional(),
});

/** Self-service TOTP management. Every action requires an authenticated
 * session and is scoped to that session's userId — no userId is accepted from
 * the client, so cross-account manipulation is impossible. */
export const POST = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();
  const action = req.nextUrl.pathname.split("/").pop();
  const body = await req.json().catch(() => ({}));

  if (action === "enroll") {
    const parsed = PasswordSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiHttpError("VALIDATION_FAILED", "Your current password is required to enable MFA.", false);
    }
    const user = await db.user.findUnique({ where: { id: ctx.userId } });
    if (!user) throw new ApiHttpError("NOT_FOUND", "Account not found.", false);
    return { payload: ok(await startEnrollment({
      userId: ctx.userId,
      password: parsed.data.password,
      currentPasswordHash: user.passwordHash,
      verifyPassword,
    }), requestId) };
  }

  if (action === "confirm") {
    const parsed = CodeSchema.safeParse(body);
    if (!parsed.success) throw new ApiHttpError("VALIDATION_FAILED", "A six-digit code is required.", false);
    return { payload: ok(await confirmEnrollment({
      userId: ctx.userId,
      code: parsed.data.code,
      keepSessionId: ctx.session.sessionId,
    }), requestId) };
  }

  if (action === "recovery") {
    const parsed = CodeSchema.safeParse(body);
    if (!parsed.success) throw new ApiHttpError("VALIDATION_FAILED", "A six-digit code is required.", false);
    return { payload: ok(await regenerateRecoveryCodes({ userId: ctx.userId, code: parsed.data.code }), requestId) };
  }

  if (action === "disable") {
    const parsed = DisableSchema.safeParse(body);
    if (!parsed.success || (!parsed.data.code && !parsed.data.recoveryCode)) {
      throw new ApiHttpError("VALIDATION_FAILED", "A current code or an unused recovery code is required.", false);
    }
    return { payload: ok(await disableMfa({
      userId: ctx.userId,
      code: parsed.data.code,
      recoveryCode: parsed.data.recoveryCode,
    }), requestId) };
  }

  return {
    payload: {
      success: false,
      error: { code: "NOT_FOUND", message: "Unknown MFA action", retryable: false, requestId },
      metadata: { requestId, timestamp: new Date().toISOString(), version: "v1" },
    },
    status: 404,
  };
});
