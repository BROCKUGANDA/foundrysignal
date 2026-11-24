// TOTP MFA integration tests against a real PostgreSQL database.
// next/headers is mocked so createSession can run outside a Next request;
// bun test --isolate keeps that module mock confined to this file.
import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";

const fakeJar = {
  get: (_name: string) => undefined,
  set: (_name: string, _value: string, _opts?: unknown) => {},
  delete: (_name: string) => {},
};
mock.module("next/headers", () => ({ cookies: async () => fakeJar }));

const { db } = await import("@/lib/db");
const { emailHash, hashPassword, sha256, verifyPassword } = await import("@/lib/auth/session");
const { totpAt } = await import("@/lib/auth/totp");
const mfa = await import("@/lib/auth/mfa");
const service = await import("@/lib/auth/service");

const NOW = 1_700_000_000;
const ORIGINAL_KEY = process.env.MFA_ENCRYPTION_KEY;
const createdUserIds: string[] = [];
const createdWorkspaceIds: string[] = [];

beforeAll(() => {
  process.env.MFA_ENCRYPTION_KEY = "test-mfa-key-32-bytes-derived-by-sha256";
});

afterEach(async () => {
  if (ORIGINAL_KEY === undefined) delete process.env.MFA_ENCRYPTION_KEY;
  else process.env.MFA_ENCRYPTION_KEY = ORIGINAL_KEY;
  await db.user.deleteMany({ where: { id: { in: createdUserIds.splice(0) } } });
  await db.workspace.deleteMany({ where: { id: { in: createdWorkspaceIds.splice(0) } } });
});

