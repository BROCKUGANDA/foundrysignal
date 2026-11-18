// Email delivery via Resend (config-gated). Honest: if not configured, callers
// must treat delivery as unavailable and never simulate sends.

import { sha256 } from "@/lib/auth/session";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface EmailResult {
  delivered: boolean;
  provider: "resend" | "none";
  id?: string;
  reason?: string;
}

function configured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

function fromAddress(): string {
  return process.env.EMAIL_FROM ?? "FoundrySignal <noreply@foundrysignal.aiazimara.com>";
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://foundrysignal.aiazimara.com").replace(/\/+$/, "");
}

export async function sendEmail(input: { to: string; subject: string; html: string; text?: string }): Promise<EmailResult> {
  if (!configured()) {
    return { delivered: false, provider: "none", reason: "EMAIL_NOT_CONFIGURED" };
  }
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) {
      return { delivered: false, provider: "resend", reason: data.message ?? `HTTP_${res.status}` };
    }
    return { delivered: true, provider: "resend", id: data.id };
  } catch (err) {
    return { delivered: false, provider: "resend", reason: String(err) };
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

export async function sendVerificationEmail(email: string, token: string): Promise<EmailResult> {
  const url = `${siteUrl()}/auth?verify=${encodeURIComponent(token)}`;
  return sendEmail({
    to: email,
    subject: "Verify your FoundrySignal email",
    html: `<p>Confirm your email for FoundrySignal.</p><p><a href="${url}">Verify email</a></p><p>If you did not create this account, you can ignore this message.</p>`,
    text: `Verify your FoundrySignal email: ${url}`,
  });
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<EmailResult> {
  const url = `${siteUrl()}/auth?reset=${encodeURIComponent(token)}`;
  return sendEmail({
    to: email,
    subject: "Reset your FoundrySignal password",
    html: `<p>Reset your FoundrySignal password.</p><p><a href="${url}">Reset password</a></p><p>If you did not request this, you can ignore this message.</p>`,
    text: `Reset your FoundrySignal password: ${url}`,
  });
}
export async function sendWorkspaceInvitationEmail(email: string, token: string, workspaceName: string): Promise<EmailResult> {
  const url = `${siteUrl()}/auth?invite=${encodeURIComponent(token)}`;
  return sendEmail({
    to: email,
    subject: `You're invited to the ${workspaceName} workspace on FoundrySignal`,
    html: `<p>You have been invited to collaborate on the <strong>${workspaceName}</strong> workspace on FoundrySignal.</p><p><a href="${url}">Accept invitation</a></p><p>This invitation expires in 7 days. If you were not expecting it, you can ignore this message.</p>`,
    text: `Accept the invitation to the ${workspaceName} workspace on FoundrySignal (expires in 7 days): ${url}`,
  });
}

export function hashToken(token: string): string {
  return sha256(token);
}
