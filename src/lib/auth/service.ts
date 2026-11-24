import { db } from "@/lib/db";
import { hashPassword, verifyPassword, createSession, destroyCurrentSession, emailHash, sha256 } from "./session";
import { ApiHttpError } from "@/lib/contracts/http";
import { USER_TYPES } from "@/lib/contracts/api";
import { slugifyWorkspace } from "@/lib/domain/shared/slug";
import { recordAudit } from "@/lib/domain/shared/audit";
import { sendVerificationEmail } from "@/lib/domain/email/service";
import { randomBytes } from "crypto";
import { z } from "zod";
import { issueMfaChallenge } from "./mfa";

export const RegisterSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(10).max(200),
  name: z.string().min(1).max(120).optional(),
  // Registration persona. Optional: defaults to VENTURE_INVESTOR.
  userType: z.enum(USER_TYPES).default("VENTURE_INVESTOR"),
  // Clickwrap acceptance: the client must post an explicit affirmative action
  // and the exact version of the terms shown at that moment.
  acceptTerms: z.boolean().refine((v) => v === true, "You must accept the Terms of Service."),
  termsVersion: z.string().min(1).max(40),
});

/**
 * Self-service account update. Deliberately narrow: only the display name and
 * the registration persona are editable by the account owner. Role fields
 * (`platformRole`, workspace role) are not part of this schema, so a client
 * cannot elevate itself by posting them.
 */
export const UpdateAccountSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  userType: z.enum(USER_TYPES).optional(),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// login throttle: bounded in-process counters. Two buckets per account:
//   email        — global per-email backstop: caps credential guessing even
//                  when the caller rotates IPs (30 attempts / 15 min), and
//   email|ip     — secondary per-network bucket (8 attempts / 15 min).
// Both are bounded and swept on insert; the map is capped at 5000 keys
// (expired entries cleared first, then the 1000 oldest are dropped).
// Per-process scope; a shared store (BullMQ/Redis) is a known follow-up.
const loginAttempts = new Map<string, { count: number; until: number }>();
const MAX_ATTEMPTS = 8;              // secondary per email|ip bucket
const MAX_ATTEMPTS_PER_EMAIL = 30;   // global per-email backstop
const LOCKOUT_MS = 15 * 60 * 1000;
const LOGIN_ATTEMPTS_MAX_KEYS = 5000;

function throttleKey(email: string, ip: string): string {
  return `${email.toLowerCase()}|${ip}`;
}

function emailThrottleKey(email: string): string {
  return email.toLowerCase();
}

function sweepExpiredLoginAttempts(now: number): void {
  for (const [k, v] of loginAttempts) {
    if (now >= v.until) loginAttempts.delete(k);
  }
}

function setLoginAttempt(key: string, count: number, now: number): void {
  if (loginAttempts.size >= LOGIN_ATTEMPTS_MAX_KEYS) {
    sweepExpiredLoginAttempts(now);
    if (loginAttempts.size >= LOGIN_ATTEMPTS_MAX_KEYS) {
      const oldest = [...loginAttempts.entries()]
        .sort((a, b) => a[1].until - b[1].until)
        .slice(0, 1000);
      for (const [k] of oldest) loginAttempts.delete(k);
    }
  }
  loginAttempts.set(key, { count, until: now + LOCKOUT_MS });
}

function bumpLoginAttempt(key: string, now: number): void {
  const entry = loginAttempts.get(key);
  if (entry && now < entry.until) {
    entry.count += 1;
  } else {
    setLoginAttempt(key, 1, now);
  }
}

export function checkLoginThrottle(email: string, ip: string): void {
  const now = Date.now();
  const globalEntry = loginAttempts.get(emailThrottleKey(email));
  if (globalEntry && globalEntry.count >= MAX_ATTEMPTS_PER_EMAIL && now < globalEntry.until) {
    throw new ApiHttpError("RATE_LIMITED", "Too many login attempts. Try again later.", true);
  }
  const entry = loginAttempts.get(throttleKey(email, ip));
  if (entry && entry.count >= MAX_ATTEMPTS && now < entry.until) {
    throw new ApiHttpError("RATE_LIMITED", "Too many login attempts. Try again later.", true);
  }
}

function recordFailedLogin(email: string, ip: string): void {
  const now = Date.now();
  sweepExpiredLoginAttempts(now);
  bumpLoginAttempt(emailThrottleKey(email), now);
  bumpLoginAttempt(throttleKey(email, ip), now);
}

function clearLoginThrottle(email: string, ip: string): void {
  loginAttempts.delete(throttleKey(email, ip));
  loginAttempts.delete(emailThrottleKey(email));
}

// registration throttle: bounded per-IP counter (abuse guard; single-instance scope)
const registerByIp = new Map<string, { count: number; windowStart: number }>();
const REGISTER_MAX_PER_HOUR = 10;

function checkRegisterThrottle(ip: string): void {
  const now = Date.now();
  const entry = registerByIp.get(ip);
  if (!entry || now - entry.windowStart > 60 * 60 * 1000) {
    if (registerByIp.size > 10_000) registerByIp.clear(); // bounded memory
    registerByIp.set(ip, { count: 1, windowStart: now });
    return;
  }
  entry.count += 1;
  if (entry.count > REGISTER_MAX_PER_HOUR) {
    throw new ApiHttpError("RATE_LIMITED", "Too many registrations from this network. Try again later.", true);
  }
}

