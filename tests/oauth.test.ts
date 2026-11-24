// OAuth integration tests. Provider HTTP is injected as a fake fetch; all
// state, user and session writes go to the real database.
import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";

mock.module("next/headers", () => ({
  cookies: async () => ({ get: (_n: string) => undefined, set: () => {}, delete: () => {} }),
}));

const { db } = await import("@/lib/db");
const { emailHash, hashPassword, sha256 } = await import("@/lib/auth/session");
const oauth = await import("@/lib/auth/oauth");
const mfa = await import("@/lib/auth/mfa");

const createdUserIds: string[] = [];
const createdWorkspaceIds: string[] = [];

beforeAll(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "http://127.0.0.1:3000";
  process.env.GITHUB_OAUTH_CLIENT_ID = "gh-client-id";
  process.env.GITHUB_OAUTH_CLIENT_SECRET = "gh-client-secret";
  process.env.GOOGLE_OAUTH_CLIENT_ID = "go-client-id";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "go-client-secret";
  process.env.MFA_ENCRYPTION_KEY = "oauth-test-mfa-key";
});

afterEach(async () => {
  await db.user.deleteMany({ where: { id: { in: createdUserIds.splice(0) } } });
  await db.workspace.deleteMany({ where: { id: { in: createdWorkspaceIds.splice(0) } } });
  await db.oAuthState.deleteMany({});
});

function fakeFetch(provider: "GITHUB" | "GOOGLE", email: string, verified = true): typeof globalThis.fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST") {
      const body = String(init.body ?? "");
      // PKCE verifier must be sent on the token exchange for both providers.
      expect(body).toContain("code_verifier=");
      expect(body).toContain("redirect_uri=");
      return new Response(JSON.stringify({ access_token: `token-${provider.toLowerCase()}` }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (provider === "GITHUB" && url.includes("api.github.com/user/emails")) {
      return new Response(JSON.stringify([{ email, primary: true, verified }]), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (provider === "GOOGLE" && url.includes("userinfo")) {
      return new Response(JSON.stringify({ email, email_verified: verified }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`unexpected provider URL: ${url}`);
  }) as typeof globalThis.fetch;
}

async function begin(provider: "GITHUB" | "GOOGLE") {
  const started = await oauth.startOAuth({ provider });
  const url = new URL(started.url);
  return { state: started.state, codeChallenge: url.searchParams.get("code_challenge") ?? "", url };
}

describe("PKCE (RFC 7636 Appendix B)", () => {
  test("S256 challenge matches the published vector", () => {
    expect(oauth.pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"))
      .toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});

describe("authorization request", () => {
  test("stores only a hash of state and derives redirect_uri from the site URL", async () => {
    const { state, codeChallenge, url } = await begin("GITHUB");
    expect(state).toHaveLength(43);
    expect(codeChallenge).toHaveLength(43);
    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(url.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:3000/api/v1/auth/oauth/github/callback");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe("read:user user:email");
    const row = await db.oAuthState.findUnique({ where: { stateHash: sha256(state) } });
    expect(row).not.toBeNull();
    expect(row!.stateHash).not.toBe(state);
    expect(row!.codeVerifier).toHaveLength(43);
  });

  test("unconfigured or unknown providers are rejected", () => {
    expect(oauth.startOAuth({ provider: "TWITTER" })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });
});

describe("callback", () => {
  test("a verified email creates an account and a session", async () => {
    const email = `oauth-new-${Date.now()}@test.local`;
    const { state } = await begin("GITHUB");
    const result = await oauth.completeOAuth({
      provider: "GITHUB", code: "gh-code", state, ip: "127.0.0.1", fetchImpl: fakeFetch("GITHUB", email),
    });
    expect(result.isNew).toBe(true);
    expect(result.mfaRequired).toBe(false);
    const user = await db.user.findUnique({ where: { emailHash: emailHash(email) } });
    expect(user).not.toBeNull();
    createdUserIds.push(user!.id);
    const ws = await db.workspace.findFirst({ where: { name: "Personal workspace" } });
    if (ws) createdWorkspaceIds.push(ws.id);
    expect(user!.emailVerifiedAt).not.toBeNull();
    expect(await db.session.count({ where: { userId: user!.id, revokedAt: null } })).toBe(1);
  });

  test("the same verified email links to the existing account, never a duplicate", async () => {
    const email = `oauth-existing-${Date.now()}@test.local`;
    const user = await db.user.create({
      data: { email, emailHash: emailHash(email), passwordHash: await hashPassword("existing-password-123") },
    });
    createdUserIds.push(user.id);
    const { state } = await begin("GOOGLE");
    const result = await oauth.completeOAuth({
      provider: "GOOGLE", code: "go-code", state, ip: "127.0.0.1", fetchImpl: fakeFetch("GOOGLE", email),
    });
    expect(result.isNew).toBe(false);
    expect(result.userId).toBe(user.id);
    expect(await db.user.count({ where: { emailHash: emailHash(email) } })).toBe(1);
  });

  test("an unverified provider email is rejected without creating anything", async () => {
    const email = `oauth-unverified-${Date.now()}@test.local`;
    const { state } = await begin("GOOGLE");
    expect(oauth.completeOAuth({
      provider: "GOOGLE", code: "go-code", state, ip: "x", fetchImpl: fakeFetch("GOOGLE", email, false),
    })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(await db.user.count({ where: { emailHash: emailHash(email) } })).toBe(0);
  });

  test("state is single-use and cannot be replayed", async () => {
    const email = `oauth-replay-${Date.now()}@test.local`;
    const { state } = await begin("GITHUB");
    const fetchImpl = fakeFetch("GITHUB", email);
    const first = await oauth.completeOAuth({ provider: "GITHUB", code: "gh-code", state, ip: "x", fetchImpl });
    createdUserIds.push(first.userId);
    expect(oauth.completeOAuth({ provider: "GITHUB", code: "gh-code", state, ip: "x", fetchImpl }))
      .rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  test("a state issued for one provider cannot be used for another", async () => {
    const { state } = await begin("GITHUB");
    expect(oauth.completeOAuth({
      provider: "GOOGLE", code: "go-code", state, ip: "x",
      fetchImpl: fakeFetch("GOOGLE", "x@test.local"),
    })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  test("an account with TOTP gets a challenge and no session", async () => {
    const email = `oauth-mfa-${Date.now()}@test.local`;
    const user = await db.user.create({
      data: { email, emailHash: emailHash(email), passwordHash: await hashPassword("existing-password-123") },
    });
    createdUserIds.push(user.id);
    const started = await mfa.startEnrollment({
      userId: user.id, password: "existing-password-123",
      currentPasswordHash: user.passwordHash,
      verifyPassword: (p: string, h: string) => import("bcryptjs").then((m) => m.default.compare(p, h)),
    });
    const { totpAt } = await import("@/lib/auth/totp");
    await mfa.confirmEnrollment({ userId: user.id, code: totpAt(started.secret, Math.floor(Date.now() / 1000)) });

    const before = await db.session.count({ where: { userId: user.id } });
    const { state } = await begin("GITHUB");
    const result = await oauth.completeOAuth({
      provider: "GITHUB", code: "gh-code", state, ip: "x", fetchImpl: fakeFetch("GITHUB", email),
    });
    expect(result.mfaRequired).toBe(true);
    expect(result.challenge).toBeTruthy();
    expect(await db.session.count({ where: { userId: user.id } })).toBe(before);
  });
});
