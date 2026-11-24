/**
 * TOTP MFA service — domain rules, persistence and policy.
 *
 * Security invariants enforced here:
 *  - The shared secret is encrypted with AES-256-GCM before it reaches the DB.
 *    The AAD binds the ciphertext to its user, so a row cannot be transplanted.
 *  - A credential with `enabled=false` is an unconfirmed enrollment and can
 *    never satisfy a login challenge.
 *  - Login does not create a session for MFA users. It issues a single-use,
 *    5-minute challenge that must be exchanged for a session with a second
 *    factor. There is no code path that skips the factor once enrolled.
 *  - A time-step counter is replay-protected and advances only on success.
 *  - Recovery codes are stored as hashes, consumed atomically, single-use.
 *  - Every code entry is throttled; a brute-force attempt cannot run forever.
 *
 * Missing MFA_ENCRYPTION_KEY is a fail-closed configuration state: enrollment
 * is unavailable and an already-enrolled account cannot be verified (never a
 * silent bypass).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { ApiHttpError } from "@/lib/contracts/http";
import { recordAudit } from "@/lib/domain/shared/audit";
import { createSession, sha256 } from "./session";
import {
  DEFAULT_TOTP_PARAMS,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  buildOtpauthUri,
  verifyTotp,
  type TotpAlgorithm,
  type TotpParams,
} from "./totp";

const CHALLENGE_ACTION = "MFA_CHALLENGE";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const CODE_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPT_KEYS = 5000;

export function mfaConfigured(): boolean {
  return !!process.env.MFA_ENCRYPTION_KEY;
}

function encryptionKey(): Buffer {
  const raw = process.env.MFA_ENCRYPTION_KEY;
  if (!raw) {
    throw new ApiHttpError("CONFIGURATION_REQUIRED", "Two-factor authentication is not configured.", false, {
      requiredEnv: ["MFA_ENCRYPTION_KEY"],
    });
  }
  // A 64-char hex value is treated as a raw 32-byte key; anything else is
  // derived with SHA-256 so operators can use a passphrase from their KMS.
  return /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : createHash("sha256").update(raw, "utf8").digest();
}

function encryptSecret(secret: string, userId: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(userId, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    secretCiphertext: ciphertext.toString("base64"),
    secretIv: iv.toString("base64"),
    secretTag: cipher.getAuthTag().toString("base64"),
  };
}

function decryptSecret(row: {
  secretCiphertext: string;
  secretIv: string;
  secretTag: string;
}, userId: string): string {
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(row.secretIv, "base64"));
    decipher.setAAD(Buffer.from(userId, "utf8"));
    decipher.setAuthTag(Buffer.from(row.secretTag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(row.secretCiphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new ApiHttpError(
      "INTERNAL",
      "The stored second-factor secret could not be decrypted. Contact an administrator; access is denied until resolved.",
      false,
    );
  }
}

function credentialParams(credential: {
  algorithm: string;
  digits: number;
  stepSeconds: number;
}): TotpParams {
  const algorithm = credential.algorithm as TotpAlgorithm;
  if (!["SHA1", "SHA256", "SHA512"].includes(algorithm)) {
    throw new ApiHttpError("INTERNAL", "Unsupported TOTP algorithm on this credential.", false);
  }
  return { algorithm, digits: credential.digits, stepSeconds: credential.stepSeconds };
}

// Bounded, in-process attempt counters keyed by purpose. A distributed store
// is a documented follow-up; the DB-backed write rate limiter in `handler`
// provides a second, cross-process layer on every one of these endpoints.
const codeAttempts = new Map<string, { count: number; until: number }>();

function bumpCodeAttempt(key: string): void {
  const now = Date.now();
  for (const [k, v] of codeAttempts) if (now >= v.until) codeAttempts.delete(k);
  if (codeAttempts.size >= MAX_ATTEMPT_KEYS) codeAttempts.clear();
  const entry = codeAttempts.get(key);
  if (entry && now < entry.until) {
    entry.count += 1;
  } else {
    codeAttempts.set(key, { count: 1, until: now + CODE_ATTEMPT_WINDOW_MS });
  }
  if (entry && entry.count >= MAX_CODE_ATTEMPTS) {
    throw new ApiHttpError("RATE_LIMITED", "Too many incorrect authentication codes. Try again later.", true);
  }
}

function clearCodeAttempts(key: string): void {
  codeAttempts.delete(key);
}

/** Never expose the secret, ciphertext, or recovery hashes from this function. */
export async function getMfaStatus(userId: string) {
  const credential = await db.mfaCredential.findUnique({
    where: { userId },
    include: { recoveryCodes: { where: { usedAt: null }, select: { id: true } } },
  });
  return {
    configured: mfaConfigured(),
    enabled: !!credential?.enabled,
    enrollmentPending: !!credential && !credential.enabled,
    enrolledAt: credential?.enrolledAt?.toISOString() ?? null,
    recoveryCodesRemaining: credential?.enabled ? credential.recoveryCodes.length : 0,
    algorithm: credential?.enabled ? credential.algorithm : null,
    digits: credential?.enabled ? credential.digits : null,
    stepSeconds: credential?.enabled ? credential.stepSeconds : null,
  };
}

