import { randomBytes } from "crypto";
import { z } from "zod";
import { handler, ApiHttpError } from "@/lib/contracts/http";
import { registerUser, loginUser, logoutUser } from "@/lib/auth/service";
import { resolveSession, sha256, emailHash, hashPassword } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/domain/email/service";
import { recordAudit } from "@/lib/domain/shared/audit";
import { clientIp } from "@/lib/auth/client-ip";
import { verifyMfaChallenge } from "@/lib/auth/mfa";
import { cookies } from "next/headers";

function meta(requestId: string) {
  return { requestId, timestamp: new Date().toISOString(), version: "v1" };
}

const VerifySchema = z.object({ token: z.string().min(16).max(512) });
const ResetSchema = z.object({
  token: z.string().min(16).max(512),
  password: z.string().min(10, "Password must be at least 10 characters.").max(200),
});
const RequestResetSchema = z.object({ email: z.string().email().max(320) });
const MfaVerifySchema = z.object({
  challenge: z.string().min(16).max(512),
  code: z.string().regex(/^\d{6,8}$/).optional(),
  recoveryCode: z.string().min(8).max(64).optional(),
});

/** Consumes a VERIFY_EMAIL token and marks the account's email verified.
 * Already-used tokens are treated as success (mail clients may prefetch
 * links), but expired or unknown tokens fail honestly. */
async function verifyEmailToken(body: unknown) {
  const parsed = VerifySchema.safeParse(body);
  if (!parsed.success) throw new ApiHttpError("VALIDATION_FAILED", "A verification token is required.", false);
  const tokenHash = sha256(parsed.data.token);
  const record = await db.verificationToken.findUnique({ where: { tokenHash } });
  if (!record || record.action !== "VERIFY_EMAIL") {
    throw new ApiHttpError("VALIDATION_FAILED", "Invalid verification token.", false);
  }
  if (record.usedAt) return { verified: true, alreadyUsed: true };
  if (record.expires < new Date()) {
    throw new ApiHttpError("VALIDATION_FAILED", "This verification link has expired. Register again to receive a fresh one.", false);
  }
  await db.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
  const user = await db.user.findUnique({ where: { emailHash: emailHash(record.identifier) } });
  if (user && !user.emailVerifiedAt) {
    await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    await recordAudit({ actorId: user.id, action: "AUTH_EMAIL_VERIFY", targetType: "USER", targetId: user.id, summary: "Email verified" });
  }
  return { verified: true, alreadyUsed: false };
}

/** Consumes a PASSWORD_RESET token: sets the new password and revokes every
 * existing session for the account. */
async function resetPasswordWithToken(body: unknown) {
  const parsed = ResetSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error?.issues?.[0]?.message ?? "A token and a password of at least 10 characters are required.";
    throw new ApiHttpError("VALIDATION_FAILED", issue, false);
  }
  const tokenHash = sha256(parsed.data.token);
  const record = await db.verificationToken.findUnique({ where: { tokenHash } });
  if (!record || record.action !== "PASSWORD_RESET") {
    throw new ApiHttpError("VALIDATION_FAILED", "Invalid password-reset token.", false);
  }
  if (record.usedAt) throw new ApiHttpError("VALIDATION_FAILED", "This reset link has already been used. Request a new one.", false);
  if (record.expires < new Date()) {
    throw new ApiHttpError("VALIDATION_FAILED", "This reset link has expired. Request a new one.", false);
  }
  const user = await db.user.findUnique({ where: { emailHash: emailHash(record.identifier) } });
  if (!user || user.status !== "ACTIVE") {
    throw new ApiHttpError("VALIDATION_FAILED", "This reset link is no longer valid.", false);
  }
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(parsed.data.password) } });
  await db.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
  await db.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  // A challenge issued before the reset must not survive the credential change.
  await db.verificationToken.deleteMany({
    where: { identifier: user.id, action: "MFA_CHALLENGE", usedAt: null },
  });
  await recordAudit({
    actorId: user.id,
    action: "AUTH_PASSWORD_RESET",
    targetType: "USER",
    targetId: user.id,
    summary: "Password reset via emailed link; all sessions revoked",
  });
  return { reset: true };
}

