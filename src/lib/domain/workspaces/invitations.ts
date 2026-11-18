// Workspace invitations — shared helpers for the invitation lifecycle.
// Tokens are opaque random 32-byte values; only their sha256 hash is stored.
// Accepting requires an authenticated session whose email hash matches the
// invited email hash — an invitation is never transferable.

import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { sha256, emailHash } from "@/lib/auth/session";
import { ApiHttpError } from "@/lib/contracts/http";
import { recordAudit } from "@/lib/domain/shared/audit";
import { sendWorkspaceInvitationEmail } from "@/lib/domain/email/service";
import { type WorkspaceRole } from "@/lib/auth/context";

export const INVITE_TTL_MS = 7 * 24 * 3600 * 1000; // 7 days
export const WORKSPACE_ROLE_VALUES = ["OWNER", "ADMIN", "ANALYST", "VIEWER"] as const;

/** Caller-scoped rule: OWNER may invite any role; ADMIN may invite
 * ANALYST/VIEWER only (no privilege escalation above the caller). */
export function assertInviteRoleAllowed(callerRole: WorkspaceRole, invitedRole: WorkspaceRole): void {
  const allowed: Record<WorkspaceRole, WorkspaceRole[]> = {
    OWNER: ["OWNER", "ADMIN", "ANALYST", "VIEWER"],
    ADMIN: ["ANALYST", "VIEWER"],
    ANALYST: [],
    VIEWER: [],
  };
  if (!allowed[callerRole].includes(invitedRole)) {
    throw new ApiHttpError(
      "FORBIDDEN",
      `Your ${callerRole} role cannot invite users as ${invitedRole}.`,
      false,
    );
  }
}

export function generateInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: sha256(token) };
}

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface CreatedInvitation {
  invitationId: string;
  acceptUrl: string;
  /** true when email delivery was attempted and configured */
  delivered: boolean;
  /** present only when delivery is not configured — dev convenience, never a secret channel */
  devLink: boolean;
  expiresAt: string;
}

