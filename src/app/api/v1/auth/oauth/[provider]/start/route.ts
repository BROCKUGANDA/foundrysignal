import { NextResponse } from "next/server";
import { handler } from "@/lib/contracts/http";
import { startOAuth } from "@/lib/auth/oauth";

// Cookie binding the OAuth state to the browser that initiated sign-in.
const STATE_COOKIE = "fs_oauth_state";

/** Begins the authorization-code flow. The state is stored server-side (hashed)
 * and the browser is redirected to the provider. The plaintext state is also
 * bound to this browser via an HttpOnly cookie that the callback must echo. */
export const GET = handler(async ({ req }) => {
  const provider = req.nextUrl.pathname.split("/").filter(Boolean).slice(-2, -1)[0] ?? "";
  const inviteToken = req.nextUrl.searchParams.get("invite") ?? undefined;
  const { url, state } = await startOAuth({ provider, inviteToken });
  const response = NextResponse.redirect(url, { status: 303 });
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/v1/auth/oauth",
    maxAge: 600,
  });
  return response;
});