/** Self-service reset request. Always responds success so the endpoint never
 * reveals which emails have accounts. */
async function requestPasswordReset(body: unknown) {
  const parsed = RequestResetSchema.safeParse(body);
  if (!parsed.success) throw new ApiHttpError("VALIDATION_FAILED", "A valid email address is required.", false);
  const email = parsed.data.email.trim().toLowerCase();
  const user = await db.user.findUnique({ where: { emailHash: emailHash(email) } });
  if (user && user.status === "ACTIVE") {
    const token = randomBytes(32).toString("base64url");
    await db.verificationToken.deleteMany({
      where: { identifier: email, action: "PASSWORD_RESET", usedAt: null },
    });
    await db.verificationToken.create({
      data: {
        identifier: email,
        tokenHash: sha256(token),
        action: "PASSWORD_RESET",
        expires: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });
    const result = await sendPasswordResetEmail(email, token);
    if (!result.delivered) {
      console.error(JSON.stringify({ level: "warn", component: "auth", message: `password reset email not delivered: ${result.reason ?? "unknown"}` }));
    }
  }
  return { sent: true };
}

export const POST = handler(async ({ req, requestId }) => {
  const action = req.nextUrl.pathname.split("/").pop();
  const body = await req.json().catch(() => ({}));

  if (action === "register") {
    const result = await registerUser(body, clientIp(req));
    return { payload: { success: true, data: result, metadata: meta(requestId) } };
  }
  if (action === "login") {
    const result = await loginUser(body, clientIp(req));
    return { payload: { success: true, data: result, metadata: meta(requestId) } };
  }
  if (action === "logout") {
    const session = await resolveSession();
    await logoutUser(session?.userId);
    return { payload: { success: true, data: { ok: true }, metadata: meta(requestId) } };
  }
  if (action === "verify") {
    const result = await verifyEmailToken(body);
    return { payload: { success: true, data: result, metadata: meta(requestId) } };
  }
  if (action === "reset") {
    const result = await resetPasswordWithToken(body);
    return { payload: { success: true, data: result, metadata: meta(requestId) } };
  }
  if (action === "request-reset") {
    const result = await requestPasswordReset(body);
    return { payload: { success: true, data: result, metadata: meta(requestId) } };
  }
  if (action === "mfa-challenge") {
    // Used only after an OAuth sign-in that needs a second factor: the
    // callback delivered the challenge in an HttpOnly cookie, never in a URL.
    const jar = await cookies();
    const pending = jar.get("fs_oauth_challenge")?.value;
    if (!pending) {
      throw new ApiHttpError("NOT_FOUND", "There is no pending second-factor challenge.", false);
    }
    jar.delete("fs_oauth_challenge");
    return { payload: { success: true, data: { challenge: pending }, metadata: meta(requestId) } };
  }
  if (action === "mfa-verify") {
    const parsed = MfaVerifySchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiHttpError("VALIDATION_FAILED", "A challenge and a six-digit code or a recovery code are required.", false);
    }
    const result = await verifyMfaChallenge({
      challenge: parsed.data.challenge,
      code: parsed.data.code,
      recoveryCode: parsed.data.recoveryCode,
      ip: clientIp(req),
    });
    return { payload: { success: true, data: result, metadata: meta(requestId) } };
  }
  return {
    payload: {
      success: false,
      error: { code: "NOT_FOUND", message: "Unknown auth action", retryable: false, requestId },
      metadata: meta(requestId),
    },
    status: 404,
  };
});

export const GET = handler(async ({ requestId }) => {
  const session = await resolveSession();
  return {
    payload: {
      success: true,
      data: { authenticated: !!session, userId: session?.userId ?? null, expiresAt: session?.expiresAt ?? null },
      metadata: meta(requestId),
    },
  };
});
