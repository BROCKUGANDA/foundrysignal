import { NextResponse } from "next/server";
import { handler } from "@/lib/contracts/http";
import { startOAuth } from "@/lib/auth/oauth";

const STATE_COOKIE = "fs_oauth_state";

/** Begins the authorization-code flow. The state is stored server-side (hashed)
 * and also bound to this browser via an HttpOnly cookie, so the callback only
 * completes in the browser that started sign-in. Nothing about the user is
 * trusted from the query string except an optional invitation token. */
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