/**
 * Issues a short-lived, single-use challenge after a correct password.
 * Returns null when the account has no enabled second factor.
 */
export async function issueMfaChallenge(userId: string): Promise<string | null> {
  const credential = await db.mfaCredential.findUnique({ where: { userId } });
  if (!credential?.enabled) return null;
  if (!mfaConfigured()) {
    throw new ApiHttpError(
      "CONFIGURATION_REQUIRED",
      "This account requires two-factor authentication but the server's MFA key is unavailable. Access is denied until it is restored.",
      false,
      { requiredEnv: ["MFA_ENCRYPTION_KEY"] },
    );
  }
  await db.verificationToken.deleteMany({
    where: { identifier: userId, action: CHALLENGE_ACTION, usedAt: null },
  });
  const challenge = randomBytes(32).toString("base64url");
  await db.verificationToken.create({
    data: {
      identifier: userId,
      tokenHash: sha256(challenge),
      action: CHALLENGE_ACTION,
      expires: new Date(Date.now() + CHALLENGE_TTL_MS),
    },
  });
  await recordAudit({
    actorId: userId,
    action: "AUTH_MFA_CHALLENGE",
    targetType: "USER",
    targetId: userId,
    summary: "Password accepted; second-factor challenge issued",
  });
  return challenge;
}

export interface MfaVerificationResult {
  userId: string;
  workspaceId: string | null;
  method: "totp" | "recovery";
}

