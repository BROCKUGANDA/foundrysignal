import { db } from "@/lib/db";
import { resolveSession, ResolvedSession } from "./session";
import { ApiHttpError } from "@/lib/contracts/http";

export type PlatformRole = "USER" | "MODERATOR" | "PLATFORM_ADMIN";
export type WorkspaceRole = "OWNER" | "ADMIN" | "ANALYST" | "VIEWER";

const ROLE_RANK: Record<WorkspaceRole, number> = { VIEWER: 0, ANALYST: 1, ADMIN: 2, OWNER: 3 };

export interface AuthContext {
  session: ResolvedSession;
  userId: string;
  platformRole: PlatformRole;
  workspaceId: string;
  workspaceRole: WorkspaceRole;
}

/**
 * Resolves the authenticated user + active workspace.
 * Throws UNAUTHENTICATED / FORBIDDEN as ApiHttpError for route handlers.
 */
export async function requireAuth(): Promise<AuthContext> {
  const session = await resolveSession();
  if (!session) throw new ApiHttpError("UNAUTHENTICATED", "Authentication required.", false);

  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user || user.status === "DELETED") {
    throw new ApiHttpError("UNAUTHENTICATED", "Session is no longer valid.", false);
  }

  const wsId =
    session.activeWsId ??
    (await db.membership.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }))?.workspaceId;

  if (!wsId) throw new ApiHttpError("FORBIDDEN", "No workspace available for this account.", false);

  const membership = await db.membership.findUnique({
    where: { workspaceId_userId: { workspaceId: wsId, userId: user.id } },
  });
  if (!membership) throw new ApiHttpError("FORBIDDEN", "You do not have access to this workspace.", false);

  return {
    session,
    userId: user.id,
    platformRole: user.platformRole as PlatformRole,
    workspaceId: wsId,
    workspaceRole: membership.role as WorkspaceRole,
  };
}

export async function requirePlatformRole(ctx: AuthContext, roles: PlatformRole[]): Promise<void> {
  if (!roles.includes(ctx.platformRole)) {
    throw new ApiHttpError("FORBIDDEN", "Platform administrator role required.", false);
  }
}

/** Service-layer authorization: workspace role must meet the required rank. */
export function requireWorkspaceRole(ctx: AuthContext, min: WorkspaceRole): void {
  if (ROLE_RANK[ctx.workspaceRole] < ROLE_RANK[min]) {
    throw new ApiHttpError("FORBIDDEN", `Requires ${min} role in this workspace.`, false);
  }
}

/**
 * Tenant guard for workspace-scoped resources. Confirms the context's
 * workspace owns the resource — cross-tenant access is rejected.
 */
export function assertTenant(ctx: AuthContext, resourceWorkspaceId: string): void {
  if (resourceWorkspaceId !== ctx.workspaceId) {
    throw new ApiHttpError("FORBIDDEN", "Resource belongs to a different workspace.", false);
  }
}

export { ROLE_RANK };
