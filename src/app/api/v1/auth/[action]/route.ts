import { NextRequest } from "next/server";
import { handler } from "@/lib/contracts/http";
import { registerUser, loginUser, logoutUser } from "@/lib/auth/service";
import { resolveSession } from "@/lib/auth/session";

function clientIp(req: NextRequest): string {
  // Cloudflare sets CF-Connecting-IP; the edge proxy sets X-Forwarded-For
  // from the peer address. A client-supplied XFF list must never be the
  // throttle key: rotating its first entry would bypass rate limits.
  const cf = req.headers.get("cf-connecting-ip");
  if (cf?.trim()) return cf.trim();
  const real = req.headers.get("x-real-ip");
  if (real?.trim()) return real.trim();
  const forwarded = req.headers.get("x-forwarded-for");
  const last = forwarded?.split(",").map((part) => part.trim()).filter(Boolean).pop();
  return last ?? "local";
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