/** Exchanges a single-use challenge + second factor for a real session. */
export async function verifyMfaChallenge(input: {
  challenge: string;
  code?: string;
  recoveryCode?: string;
  ip: string;
  nowSeconds?: number;
}): Promise<MfaVerificationResult> {
  const hasCode = typeof input.code === "string" && input.code.length > 0;
  const hasRecovery = typeof input.recoveryCode === "string" && input.recoveryCode.length > 0;
  if (hasCode === hasRecovery) {
    throw new ApiHttpError("VALIDATION_FAILED", "Provide exactly one authentication code or recovery code.", false);
  }
  const tokenHash = sha256(input.challenge);
  bumpCodeAttempt(`challenge:${tokenHash}`);

  const token = await db.verificationToken.findUnique({ where: { tokenHash } });
  if (!token || token.action !== CHALLENGE_ACTION) {
    throw new ApiHttpError("VALIDATION_FAILED", "That second-factor challenge is invalid.", false);
  }
  if (token.usedAt || token.expires < new Date()) {
    throw new ApiHttpError("VALIDATION_FAILED", "That second-factor challenge has expired or was already used. Sign in again.", false);
  }
  // Consume before doing factor work: a challenge authenticates exactly one
  // attempt, so an online guesser cannot retry against the same token.
  const consumed = await db.verificationToken.updateMany({
    where: { id: token.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (consumed.count !== 1) {
    throw new ApiHttpError("VALIDATION_FAILED", "That second-factor challenge was already used. Sign in again.", false);
  }

  const credential = await db.mfaCredential.findUnique({
    where: { userId: token.identifier },
  });
  if (!credential?.enabled) {
    throw new ApiHttpError("VALIDATION_FAILED", "Two-factor authentication is no longer enabled for this account.", false);
  }

  const method = await settleSecondFactor({
    credential,
    userId: token.identifier,
    code: hasCode ? input.code : undefined,
    recoveryCode: hasRecovery ? input.recoveryCode : undefined,
    nowSeconds: input.nowSeconds,
  });
  if (!method) {
    throw new ApiHttpError("UNAUTHENTICATED", "That code is invalid or has already been used.", false);
  }

  const membership = await db.membership.findFirst({
    where: { userId: token.identifier },
    orderBy: { createdAt: "asc" },
  });
  const session = await createSession(token.identifier, membership?.workspaceId);
  await recordAudit({
    actorId: token.identifier,
    action: "AUTH_MFA_VERIFY",
    targetType: "USER",
    targetId: token.identifier,
    summary: `Second factor accepted (${method})`,
    metadata: { ip: input.ip, method },
  });
  clearCodeAttempts(`challenge:${tokenHash}`);
  return { userId: token.identifier, workspaceId: membership?.workspaceId ?? null, method };
}

type CredentialRow = {
  id: string;
  secretCiphertext: string;
  secretIv: string;
  secretTag: string;
  algorithm: string;
  digits: number;
  stepSeconds: number;
  lastUsedCounter: number | null;
};

/**
 * Validates and atomically records factor use. Returns the method on success,
 * null on rejection. The counter advances in the same conditional write that
 * proves the code was not already used.
 */
async function settleSecondFactor(input: {
  credential: CredentialRow;
  userId: string;
  code?: string;
  recoveryCode?: string;
  nowSeconds?: number;
}): Promise<"totp" | "recovery" | null> {
  if (input.recoveryCode) {
    return db.$transaction(async (tx) => {
      const hash = hashRecoveryCode(input.recoveryCode!);
      const consumed = await tx.mfaRecoveryCode.updateMany({
        where: { credentialId: input.credential.id, codeHash: hash, usedAt: null },
        data: { usedAt: new Date() },
      });
      return consumed.count === 1 ? "recovery" : null;
    });
  }

  const secret = decryptSecret(input.credential, input.userId);
  const result = verifyTotp({
    secretBase32: secret,
    code: input.code ?? "",
    nowSeconds: input.nowSeconds,
    params: credentialParams(input.credential),
    lastUsedCounter: input.credential.lastUsedCounter,
  });
  if (!result.valid || result.counter == null) return null;
  const claimed = await db.mfaCredential.updateMany({
    where: {
      id: input.credential.id,
      enabled: true,
      OR: [{ lastUsedCounter: null }, { lastUsedCounter: { lt: result.counter } }],
    },
    data: { lastUsedCounter: result.counter },
  });
  return claimed.count === 1 ? "totp" : null;
}

export async function startEnrollment(input: {
  userId: string;
  password: string;
  currentPasswordHash: string;
  verifyPassword: (password: string, hash: string) => Promise<boolean>;
}): Promise<{
  secret: string;
  uri: string;
  qrSvg: string;
  digits: number;
  stepSeconds: number;
  algorithm: string;
}> {
  if (!mfaConfigured()) {
    throw new ApiHttpError("CONFIGURATION_REQUIRED", "Two-factor authentication is not configured.", false, {
      requiredEnv: ["MFA_ENCRYPTION_KEY"],
    });
  }
  const existing = await db.mfaCredential.findUnique({ where: { userId: input.userId } });
  if (existing?.enabled) {
    throw new ApiHttpError("CONFLICT", "Two-factor authentication is already enabled.", false);
  }
  // Re-authentication prevents an attacker holding only a stolen session from
  // enrolling their own second factor and locking out the real account owner.
  if (!(await input.verifyPassword(input.password, input.currentPasswordHash))) {
    throw new ApiHttpError("UNAUTHENTICATED", "Your current password is incorrect.", false);
  }

  const secret = generateTotpSecret();
  const encrypted = encryptSecret(secret, input.userId);
  await db.$transaction(async (tx) => {
    await tx.mfaCredential.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        ...encrypted,
        algorithm: DEFAULT_TOTP_PARAMS.algorithm,
        digits: DEFAULT_TOTP_PARAMS.digits,
        stepSeconds: DEFAULT_TOTP_PARAMS.stepSeconds,
        enabled: false,
      },
      update: {
        ...encrypted,
        algorithm: DEFAULT_TOTP_PARAMS.algorithm,
        digits: DEFAULT_TOTP_PARAMS.digits,
        stepSeconds: DEFAULT_TOTP_PARAMS.stepSeconds,
        enabled: false,
        lastUsedCounter: null,
        enrolledAt: null,
        disabledAt: new Date(),
      },
    });
    await tx.mfaRecoveryCode.deleteMany({ where: { credential: { userId: input.userId } } });
  });

  const user = await db.user.findUnique({ where: { id: input.userId } });
  const uri = buildOtpauthUri({
    secretBase32: secret,
    accountLabel: user?.email ?? input.userId,
    issuer: "FoundrySignal",
  });
  const qrSvg = await QRCode.toString(uri, {
    type: "svg",
    margin: 1,
    width: 220,
    errorCorrectionLevel: "M",
    color: { dark: "#080B12", light: "#EAF0F5" },
  });
  await recordAudit({
    actorId: input.userId,
    action: "MFA_ENROLL_START",
    targetType: "USER",
    targetId: input.userId,
    summary: "TOTP enrollment started (not yet active)",
  });
  return { secret, uri, qrSvg, digits: 6, stepSeconds: 30, algorithm: "SHA1" };
}

