import { NextResponse } from "next/server";
import { handler } from "@/lib/contracts/http";
import { completeOAuth } from "@/lib/auth/oauth";
import { clientIp } from "@/lib/auth/client-ip";

const CHALLENGE_COOKIE = "fs_oauth_challenge";

function destination(pathAndQuery: string, fallbackOrigin: string): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  return `${configured ?? fallbackOrigin}${pathAndQuery}`;
}

/** Provider callback. The `code` and `state` are consumed once; no provider
 * token or user data is ever placed in the redirect URL. */
export const GET = handler(async ({ req }) => {
  const parts = req.nextUrl.pathname.split("/").filter(Boolean);
  const provider = parts.slice(-2, -1)[0] ?? "";
  const origin = req.nextUrl.origin;
  const error = req.nextUrl.searchParams.get("error");
  const code = req.nextUrl.searchParams.get("code") ?? "";
  const state = req.nextUrl.searchParams.get("state") ?? "";

  if (error || !code || !state) {
    return NextResponse.redirect(destination("/auth?oauth=denied", origin), { status: 303 });
  }

  let result;
  try {
    result = await completeOAuth({ provider, code, state, ip: clientIp(req) });
  } catch {
    // Never reflect provider error details or tokens into a browser redirect.
    return NextResponse.redirect(destination("/auth?oauth=error", origin), { status: 303 });
  }

  if (result.mfaRequired && result.challenge) {
    const response = NextResponse.redirect(destination("/auth?mode=mfa", origin), { status: 303 });
    response.cookies.set(CHALLENGE_COOKIE, result.challenge, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 300,
    });
    return response;
  }

  return NextResponse.redirect(
    destination(result.isNew ? "/?oauth=registered" : "/?oauth=signin", origin),
    { status: 303 },
  );
});