async function makeUser(tag: string) {
  const suffix = `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const user = await db.user.create({
    data: {
      email: `${suffix}@test.local`,
      emailHash: emailHash(`${suffix}@test.local`),
      name: tag,
      passwordHash: await hashPassword("correct-password-123"),
    },
  });
  const ws = await db.workspace.create({ data: { name: tag, slug: `mfa-${suffix}` } });
  await db.membership.create({ data: { workspaceId: ws.id, userId: user.id, role: "OWNER" } });
  createdUserIds.push(user.id);
  createdWorkspaceIds.push(ws.id);
  return { user, ws };
}

async function enroll(tag: string) {
  const ctx = await makeUser(tag);
  const started = await mfa.startEnrollment({
    userId: ctx.user.id,
    password: "correct-password-123",
    currentPasswordHash: ctx.user.passwordHash,
    verifyPassword,
  });
  const code = totpAt(started.secret, NOW);
  const confirmed = await mfa.confirmEnrollment({ userId: ctx.user.id, code, nowSeconds: NOW });
  return { ...ctx, started, confirmed, code };
}

async function freshChallenge(userId: string): Promise<string> {
  const challenge = await mfa.issueMfaChallenge(userId);
  if (!challenge) throw new Error("expected a challenge");
  return challenge;
}

describe("MFA capability", () => {
  test("reports configured only when MFA_ENCRYPTION_KEY is present", () => {
    expect(mfa.mfaConfigured()).toBe(true);
    delete process.env.MFA_ENCRYPTION_KEY;
    expect(mfa.mfaConfigured()).toBe(false);
    process.env.MFA_ENCRYPTION_KEY = "test-mfa-key-32-bytes-derived-by-sha256";
  });

  test("fails closed when the key is missing — no bypass, no enrollment", async () => {
    const { user } = await makeUser("nokey");
    delete process.env.MFA_ENCRYPTION_KEY;
    expect(mfa.startEnrollment({
      userId: user.id,
      password: "correct-password-123",
      currentPasswordHash: user.passwordHash,
      verifyPassword,
    })).rejects.toMatchObject({ code: "CONFIGURATION_REQUIRED" });
    process.env.MFA_ENCRYPTION_KEY = "test-mfa-key-32-bytes-derived-by-sha256";

    const enrolled = await enroll("nokey-enrolled");
    delete process.env.MFA_ENCRYPTION_KEY;
    expect(mfa.issueMfaChallenge(enrolled.user.id)).rejects.toMatchObject({ code: "CONFIGURATION_REQUIRED" });
    process.env.MFA_ENCRYPTION_KEY = "test-mfa-key-32-bytes-derived-by-sha256";
  });
});

describe("enrollment", () => {
  test("requires re-authentication with the current password", async () => {
    const { user } = await makeUser("repw");
    expect(mfa.startEnrollment({
      userId: user.id,
      password: "wrong-password-999",
      currentPasswordHash: user.passwordHash,
      verifyPassword,
    })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  test("stores only AES-GCM ciphertext, never the plaintext secret", async () => {
    const { user } = await makeUser("cipher");
    const started = await mfa.startEnrollment({
      userId: user.id,
      password: "correct-password-123",
      currentPasswordHash: user.passwordHash,
      verifyPassword,
    });
    const row = await db.mfaCredential.findUnique({ where: { userId: user.id } });
    expect(row).not.toBeNull();
    expect(row!.enabled).toBe(false);
    expect(row!.secretCiphertext).not.toContain(started.secret);
    expect(Buffer.from(row!.secretIv, "base64")).toHaveLength(12);
    expect(Buffer.from(row!.secretTag, "base64")).toHaveLength(16);
    expect(started.uri).toContain(`secret=${started.secret}`);
    expect(started.qrSvg).toContain("<svg");
  });

  test("refuses a wrong code and leaves enrollment pending", async () => {
    const { user, started } = await (async () => {
      const ctx = await makeUser("wrongcode");
      const s = await mfa.startEnrollment({
        userId: ctx.user.id,
        password: "correct-password-123",
        currentPasswordHash: ctx.user.passwordHash,
        verifyPassword,
      });
      return { user: ctx.user, started: s };
    })();
    const bad = totpAt(started.secret, NOW) === "000000" ? "111111" : "000000";
    expect(mfa.confirmEnrollment({ userId: user.id, code: bad, nowSeconds: NOW }))
      .rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    const row = await db.mfaCredential.findUnique({ where: { userId: user.id } });
    expect(row!.enabled).toBe(false);
  });

  test("confirming with a valid code enables MFA, returns one-time recovery codes and revokes other sessions", async () => {
    const { user, ws, started, confirmed } = await (async () => {
      const ctx = await makeUser("confirm");
      const s = await mfa.startEnrollment({
        userId: ctx.user.id,
        password: "correct-password-123",
        currentPasswordHash: ctx.user.passwordHash,
        verifyPassword,
      });
      await db.session.createMany({
        data: [
          { userId: ctx.user.id, tokenHash: sha256("keep-session"), expiresAt: new Date(Date.now() + 60_000) },
          { userId: ctx.user.id, tokenHash: sha256("drop-session"), expiresAt: new Date(Date.now() + 60_000) },
        ],
      });
      const keep = await db.session.findUnique({ where: { tokenHash: sha256("keep-session") } });
      const c = await mfa.confirmEnrollment({
        userId: ctx.user.id,
        code: totpAt(s.secret, NOW),
        keepSessionId: keep!.id,
        nowSeconds: NOW,
      });
      return { ...ctx, started: s, confirmed: c };
    })();

    expect(confirmed.enabled).toBe(true);
    expect(confirmed.recoveryCodes).toHaveLength(10);
    expect(confirmed.otherSessionsRevoked).toBe(1);
    const keep = await db.session.findUnique({ where: { tokenHash: sha256("keep-session") } });
    expect(keep!.revokedAt).toBeNull();
    const stored = await db.mfaRecoveryCode.findMany({ where: { credential: { userId: user.id } } });
    expect(stored).toHaveLength(10);
    for (const plain of confirmed.recoveryCodes) {
      expect(stored.some((s) => s.codeHash === plain)).toBe(false);
      expect(stored.some((s) => s.codeHash.length === 64)).toBe(true);
    }
    expect((await mfa.getMfaStatus(user.id)).recoveryCodesRemaining).toBe(10);
    expect((await mfa.getMfaStatus(user.id)).enabled).toBe(true);
    expect(ws.id).toBeTruthy();
  });

  test("a ciphertext transplanted to another user cannot be decrypted (AAD binding)", async () => {
    const a = await enroll("a-transplant");
    const b = await makeUser("b-transplant");
    const rowA = await db.mfaCredential.findUnique({ where: { userId: a.user.id } });
    await db.mfaCredential.create({
      data: {
        userId: b.user.id,
        secretCiphertext: rowA!.secretCiphertext,
        secretIv: rowA!.secretIv,
        secretTag: rowA!.secretTag,
        enabled: false,
      },
    });
    expect(mfa.confirmEnrollment({ userId: b.user.id, code: a.code, nowSeconds: NOW }))
      .rejects.toMatchObject({ code: "INTERNAL" });
  });
});

describe("login challenge and verification", () => {
  test("password login issues a challenge but creates no session", async () => {
    const enrolled = await enroll("challenge");
    const before = await db.session.count({ where: { userId: enrolled.user.id } });
    const result = await service.loginUser(
      { email: enrolled.user.email, password: "correct-password-123" },
      "127.0.0.1",
    );
    expect(result.mfaRequired).toBe(true);
    expect("challenge" in result && typeof result.challenge === "string").toBe(true);
    expect(await db.session.count({ where: { userId: enrolled.user.id } })).toBe(before);
  });

  test("a correct second factor exchanges the challenge for exactly one session", async () => {
    const enrolled = await enroll("verify");
    const challenge = await freshChallenge(enrolled.user.id);
    const result = await mfa.verifyMfaChallenge({
      challenge,
      code: totpAt(enrolled.started.secret, NOW + 30),
      nowSeconds: NOW + 30,
      ip: "127.0.0.1",
    });
    expect(result.userId).toBe(enrolled.user.id);
    expect(result.method).toBe("totp");
    expect(await db.session.count({ where: { userId: enrolled.user.id, revokedAt: null } })).toBe(1);
    // Single use: replaying the same challenge is rejected.
    expect(mfa.verifyMfaChallenge({ challenge, code: totpAt(enrolled.started.secret, NOW), ip: "x" }))
      .rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  test("replay of an already-consumed time step is rejected", async () => {
    const enrolled = await enroll("replay");
    const first = await freshChallenge(enrolled.user.id);
    await mfa.verifyMfaChallenge({ challenge: first, code: totpAt(enrolled.started.secret, NOW + 30), nowSeconds: NOW + 30, ip: "x" });
    const second = await freshChallenge(enrolled.user.id);
    expect(mfa.verifyMfaChallenge({
      challenge: second,
      code: totpAt(enrolled.started.secret, NOW + 30),
      nowSeconds: NOW + 30,
      ip: "x",
    })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  test("a recovery code works once and cannot be reused", async () => {
    const enrolled = await enroll("recovery");
    const code = enrolled.confirmed.recoveryCodes[0];
    const first = await freshChallenge(enrolled.user.id);
    const result = await mfa.verifyMfaChallenge({ challenge: first, recoveryCode: code, ip: "x" });
    expect(result.method).toBe("recovery");
    const second = await freshChallenge(enrolled.user.id);
    expect(mfa.verifyMfaChallenge({ challenge: second, recoveryCode: code, ip: "x" }))
      .rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect((await mfa.getMfaStatus(enrolled.user.id)).recoveryCodesRemaining).toBe(9);
  });

  test("a wrong code never creates a session", async () => {
    const enrolled = await enroll("badcode");
    const challenge = await freshChallenge(enrolled.user.id);
    const bad = totpAt(enrolled.started.secret, NOW) === "000000" ? "111111" : "000000";
    expect(mfa.verifyMfaChallenge({ challenge, code: bad, nowSeconds: NOW, ip: "x" }))
      .rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(await db.session.count({ where: { userId: enrolled.user.id } })).toBe(0);
  });
});

describe("recovery and disable", () => {
  test("regenerating invalidates old codes", async () => {
    const enrolled = await enroll("regen");
    const old = enrolled.confirmed.recoveryCodes[0];
    const fresh = await mfa.regenerateRecoveryCodes({
      userId: enrolled.user.id,
      code: totpAt(enrolled.started.secret, NOW + 30),
      nowSeconds: NOW + 30,
    });
    expect(fresh.recoveryCodes).toHaveLength(10);
    expect(fresh.recoveryCodes).not.toContain(old);
    const challenge = await freshChallenge(enrolled.user.id);
    expect(mfa.verifyMfaChallenge({ challenge, recoveryCode: old, ip: "x" }))
      .rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  test("disabling requires a factor and stops challenge issuance", async () => {
    const enrolled = await enroll("disable");
    expect(mfa.disableMfa({ userId: enrolled.user.id, code: "000000", nowSeconds: NOW }))
      .rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    const result = await mfa.disableMfa({
      userId: enrolled.user.id,
      code: totpAt(enrolled.started.secret, NOW + 30),
      nowSeconds: NOW + 30,
    });
    expect(result.disabled).toBe(true);
    expect((await mfa.getMfaStatus(enrolled.user.id)).enabled).toBe(false);
    expect(await mfa.issueMfaChallenge(enrolled.user.id)).toBeNull();
    expect(await db.mfaRecoveryCode.count({ where: { credential: { userId: enrolled.user.id } } })).toBe(0);
  });
});
