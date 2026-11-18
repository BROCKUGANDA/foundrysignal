import { handler, ok } from "@/lib/contracts/http";
import { requireAuth, requirePlatformRole } from "@/lib/auth/context";
import { db } from "@/lib/db";

/** Lists users for the admin console (MODERATOR+). Role changes are
 * PLATFORM_ADMIN-only and go through /admin/users/[id]/role. */
export const GET = handler(async ({ requestId }) => {
  const ctx = await requireAuth();
  await requirePlatformRole(ctx, ["PLATFORM_ADMIN", "MODERATOR"]);

  const users = await db.user.findMany({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      email: true,
      name: true,
      platformRole: true,
      userType: true,
      emailVerifiedAt: true,
      createdAt: true,
      memberships: {
        select: { role: true, workspace: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return {
    payload: ok(
      users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        platformRole: u.platformRole,
        userType: u.userType,
        emailVerified: !!u.emailVerifiedAt,
        createdAt: u.createdAt.toISOString(),
        workspaces: u.memberships.map((m) => ({ id: m.workspace.id, name: m.workspace.name, role: m.role })),
      })),
      requestId
    ),
  };
});
