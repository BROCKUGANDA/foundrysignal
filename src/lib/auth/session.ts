import bcrypt from "bcryptjs";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { cookies } from "next/headers";

const SESSION_COOKIE = "fs_session";
const SESSION_TTL_DAYS = 7;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function emailHash(email: string): string {
  return sha256(email.trim().toLowerCase());
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export interface SessionInfo {
  sessionId: string;
  userId: string;
  expiresAt: Date;
}

/** Creates a server-side session and sets the HttpOnly cookie. */
export async function createSession(userId: string, activeWsId?: string): Promise<SessionInfo> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 3600 * 1000);
  const session = await db.session.create({
    data: { userId, tokenHash: sha256(token), expiresAt, activeWsId },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
  return { sessionId: session.id, userId, expiresAt };
}

export async function destroyCurrentSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.updateMany({
      where: { tokenHash: sha256(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  jar.delete(SESSION_COOKIE);
}

export interface ResolvedSession {
  sessionId: string;
  userId: string;
  activeWsId: string | null;
  expiresAt: Date;
}

/** Resolves the current session from the cookie; null when absent/expired/revoked. */
export async function resolveSession(): Promise<ResolvedSession | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({ where: { tokenHash: sha256(token) } });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  // Throttled lastSeenAt heartbeat — refresh at most every 5 minutes per session.
  const fiveMinutes = 5 * 60 * 1000;
  if (Date.now() - session.lastSeenAt.getTime() > fiveMinutes) {
    db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  }
  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user || user.status === "DELETED") return null;
  return { sessionId: session.id, userId: session.userId, activeWsId: session.activeWsId, expiresAt: session.expiresAt };
}

export { constantTimeEqual, SESSION_COOKIE };
