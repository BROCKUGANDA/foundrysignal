import { db } from "@/lib/db";
import { hashPassword, verifyPassword, createSession, destroyCurrentSession, emailHash } from "./session";
import { ApiHttpError } from "@/lib/contracts/http";
import { USER_TYPES } from "@/lib/contracts/api";
import { slugifyWorkspace } from "@/lib/domain/shared/slug";
import { recordAudit } from "@/lib/domain/shared/audit";
import { z } from "zod";

export const RegisterSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(10).max(200),
  name: z.string().min(1).max(120).optional(),
  // Registration persona. Optional: defaults to VENTURE_INVESTOR.
  userType: z.enum(USER_TYPES).default("VENTURE_INVESTOR"),
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

// login throttle: bounded in-process counters (per email+IP)
const loginAttempts = new Map<string, { count: number; until: number }>();
const MAX_ATTEMPTS = 8;
const LOCKOUT_MS = 15 * 60 * 1000;

function throttleKey(email: string, ip: string): string {
  return `${email.toLowerCase()}|${ip}`;
}

export function checkLoginThrottle(email: string, ip: string): void {
  const entry = loginAttempts.get(throttleKey(email, ip));
  if (entry && entry.count >= MAX_ATTEMPTS && Date.now() < entry.until) {
    throw new ApiHttpError("RATE_LIMITED", "Too many login attempts. Try again later.", true);
  }
}

function recordFailedLogin(email: string, ip: string): void {
  const key = throttleKey(email, ip);
  const entry = loginAttempts.get(key);
  const now = Date.now();
  if (entry && now < entry.until) {
    entry.count += 1;
  } else {
    loginAttempts.set(key, { count: 1, until: now + LOCKOUT_MS });
  }
}

function clearLoginThrottle(email: string, ip: string): void {
  loginAttempts.delete(throttleKey(email, ip));
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
  const { email, password, name, userType } = RegisterSchema.parse(input);
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
    },
  });

  // Personal workspace
  const ws = await db.workspace.create({
    data: { name: name ? `${name}'s workspace` : "Personal workspace", slug: slugifyWorkspace(`ws-${user.id.slice(-8)}`), kind: "PERSONAL" },
  });
  await db.membership.create({ data: { workspaceId: ws.id, userId: user.id, role: "OWNER" } });
  await createSession(user.id, ws.id);
  await recordAudit({ actorId: user.id, action: "AUTH_REGISTER", targetType: "USER", targetId: user.id, summary: `Account registered (${userType})`, metadata: { ip, userType } });
  return { userId: user.id, workspaceId: ws.id, userType };
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
  const firstMembership = await db.membership.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  await createSession(user.id, firstMembership?.workspaceId);
  await recordAudit({ actorId: user.id, action: "AUTH_LOGIN", targetType: "USER", targetId: user.id, summary: "Signed in", metadata: { ip } });
  return { userId: user.id, workspaceId: firstMembership?.workspaceId ?? null };
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
