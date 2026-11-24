import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { handler } from "@/lib/contracts/http";
import { completeOAuth } from "@/lib/auth/oauth";
import { clientIp } from "@/lib/auth/client-ip";

const CHALLENGE_COOKIE = "fs_oauth_challenge";
const STATE_COOKIE = "fs_oauth_state";
const STATE_COOKIE_PATH = "/api/v1/auth/oauth";

function destination(pathAndQuery: string, fallbackOrigin: string): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  return `${configured ?? fallbackOrigin}${pathAndQuery}`;
}

/** Constant-time check that the callback's state matches the browser's cookie. */
function stateBoundToBrowser(cookieValue: string | undefined, state: string): boolean {
  if (!cookieValue || !state) return false;
  const a = Buffer.from(cookieValue, "utf8");
  const b = Buffer.from(state, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The state cookie is single-use: always clear it on the way out. */
function clearStateCookie(response: NextResponse): NextResponse {
  response.cookies.set(STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: STATE_COOKIE_PATH,
    maxAge: 0,
  });
  return response;
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
    return clearStateCookie(NextResponse.redirect(destination("/auth?oauth=denied", origin), { status: 303 }));
  }

  // Reject callbacks not initiated by this browser (e.g. a state URL sent to a victim).
  if (!stateBoundToBrowser(req.cookies.get(STATE_COOKIE)?.value, state)) {
    return clearStateCookie(NextResponse.redirect(destination("/auth?oauth=error", origin), { status: 303 }));
  }

  let result;
  try {
    result = await completeOAuth({ provider, code, state, ip: clientIp(req) });
  } catch {
    // Never reflect provider error details or tokens into a browser redirect.
    return clearStateCookie(NextResponse.redirect(destination("/auth?oauth=error", origin), { status: 303 }));
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
    return clearStateCookie(response);
  }

  return clearStateCookie(NextResponse.redirect(
    destination(result.isNew ? "/?oauth=registered" : "/?oauth=signin", origin),
    { status: 303 },
  ));
});