export async function createInvitation(input: {
  workspaceId: string;
  workspaceName: string;
  email: string;
  role: WorkspaceRole;
  createdById: string;
}): Promise<CreatedInvitation> {
  const email = normalizeInviteEmail(input.email);
  const eHash = emailHash(email);

  const existingMember = await db.membership.findFirst({
    where: { workspaceId: input.workspaceId, user: { emailHash: eHash } },
    select: { id: true },
  });
  if (existingMember) {
    throw new ApiHttpError("CONFLICT", "That user is already a member of this workspace.", false);
  }

  // Re-issuing supersedes any pending invitation for the same email.
  await db.membershipInvitation.updateMany({
    where: { workspaceId: input.workspaceId, emailHash: eHash, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  const { token, tokenHash } = generateInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const invitation = await db.membershipInvitation.create({
    data: {
      workspaceId: input.workspaceId,
      email,
      emailHash: eHash,
      role: input.role,
      tokenHash,
      expiresAt,
      createdById: input.createdById,
    },
  });

  await recordAudit({
    actorId: input.createdById,
    action: "MEMBERSHIP_INVITE_CREATE",
    targetType: "WORKSPACE",
    targetId: input.workspaceId,
    summary: `Invitation issued for ${email} as ${input.role}`,
    metadata: { invitationId: invitation.id, role: input.role },
  });

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://foundrysignal.aiazimara.com").replace(/\/+$/, "");
  const acceptUrl = `${siteUrl}/auth?invite=${encodeURIComponent(token)}`;
  const delivery = await sendWorkspaceInvitationEmail(email, token, input.workspaceName);

  if (delivery.delivered) {
    return { invitationId: invitation.id, acceptUrl: "", delivered: true, devLink: false, expiresAt: expiresAt.toISOString() };
  }
  if (delivery.provider === "resend") {
    // Provider attempted but rejected — still return the id, never the link publicly.
    console.error(JSON.stringify({ level: "warn", component: "invitations", message: `invitation email delivery failed: ${delivery.reason}` }));
  } else {
    // Delivery not configured — log the link for the operator and flag devLink.
    console.info(JSON.stringify({ level: "info", component: "invitations", message: "RESEND_API_KEY not configured; invitation accept link logged for operator", acceptUrl }));
  }
  return {
    invitationId: invitation.id,
    acceptUrl,
    delivered: false,
    devLink: delivery.provider === "none",
    expiresAt: expiresAt.toISOString(),
  };
}

export async function acceptInvitation(input: { userId: string; userEmailHash: string; sessionId: string; token: string }) {
  const tokenHash = sha256(input.token);
  const invitation = await db.membershipInvitation.findUnique({ where: { tokenHash } });
  if (!invitation) {
    throw new ApiHttpError("NOT_FOUND", "Invitation not found or already used.", false);
  }
  if (invitation.revokedAt) {
    throw new ApiHttpError("FORBIDDEN", "This invitation has been revoked.", false);
  }
  if (invitation.acceptedAt) {
    throw new ApiHttpError("CONFLICT", "This invitation has already been accepted.", false);
  }
  if (invitation.expiresAt < new Date()) {
    throw new ApiHttpError("FORBIDDEN", "This invitation has expired. Ask a workspace administrator to re-issue it.", false);
  }
  if (invitation.emailHash !== input.userEmailHash) {
    throw new ApiHttpError("FORBIDDEN", "This invitation was issued to a different email address.", false);
  }
  const existing = await db.membership.findUnique({
    where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: input.userId } },
  });
  if (existing) {
    throw new ApiHttpError("CONFLICT", "You are already a member of this workspace.", false);
  }

  const [membership] = await db.$transaction([
    db.membership.create({
      data: { workspaceId: invitation.workspaceId, userId: input.userId, role: invitation.role },
    }),
    db.membershipInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    }),
    // Make the invited workspace the active one for this session.
    db.session.update({
      where: { id: input.sessionId },
      data: { activeWsId: invitation.workspaceId },
    }),
  ]);

  await recordAudit({
    actorId: input.userId,
    action: "MEMBERSHIP_INVITE_ACCEPT",
    targetType: "WORKSPACE",
    targetId: invitation.workspaceId,
    summary: `Invitation accepted (${invitation.role})`,
    metadata: { invitationId: invitation.id },
  });

  return { workspaceId: invitation.workspaceId, role: membership.role };
}

export async function revokeInvitation(input: { invitationId: string; workspaceId: string; actorId: string }) {
  const invitation = await db.membershipInvitation.findUnique({ where: { id: input.invitationId } });
  if (!invitation || invitation.workspaceId !== input.workspaceId) {
    throw new ApiHttpError("NOT_FOUND", "Invitation not found.", false);
  }
  if (invitation.acceptedAt) {
    throw new ApiHttpError("CONFLICT", "Accepted invitations cannot be revoked.", false);
  }
  if (invitation.revokedAt) {
    return { revoked: true }; // idempotent
  }
  await db.membershipInvitation.update({ where: { id: invitation.id }, data: { revokedAt: new Date() } });
  await recordAudit({
    actorId: input.actorId,
    action: "MEMBERSHIP_INVITE_REVOKE",
    targetType: "WORKSPACE",
    targetId: invitation.workspaceId,
    summary: `Invitation revoked for ${invitation.email}`,
    metadata: { invitationId: invitation.id },
  });
  return { revoked: true };
}

export async function listPendingInvitations(workspaceId: string) {
  const invitations = await db.membershipInvitation.findMany({
    where: { workspaceId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  return invitations.map((i) => ({
    id: i.id,
    email: i.email,
    role: i.role,
    expiresAt: i.expiresAt.toISOString(),
    createdAt: i.createdAt.toISOString(),
  }));
}

