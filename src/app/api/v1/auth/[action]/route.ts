import { NextRequest } from "next/server";
import { handler } from "@/lib/contracts/http";
import { registerUser, loginUser, logoutUser } from "@/lib/auth/service";
import { resolveSession } from "@/lib/auth/session";

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

export const POST = handler(async ({ req, requestId }) => {
  const action = req.nextUrl.pathname.split("/").pop();
  const body = await req.json().catch(() => ({}));

  if (action === "register") {
    const result = await registerUser(body, clientIp(req));
    return { payload: { success: true, data: result, metadata: { requestId, timestamp: new Date().toISOString(), version: "v1" } } };
  }
  if (action === "login") {
    const result = await loginUser(body, clientIp(req));
    return { payload: { success: true, data: result, metadata: { requestId, timestamp: new Date().toISOString(), version: "v1" } } };
  }
  if (action === "logout") {
    const session = await resolveSession();
    await logoutUser(session?.userId);
    return { payload: { success: true, data: { ok: true }, metadata: { requestId, timestamp: new Date().toISOString(), version: "v1" } } };
  }
  return {
    payload: {
      success: false,
      error: { code: "NOT_FOUND", message: "Unknown auth action", retryable: false, requestId },
      metadata: { requestId, timestamp: new Date().toISOString(), version: "v1" },
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
      metadata: { requestId, timestamp: new Date().toISOString(), version: "v1" },
    },
  };
});
