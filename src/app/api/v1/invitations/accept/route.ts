import { z } from "zod";
import { handler, ok, ApiHttpError } from "@/lib/contracts/http";
import { requireAuth } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { acceptInvitation } from "@/lib/domain/workspaces/invitations";

const AcceptSchema = z.object({
  token: z.string().min(16).max(512),
});

/** Accepts an invitation. Authenticated user's email hash must match the
 * invited email — invitations are not transferable. Creates the membership
 * (unique per workspace+user), marks the token used, and makes the invited
 * workspace active for the current session. 409 when already a member. */
export const POST = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();

  const parsed = AcceptSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new ApiHttpError("VALIDATION_FAILED", "A valid invitation token is required.", false);
  }

  const user = await db.user.findUnique({
    where: { id: ctx.userId },
    select: { emailHash: true, status: true },
  });
  if (!user || user.status === "DELETED") {
    throw new ApiHttpError("UNAUTHENTICATED", "Session is no longer valid.", false);
  }


  const result = await acceptInvitation({
    userId: ctx.userId,
    userEmailHash: user.emailHash, // stored hash matches invitation.emailHash
    sessionId: ctx.session.sessionId,
    token: parsed.data.token,
  });

  return { payload: ok({ accepted: true, ...result }, requestId) };
});
