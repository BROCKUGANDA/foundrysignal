import { NextRequest, NextResponse } from "next/server";
import { completeOAuth } from "@/lib/domain/auth/oauth";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const jar = await cookies();
  const state = req.nextUrl.searchParams.get("state");
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  const expectedState = jar.get("fs_oauth_state")?.value;
  const codeVerifier = jar.get("fs_oauth_verifier")?.value;
  jar.delete("fs_oauth_state");
  jar.delete("fs_oauth_verifier");

  const fail = (msg: string) => {
    const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
    return NextResponse.redirect(`${base}/auth?oauthError=${encodeURIComponent(msg)}`);
  };

  if (error) return fail(String(error));
  if (!code || !state || !expectedState || state !== expectedState || !codeVerifier) {
    return fail("OAuth state verification failed. Try signing in again.");
  }
  try {
    await completeOAuth("github", code, codeVerifier);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Sign-in failed.");
  }
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return NextResponse.redirect(`${base}/`);
}
