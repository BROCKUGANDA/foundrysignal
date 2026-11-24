import { NextResponse } from "next/server";
import { handler } from "@/lib/contracts/http";
import { startOAuth } from "@/lib/auth/oauth";

/** Begins the authorization-code flow. The state is stored server-side (hashed)
 * and the browser is redirected to the provider. Nothing about the user is
 * trusted from the query string except an optional invitation token. */
export const GET = handler(async ({ req }) => {
  const provider = req.nextUrl.pathname.split("/").filter(Boolean).slice(-2, -1)[0] ?? "";
  const inviteToken = req.nextUrl.searchParams.get("invite") ?? undefined;
  const { url } = await startOAuth({ provider, inviteToken });
  return NextResponse.redirect(url, { status: 303 });
});
