/**
 * OAuth 2.0 authorization-code sign-in for GitHub and Google.
 *
 * Security rules enforced here:
 *  - State is a 256-bit random value, stored only as a SHA-256 hash; the
 *    callback must present the matching plaintext. State is single-use and
 *    expires in 10 minutes. This is the CSRF defense for the callback.
 *  - PKCE S256 is used for both providers (GitHub supports it). The verifier is
 *    held server-side, never in a URL or browser-readable cookie.
 *  - redirect_uri is derived exclusively from NEXT_PUBLIC_SITE_URL, never from
 *    a request parameter, so an attacker cannot redirect the code to themselves.
 *  - Account linking happens ONLY through a provider-asserted verified email.
 *    Names, avatars and provider user ids are never used to identify a person.
 *  - An existing account with TOTP MFA gets a step-up challenge and no session.
 *  - Provider tokens are used in-memory for one userinfo call and never stored.
 */
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { ApiHttpError } from "@/lib/contracts/http";
import { recordAudit } from "@/lib/domain/shared/audit";
import { acceptInvitation } from "@/lib/domain/workspaces/invitations";
import { slugifyWorkspace } from "@/lib/domain/shared/slug";
import { emailHash, hashPassword, createSession } from "./session";
import { sha256 } from "./session";
import { issueMfaChallenge } from "./mfa";

export type OAuthProvider = "GITHUB" | "GOOGLE";

const STATE_TTL_MS = 10 * 60 * 1000;

function parseProvider(value: string): OAuthProvider {
  const upper = value.toUpperCase();
  if (upper !== "GITHUB" && upper !== "GOOGLE") {
    throw new ApiHttpError("VALIDATION_FAILED", "Unsupported OAuth provider.", false);
  }
  return upper;
}

export function oauthProviders(): OAuthProvider[] {
  const providers: OAuthProvider[] = [];
  if (process.env.GITHUB_OAUTH_CLIENT_ID && process.env.GITHUB_OAUTH_CLIENT_SECRET) providers.push("GITHUB");
  if (process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET) providers.push("GOOGLE");
  return providers;
}

function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (!raw) {
    throw new ApiHttpError("CONFIGURATION_REQUIRED", "NEXT_PUBLIC_SITE_URL is required for OAuth sign-in.", false, {
      requiredEnv: ["NEXT_PUBLIC_SITE_URL"],
    });
  }
  return raw.replace(/\/+$/, "");
}

function providerConfig(provider: OAuthProvider) {
  const clientId = provider === "GITHUB"
    ? process.env.GITHUB_OAUTH_CLIENT_ID
    : process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = provider === "GITHUB"
    ? process.env.GITHUB_OAUTH_CLIENT_SECRET
    : process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new ApiHttpError("CONFIGURATION_REQUIRED", `${provider} sign-in is not configured.`, false, {
      requiredEnv: provider === "GITHUB"
        ? ["GITHUB_OAUTH_CLIENT_ID", "GITHUB_OAUTH_CLIENT_SECRET"]
        : ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"],
    });
  }
  return { clientId, clientSecret };
}

export function redirectUri(provider: OAuthProvider): string {
  return `${siteUrl()}/api/v1/auth/oauth/${provider.toLowerCase()}/callback`;
}

/** RFC 7636 S256 challenge. Exported for the published test vector. */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export async function startOAuth(input: {
  provider: string;
  inviteToken?: string;
}): Promise<{ url: string; state: string }> {
  const provider = parseProvider(input.provider);
  const { clientId } = providerConfig(provider);
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  await db.oAuthState.create({
    data: {
      stateHash: sha256(state),
      provider,
      codeVerifier: verifier,
      inviteToken: input.inviteToken || null,
      expires: new Date(Date.now() + STATE_TTL_MS),
    },
  });

  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(provider),
    state,
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: "S256",
  });
  const url = provider === "GITHUB"
    ? `https://github.com/login/oauth/authorize?${query.toString()}&scope=${encodeURIComponent("read:user user:email")}`
    : `https://accounts.google.com/o/oauth2/v2/auth?${query.toString()}&response_type=code&scope=${encodeURIComponent("openid email profile")}&access_type=online`;
  return { url, state };
}

type FetchImpl = typeof globalThis.fetch;

