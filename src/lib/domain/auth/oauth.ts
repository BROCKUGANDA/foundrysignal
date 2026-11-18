// OAuth sign-in — state+PKCE nonce, creates/links the user by email, mints
// an opaque session. Provider identity is fetched server-side (never from
// the browser) and verified before any account exists.

import { db } from "@/lib/db";
import { emailHash, createSession } from "@/lib/auth/session";
import { slugifyWorkspace } from "@/lib/domain/shared/slug";
import { recordAudit } from "@/lib/domain/shared/audit";
import { randomBytes, createHash } from "crypto";

type Provider = "github" | "google";

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function providerConfigured(p: Provider): boolean {
  return p === "github"
    ? !!(process.env.GITHUB_OAUTH_CLIENT_ID && process.env.GITHUB_OAUTH_CLIENT_SECRET)
    : !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

function redirectUri(provider: Provider): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return `${base}/api/v1/auth/oauth/${provider}/callback`;
}

export interface OAuthStart {
  url: string;
  state: string;
  codeVerifier: string;
}

export function startOAuth(provider: Provider): OAuthStart {
  if (!providerConfigured(provider)) {
    throw new Error(`${provider} OAuth is not configured on this deployment.`);
  }
  const state = b64url(randomBytes(24));
  const codeVerifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(codeVerifier).digest());
  if (provider === "github") {
    const params = new URLSearchParams({
      client_id: process.env.GITHUB_OAUTH_CLIENT_ID!,
      redirect_uri: redirectUri("github"),
      scope: "read:user user:email",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    return { url: `https://github.com/login/oauth/authorize?${params}`, state, codeVerifier };
  }
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    redirect_uri: redirectUri("google"),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    access_type: "online",
  });
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, state, codeVerifier };
}

interface OAuthProfile {
  providerAccountId: string;
  email: string;
  name: string | null;
}

async function fetchProfile(provider: Provider, code: string, codeVerifier: string): Promise<OAuthProfile> {
  if (provider === "github") {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: process.env.GITHUB_OAUTH_CLIENT_ID,
        client_secret: process.env.GITHUB_OAUTH_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri("github"),
        code_verifier: codeVerifier,
      }),
    });
    const token = (await tokenRes.json().catch(() => ({}))) as { access_token?: string; error?: string };
    if (!token.access_token) throw new Error(`GitHub token exchange failed: ${token.error ?? tokenRes.status}`);
    const headers = { Authorization: `Bearer ${token.access_token}`, "User-Agent": "foundrysignal", Accept: "application/vnd.github+json" };
    const userRes = await fetch("https://api.github.com/user", { headers });
    const user = (await userRes.json()) as { id?: number; login?: string; name?: string | null };
    if (!user?.id) throw new Error("GitHub user fetch failed");
    const emailsRes = await fetch("https://api.github.com/user/emails", { headers });
    const emails = (await emailsRes.json()) as Array<{ email: string; primary: boolean; verified: boolean }>;
    const primary = Array.isArray(emails) ? (emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified)) : undefined;
    if (!primary?.email) throw new Error("GitHub account has no verified email");
    return { providerAccountId: String(user.id), email: primary.email, name: user.name ?? user.login ?? null };
  }
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri("google"),
      grant_type: "authorization_code",
    }),
  });
  const token = (await tokenRes.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!token.access_token) throw new Error(`Google token exchange failed: ${token.error ?? tokenRes.status}`);
  const profileRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const profile = (await profileRes.json()) as { sub?: string; email?: string; name?: string; email_verified?: boolean };
  if (!profile?.sub || !profile.email) throw new Error("Google userinfo fetch failed");
  if (profile.email_verified === false) throw new Error("Google account email is not verified");
  return { providerAccountId: profile.sub, email: profile.email, name: profile.name ?? null };
}

/** Signs in (or creates) the user for the provider identity. Returns whether created. */
export async function completeOAuth(provider: Provider, code: string, codeVerifier: string): Promise<{ userId: string; created: boolean }> {
  const profile = await fetchProfile(provider, code, codeVerifier);
  const eHash = emailHash(profile.email);
  const existing = await db.user.findUnique({ where: { emailHash: eHash } });
  if (existing) {
    if (existing.status === "DELETED") throw new Error("Account deleted.");
    await createSession(existing.id);
    await recordAudit({ actorId: existing.id, action: "AUTH_OAUTH_SIGNIN", targetType: "USER", targetId: existing.id, summary: `Signed in via ${provider} (existing)` });
    return { userId: existing.id, created: false };
  }
  const user = await db.user.create({
    data: {
      email: profile.email.trim().toLowerCase(),
      emailHash: eHash,
      name: profile.name,
      // Not a usable password hash — password login is disabled for OAuth-created users.
      passwordHash: b64url(randomBytes(48)),
      platformRole: "USER",
      userType: "VENTURE_INVESTOR",
      emailVerifiedAt: new Date(), // provider-verified email
    },
  });
  const ws = await db.workspace.create({
    data: { name: profile.name ? `${profile.name}'s workspace` : "Personal workspace", slug: slugifyWorkspace(`ws-${user.id.slice(-8)}`), kind: "PERSONAL" },
  });
  await db.membership.create({ data: { workspaceId: ws.id, userId: user.id, role: "OWNER" } });
  await createSession(user.id, ws.id);
  await recordAudit({ actorId: user.id, action: "AUTH_OAUTH_REGISTER", targetType: "USER", targetId: user.id, summary: `Registered via ${provider}` });
  return { userId: user.id, created: true };
}