export async function confirmEnrollment(input: {
  userId: string;
  code: string;
  keepSessionId?: string;
  nowSeconds?: number;
}): Promise<{ enabled: true; recoveryCodes: string[]; otherSessionsRevoked: number }> {
  const credential = await db.mfaCredential.findUnique({ where: { userId: input.userId } });
  if (!credential || credential.enabled) {
    throw new ApiHttpError("VALIDATION_FAILED", "There is no pending enrollment to confirm.", false);
  }
  const attemptKey = `${input.userId}|confirm`;
  bumpCodeAttempt(attemptKey);
  const secret = decryptSecret(credential, input.userId);
  const result = verifyTotp({
    secretBase32: secret,
    code: input.code,
    nowSeconds: input.nowSeconds,
    params: credentialParams(credential),
    lastUsedCounter: credential.lastUsedCounter,
  });
  if (!result.valid || result.counter == null) {
    throw new ApiHttpError("VALIDATION_FAILED", "That code is not valid or has already been used.", false);
  }

  const recoveryCodes = generateRecoveryCodes();
  await db.$transaction(async (tx) => {
    const enabled = await tx.mfaCredential.updateMany({
      where: {
        id: credential.id,
        enabled: false,
        OR: [{ lastUsedCounter: null }, { lastUsedCounter: { lt: result.counter } }],
      },
      data: { enabled: true, enrolledAt: new Date(), disabledAt: null, lastUsedCounter: result.counter },
    });
    if (enabled.count !== 1) {
      throw new ApiHttpError("CONFLICT", "Enrollment changed during confirmation. Start again.", true);
    }
    await tx.mfaRecoveryCode.createMany({
      data: recoveryCodes.map((code) => ({ credentialId: credential.id, codeHash: hashRecoveryCode(code) })),
    });
  });

  const otherSessionsRevoked = await db.session.updateMany({
    where: {
      userId: input.userId,
      revokedAt: null,
      ...(input.keepSessionId ? { id: { not: input.keepSessionId } } : {}),
    },
    data: { revokedAt: new Date() },
  });
  await recordAudit({
    actorId: input.userId,
    action: "MFA_ENROLL_CONFIRM",
    targetType: "USER",
    targetId: input.userId,
    summary: "TOTP second factor enabled",
  });
  clearCodeAttempts(attemptKey);
  return { enabled: true, recoveryCodes, otherSessionsRevoked: otherSessionsRevoked.count };
}