/** Consumes state, exchanges the code, resolves a verified email and signs in. */
export async function completeOAuth(input: {
  provider: string;
  code: string;
  state: string;
  ip: string;
  fetchImpl?: FetchImpl;
}): Promise<{
  userId: string;
  workspaceId: string | null;
  isNew: boolean;
  mfaRequired: boolean;
  challenge: string | null;
}> {
  const provider = parseProvider(input.provider);
  const { clientId, clientSecret } = providerConfig(provider);
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  if (!input.code || !input.state) {
    throw new ApiHttpError("VALIDATION_FAILED", "The provider returned an incomplete callback.", false);
  }

  const state = await db.oAuthState.findUnique({ where: { stateHash: sha256(input.state) } });
  if (!state || state.provider !== provider) {
    throw new ApiHttpError("VALIDATION_FAILED", "Invalid OAuth state.", false);
  }
  if (state.usedAt || state.expires < new Date()) {
    throw new ApiHttpError("VALIDATION_FAILED", "This sign-in request has expired. Try again.", false);
  }
  const consumed = await db.oAuthState.updateMany({ where: { id: state.id, usedAt: null }, data: { usedAt: new Date() } });
  if (consumed.count !== 1) {
    throw new ApiHttpError("VALIDATION_FAILED", "This sign-in request was already used.", false);
  }

  const tokenBody = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code: input.code,
    redirect_uri: redirectUri(provider),
    code_verifier: state.codeVerifier,
  });
  if (provider === "GOOGLE") tokenBody.set("grant_type", "authorization_code");

  const tokenEndpoint = provider === "GITHUB"
    ? "https://github.com/login/oauth/access_token"
    : "https://oauth2.googleapis.com/token";
  let tokenResponse: Response;
  try {
    tokenResponse = await fetchImpl(tokenEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
        "user-agent": "FoundrySignal",
      },
      body: tokenBody.toString(),
    });
  } catch {
    throw new ApiHttpError("PROVIDER_UNAVAILABLE", "The identity provider could not be reached.", true);
  }
  if (!tokenResponse.ok) {
    throw new ApiHttpError("UNAUTHENTICATED", "The provider rejected the sign-in request.", false);
  }
  const tokenJson = (await tokenResponse.json().catch(() => ({}))) as Record<string, unknown>;
  const accessToken = typeof tokenJson.access_token === "string" ? tokenJson.access_token : "";
  if (!accessToken) {
    throw new ApiHttpError("UNAUTHENTICATED", "No access token was returned by the provider.", false);
  }

  const authHeaders = {
    authorization: `Bearer ${accessToken}`,
    accept: "application/json",
    "user-agent": "FoundrySignal",
  };
  let email: string | null = null;
  try {
    if (provider === "GOOGLE") {
      const res = await fetchImpl("https://openidconnect.googleapis.com/v1/userinfo", { headers: authHeaders });
      if (res.ok) {
        const info = (await res.json()) as { email?: string; email_verified?: boolean };
        if (info.email_verified === true && typeof info.email === "string") email = info.email;
      }
    } else {
      const res = await fetchImpl("https://api.github.com/user/emails", { headers: authHeaders });
      if (res.ok) {
        const emails = (await res.json()) as Array<{ email?: string; primary?: boolean; verified?: boolean }>;
        const primary = emails.find((e) => e.primary === true && e.verified === true && typeof e.email === "string");
        email = primary?.email ?? emails.find((e) => e.verified === true && typeof e.email === "string")?.email ?? null;
      }
    }
  } catch {
    throw new ApiHttpError("PROVIDER_UNAVAILABLE", "The identity provider could not be reached.", true);
  }
  if (!email) {
    throw new ApiHttpError("VALIDATION_FAILED", "That provider account has no verified email address, so it cannot be linked.", false);
  }
  const normalizedEmail = email.trim().toLowerCase();
  const eHash = emailHash(normalizedEmail);

  let user = await db.user.findUnique({ where: { emailHash: eHash } });
  let isNew = false;
  if (user && user.status !== "ACTIVE") {
    throw new ApiHttpError("FORBIDDEN", "This account is not active.", false);
  }
  if (!user) {
    user = await db.user.create({
      data: {
        email: normalizedEmail,
        emailHash: eHash,
        passwordHash: await hashPassword(randomBytes(32).toString("base64url")),
        platformRole: "USER",
        userType: "VENTURE_INVESTOR",
        emailVerifiedAt: new Date(),
      },
    });
    isNew = true;
  }

  const mfa = await db.mfaCredential.findUnique({ where: { userId: user.id } });
  if (mfa?.enabled) {
    const challenge = await issueMfaChallenge(user.id);
    if (!challenge) throw new ApiHttpError("INTERNAL", "Could not issue a second-factor challenge.", false);
    await recordAudit({
      actorId: user.id,
      action: isNew ? "AUTH_OAUTH_REGISTER" : "AUTH_OAUTH_SIGNIN",
      targetType: "USER",
      targetId: user.id,
      summary: `${provider} sign-in requires second factor`,
      metadata: { ip: input.ip, provider },
    });
    return { userId: user.id, workspaceId: null, isNew, mfaRequired: true, challenge };
  }

  let workspaceId: string | null = null;
  if (isNew) {
    const ws = await db.workspace.create({
      data: {
        name: "Personal workspace",
        slug: slugifyWorkspace(`ws-${user.id.slice(-8)}`),
        kind: "PERSONAL",
      },
    });
    await db.membership.create({ data: { workspaceId: ws.id, userId: user.id, role: "OWNER" } });
    workspaceId = ws.id;
  } else {
    const membership = await db.membership.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
    workspaceId = membership?.workspaceId ?? null;
  }
  const session = await createSession(user.id, workspaceId ?? undefined);

  if (state.inviteToken) {
    try {
      await acceptInvitation({ userId: user.id, userEmailHash: user.emailHash, sessionId: session.sessionId, token: state.inviteToken });
    } catch {
      // Invitation failure must not undo a successful sign-in; the client
      // reports it through the same path as a password sign-in.
      console.info(JSON.stringify({ level: "info", component: "oauth", message: "invitation acceptance failed after sign-in" }));
    }
  }

  await recordAudit({
    actorId: user.id,
    action: isNew ? "AUTH_OAUTH_REGISTER" : "AUTH_OAUTH_SIGNIN",
    targetType: "USER",
    targetId: user.id,
    summary: `${provider} ${isNew ? "registration" : "sign-in"}`,
    metadata: { ip: input.ip, provider },
  });
  return { userId: user.id, workspaceId, isNew, mfaRequired: false, challenge: null };
}
