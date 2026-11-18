import { NextResponse } from "next/server";
import { startOAuth, providerConfigured } from "@/lib/domain/auth/oauth";
import { cookies } from "next/headers";

const isProd = process.env.NODE_ENV === "production";

/** Redirects to the provider's consent page. State + PKCE verifier are stored in a short-lived HttpOnly cookie. */
export async function GET() {
  if (!providerConfigured("github")) {
    return NextResponse.json(
      { success: false, error: { code: "OAUTH_NOT_CONFIGURED", message: "github sign-in is not configured on this deployment.", retryable: false }, metadata: { requestId: "oauth-start", timestamp: new Date().toISOString(), version: "v1" } },
      { status: 503 },
    );
  }
  const { url, state, codeVerifier } = startOAuth("github");
  const jar = await cookies();
  jar.set("fs_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: isProd, maxAge: 600, path: "/" });
  jar.set("fs_oauth_verifier", codeVerifier, { httpOnly: true, sameSite: "lax", secure: isProd, maxAge: 600, path: "/" });
  return NextResponse.redirect(url);
}