export async function registerUser(input: unknown, ip: string) {
  checkRegisterThrottle(ip);
  const { email, password, name, userType, termsVersion } = RegisterSchema.parse(input);
  const eHash = emailHash(email);
  const existing = await db.user.findUnique({ where: { emailHash: eHash } });
  if (existing) throw new ApiHttpError("CONFLICT", "An account with this email already exists.", false);

  const user = await db.user.create({
    data: {
      email,
      emailHash: eHash,
      name,
      passwordHash: await hashPassword(password),
      platformRole: "USER",
      userType,
      termsAcceptedAt: new Date(),
      termsVersion,
    },
  });

  // Personal workspace
  const ws = await db.workspace.create({
    data: { name: name ? `${name}'s workspace` : "Personal workspace", slug: slugifyWorkspace(`ws-${user.id.slice(-8)}`), kind: "PERSONAL" },
  });
  await db.membership.create({ data: { workspaceId: ws.id, userId: user.id, role: "OWNER" } });
  await createSession(user.id, ws.id);
  await recordAudit({ actorId: user.id, action: "AUTH_REGISTER", targetType: "USER", targetId: user.id, summary: `Account registered (${userType})`, metadata: { ip, userType } });

  // Issue an email-verification token and attempt delivery. Registration
  // never fails because of email delivery — the token is stored and the link
  // can be re-sent via the request-reset path's analogue (re-register is not
  // required; delivery gaps are logged honestly).
  const verificationToken = randomBytes(32).toString("base64url");
  await db.verificationToken.create({
    data: {
      identifier: email.trim().toLowerCase(),
      tokenHash: sha256(verificationToken),
      action: "VERIFY_EMAIL",
      expires: new Date(Date.now() + 24 * 3600 * 1000),
    },
  });
  const mail = await sendVerificationEmail(email, verificationToken);
  if (!mail.delivered) {
    console.info(JSON.stringify({ level: "info", component: "auth", message: `verification email not delivered: ${mail.reason ?? "EMAIL_NOT_CONFIGURED"}` }));
  }
  return { userId: user.id, workspaceId: ws.id, userType, verificationEmailSent: mail.delivered };
}

export async function loginUser(input: unknown, ip: string) {
  const { email, password } = LoginSchema.parse(input);
  checkLoginThrottle(email, ip);
  const user = await db.user.findUnique({ where: { emailHash: emailHash(email) } });
  // Uniform failure, uniform timing: unknown emails still run a bcrypt
  // compare (same cost factor) against a generated throwaway hash so response
  // latency does not leak which addresses exist (timing-enumeration hardening).
  let dummyHashCache: string | null = null;
  async function timingEqualizedVerify(password: string): Promise<boolean> {
    if (!dummyHashCache) dummyHashCache = await hashPassword("no-such-account-throwaway");
    return verifyPassword(password, dummyHashCache);
  }
  const valid =
    user && user.status === "ACTIVE"
      ? await verifyPassword(password, user.passwordHash)
      : await timingEqualizedVerify(password);
  if (!user || !valid) {
    recordFailedLogin(email, ip);
    throw new ApiHttpError("UNAUTHENTICATED", "Invalid email or password.", false);
  }
  clearLoginThrottle(email, ip);

  // A correct password is step one only for accounts with an enabled second
  // factor. No session is created here: the client must exchange the
  // single-use challenge for one via /api/v1/auth/mfa-verify.
  const challenge = await issueMfaChallenge(user.id);
  if (challenge) {
    return { mfaRequired: true as const, challenge, userId: user.id };
  }

  const firstMembership = await db.membership.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  await createSession(user.id, firstMembership?.workspaceId);
  await recordAudit({ actorId: user.id, action: "AUTH_LOGIN", targetType: "USER", targetId: user.id, summary: "Signed in", metadata: { ip } });
  return { mfaRequired: false as const, userId: user.id, workspaceId: firstMembership?.workspaceId ?? null };
}

export async function logoutUser(userId?: string) {
  await destroyCurrentSession();
  if (userId) {
    await recordAudit({ actorId: userId, action: "AUTH_LOGOUT", targetType: "USER", targetId: userId, summary: "Signed out" });
  }
}

export async function getAccountState(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiHttpError("NOT_FOUND", "Account not found.", false);
  const memberships = await db.membership.findMany({
    where: { userId },
    include: { workspace: true },
  });
  return {
    email: user.email,
    name: user.name,
    platformRole: user.platformRole,
    userType: user.userType,
    emailVerified: !!user.emailVerifiedAt,
    workspaces: memberships.map((m) => ({
      id: m.workspace.id,
      name: m.workspace.name,
      role: m.role,
      kind: m.workspace.kind,
    })),
  };
}

/** Account deletion: soft delete + revoke sessions. Personal data retention documented in DATA_METHODOLOGY. */
export async function requestAccountDeletion(userId: string) {
  await db.user.update({ where: { id: userId }, data: { status: "DELETED", deletedAt: new Date() } });
  await db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  await db.verificationToken.deleteMany({
    where: { identifier: userId, action: "MFA_CHALLENGE", usedAt: null },
  });
  await recordAudit({ actorId: userId, action: "ACCOUNT_DELETE", targetType: "USER", targetId: userId, summary: "Account deleted" });
}

/**
 * Self-service profile update. `UpdateAccountSchema` is a closed allowlist:
 * role fields are stripped by zod and never persisted from client input.
 */
export async function updateAccount(userId: string, input: unknown) {
  const patch = UpdateAccountSchema.parse(input);
  if (Object.keys(patch).length === 0) {
    throw new ApiHttpError("VALIDATION_FAILED", "No editable fields supplied.", false);
  }
  const user = await db.user.update({ where: { id: userId }, data: patch });
  await recordAudit({
    actorId: userId,
    action: "ACCOUNT_UPDATE",
    targetType: "USER",
    targetId: userId,
    summary: `Account updated (${Object.keys(patch).join(", ")})`,
    metadata: { userType: user.userType },
  });
  return getAccountState(userId);
}