export async function regenerateRecoveryCodes(input: {
  userId: string;
  code: string;
  nowSeconds?: number;
}): Promise<{ recoveryCodes: string[] }> {
  const credential = await db.mfaCredential.findUnique({ where: { userId: input.userId, enabled: true } });
  if (!credential) throw new ApiHttpError("VALIDATION_FAILED", "Two-factor authentication is not enabled.", false);
  const attemptKey = `${input.userId}|recovery`;
  bumpCodeAttempt(attemptKey);
  const method = await settleSecondFactor({ credential, userId: input.userId, code: input.code, nowSeconds: input.nowSeconds });
  if (method !== "totp") throw new ApiHttpError("UNAUTHENTICATED", "That code is invalid or has already been used.", false);
  const recoveryCodes = generateRecoveryCodes();
  await db.$transaction(async (tx) => {
    await tx.mfaRecoveryCode.deleteMany({ where: { credentialId: credential.id } });
    await tx.mfaRecoveryCode.createMany({
      data: recoveryCodes.map((code) => ({ credentialId: credential.id, codeHash: hashRecoveryCode(code) })),
    });
  });
  await recordAudit({
    actorId: input.userId,
    action: "MFA_RECOVERY_REGENERATE",
    targetType: "USER",
    targetId: input.userId,
    summary: "TOTP recovery codes regenerated; previous codes invalidated",
  });
  clearCodeAttempts(attemptKey);
  return { recoveryCodes };
}

export async function disableMfa(input: {
  userId: string;
  code?: string;
  recoveryCode?: string;
  nowSeconds?: number;
}): Promise<{ disabled: true }> {
  const credential = await db.mfaCredential.findUnique({ where: { userId: input.userId, enabled: true } });
  if (!credential) throw new ApiHttpError("VALIDATION_FAILED", "Two-factor authentication is not enabled.", false);
  const attemptKey = `${input.userId}|disable`;
  bumpCodeAttempt(attemptKey);
  const method = await settleSecondFactor({
    credential,
    userId: input.userId,
    code: input.code,
    recoveryCode: input.recoveryCode,
    nowSeconds: input.nowSeconds,
  });
  if (!method) throw new ApiHttpError("UNAUTHENTICATED", "That code is invalid or has already been used.", false);
  await db.$transaction(async (tx) => {
    await tx.mfaCredential.update({
      where: { id: credential.id },
      data: { enabled: false, lastUsedCounter: null, enrolledAt: null, disabledAt: new Date() },
    });
    await tx.mfaRecoveryCode.deleteMany({ where: { credentialId: credential.id } });
  });
  await db.verificationToken.deleteMany({
    where: { identifier: input.userId, action: CHALLENGE_ACTION, usedAt: null },
  });
  await recordAudit({
    actorId: input.userId,
    action: "MFA_DISABLE",
    targetType: "USER",
    targetId: input.userId,
    summary: `TOTP second factor disabled (authorised by ${method})`,
  });
  clearCodeAttempts(attemptKey);
  return { disabled: true };
}
