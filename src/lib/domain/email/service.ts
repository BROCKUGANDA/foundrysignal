// Email delivery via Resend (config-gated). Honest: if not configured, callers
// must treat delivery as unavailable and never simulate sends.

import { sha256 } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { randomBytes } from "crypto";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function configured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

function fromAddress(): string {
  return process.env.EMAIL_FROM ?? "FoundrySignal <noreply@foundrysignal.aiazimara.com>";
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://foundrysignal.aiazimara.com").replace(/\/+$/, "");
}

async function sendEmail(input: { to: string; subject: string; html: string; text?: string }): Promise<{ delivered: boolean; id?: string; reason?: string }> {
  if (!configured()) return { delivered: false, reason: "EMAIL_NOT_CONFIGURED" };
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: fromAddress(), to: [input.to], subject: input.subject, html: input.html, text: input.text }),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) return { delivered: false, reason: data.message ?? `HTTP_${res.status}` };
    return { delivered: true, id: data.id };
  } catch (err) {
    return { delivered: false, reason: String(err) };
  }
}

export function emailDeliveryStatus() {
  const available = configured();
  return {
    available,
    level: available ? "CONFIGURED_RESEND" : "NOT_CONFIGURED",
    requiredEnv: available ? [] : ["RESEND_API_KEY"],
    from: available ? fromAddress() : null,
  };
}

/** Issues a single-use, hashed, expiring token. */
export async function issueToken(input: { email: string; kind: "VERIFY_EMAIL" | "RESET_PASSWORD"; userId?: string; ttlMinutes: number }): Promise<string> {
  // Invalidate prior unused tokens of the same kind for this email.
  await db.emailToken.updateMany({
    where: { email: input.email.toLowerCase(), kind: input.kind, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  const token = randomBytes(32).toString("base64url");
  await db.emailToken.create({
    data: {
      email: input.email.trim().toLowerCase(),
      kind: input.kind,
      userId: input.userId,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + input.ttlMinutes * 60 * 1000),
    },
  });
  return token;
}

/** Consumes a token if valid (unconsumed, unexpired, matching kind). */
export async function consumeToken(input: { token: string; kind: "VERIFY_EMAIL" | "RESET_PASSWORD" }) {
  const row = await db.emailToken.findUnique({ where: { tokenHash: sha256(input.token) } });
  if (!row || row.kind !== input.kind) return { ok: false as const, reason: "INVALID" };
  if (row.consumedAt) return { ok: false as const, reason: "CONSUMED" };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false as const, reason: "EXPIRED" };
  await db.emailToken.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
  return { ok: true as const, email: row.email, userId: row.userId };
}

export async function sendVerificationEmail(email: string, token: string) {
  const url = `${siteUrl()}/auth?verify=${encodeURIComponent(token)}`;
  return sendEmail({
    to: email,
    subject: "Verify your FoundrySignal email",
    html: `<p>Confirm your email for FoundrySignal.</p><p><a href="${url}">Verify email</a></p><p>If you did not create this account, you can ignore this message.</p>`,
    text: `Verify your FoundrySignal email: ${url}`,
  });
}

export async function sendPasswordResetEmail(email: string, token: string) {
  const url = `${siteUrl()}/auth?reset=${encodeURIComponent(token)}`;
  return sendEmail({
    to: email,
    subject: "Reset your FoundrySignal password",
    html: `<p>Reset your FoundrySignal password.</p><p><a href="${url}">Reset password</a></p><p>If you did not request this, you can ignore this message.</p>`,
    text: `Reset your FoundrySignal password: ${url}`,
  });
}
