/**
 * RFC 6238 TOTP / RFC 4226 HOTP primitives.
 *
 * Deliberately dependency-free: Node's `crypto` only. Every operation here is
 * pure and deterministic given (secret, time), which makes it verifiable
 * against the published RFC 6238 Appendix B test vectors in tests/totp.test.ts.
 *
 * This module never touches the database, cookies, or environment. Policy
 * (encryption at rest, replay protection, throttling, storage) lives in mfa.ts.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32, uppercase, no padding. */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
      value &= (1 << bits) - 1;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/**
 * Strict RFC 4648 base32 decode. Whitespace and hyphens are accepted for
 * human transcription; padding, non-alphabet characters and empty input are
 * rejected rather than silently producing a different secret.
 */
export function base32Decode(input: string): Buffer {
  const cleaned = input.trim().toUpperCase().replace(/[\s-]/g, "");
  if (!cleaned || /[^A-Z2-7]/.test(cleaned)) {
    throw new Error("INVALID_BASE32_SECRET");
  }
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of cleaned) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
      value &= (1 << bits) - 1;
    }
  }
  return Buffer.from(out);
}

export type TotpAlgorithm = "SHA1" | "SHA256" | "SHA512";

export interface TotpParams {
  algorithm?: TotpAlgorithm;
  digits?: number;
  stepSeconds?: number;
  /** T0, in Unix seconds. RFC 6238 uses 0. */
  t0Seconds?: number;
}

export const DEFAULT_TOTP_PARAMS: Required<TotpParams> = {
  algorithm: "SHA1",
  digits: 6,
  stepSeconds: 30,
  t0Seconds: 0,
};

function resolveParams(params: TotpParams = {}): Required<TotpParams> {
  const merged = { ...DEFAULT_TOTP_PARAMS, ...params };
  if (![6, 7, 8].includes(merged.digits)) throw new Error("INVALID_TOTP_DIGITS");
  if (merged.stepSeconds <= 0 || !Number.isInteger(merged.stepSeconds)) throw new Error("INVALID_TOTP_STEP");
  return merged;
}

/** HOTP (RFC 4226): dynamic truncation of HMAC over an 8-byte counter. */
export function hotp(secret: Buffer, counter: number, params: TotpParams = {}): string {
  const p = resolveParams(params);
  if (!Number.isSafeInteger(counter) || counter < 0) throw new Error("INVALID_HOTP_COUNTER");
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac(p.algorithm.toLowerCase(), secret).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return (binary % 10 ** p.digits).toString().padStart(p.digits, "0");
}

export function counterAt(unixSeconds: number, params: TotpParams = {}): number {
  const p = resolveParams(params);
  return Math.floor((unixSeconds - p.t0Seconds) / p.stepSeconds);
}

/** TOTP code at a specific Unix time (seconds). */
export function totpAt(secretBase32: string, unixSeconds: number, params: TotpParams = {}): string {
  return hotp(base32Decode(secretBase32), counterAt(unixSeconds, params), params);
}

export interface TotpVerification {
  valid: boolean;
  /** The matched time-step counter; use it for replay protection. */
  counter?: number;
}

/**
 * Verifies a code with a symmetric ±windowSteps tolerance for clock skew.
 *
 * Replay protection is the caller's responsibility via `lastUsedCounter`:
 * only a counter strictly greater than the last accepted one can match. Never
 * advance that counter until the entitlement write has succeeded (see mfa.ts).
 */
export function verifyTotp(input: {
  secretBase32: string;
  code: string;
  nowSeconds?: number;
  windowSteps?: number;
  lastUsedCounter?: number | null;
  params?: TotpParams;
}): TotpVerification {
  const p = resolveParams(input.params);
  // Validate the shape before any crypto so malformed input cannot become an
  // accidental prefix match or throw deep inside the comparison.
  if (!new RegExp(`^\\d{${p.digits}}$`).test(input.code)) return { valid: false };
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const current = counterAt(now, p);
  const secret = base32Decode(input.secretBase32);
  const window = Math.max(0, Math.min(input.windowSteps ?? 1, 5));
  const expectedBuffer = Buffer.from(input.code);

  for (let delta = -window; delta <= window; delta += 1) {
    const counter = current + delta;
    if (counter < 0) continue;
    if (input.lastUsedCounter != null && counter <= input.lastUsedCounter) continue;
    const expected = Buffer.from(hotp(secret, counter, p));
    if (expected.length === expectedBuffer.length && timingSafeEqual(expected, expectedBuffer)) {
      return { valid: true, counter };
    }
  }
  return { valid: false };
}

/** 20 random bytes -> 32 base32 characters, the recommended RFC 6238 secret size. */
export function generateTotpSecret(bytes = 20): string {
  if (bytes < 16) throw new Error("TOTP_SECRET_TOO_SHORT");
  return base32Encode(randomBytes(bytes));
}

/** Recovery codes: 20 hex chars grouped into five blocks. Hex avoids O/0 and I/1 ambiguity. */
export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(10).toString("hex").toUpperCase();
    return [0, 4, 8, 12, 16].map((i) => raw.slice(i, i + 4)).join("-");
  });
}

export function normalizeRecoveryCode(code: string): string {
  return code.trim().toUpperCase().replace(/[\s-]/g, "");
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
}

/** otpauth:// URI consumed by Google Authenticator, 1Password, Aegis, etc. */
export function buildOtpauthUri(input: {
  secretBase32: string;
  accountLabel: string;
  issuer?: string;
  params?: TotpParams;
}): string {
  const p = resolveParams(input.params);
  const issuer = input.issuer ?? "FoundrySignal";
  const label = `${issuer}:${input.accountLabel}`;
  const query = new URLSearchParams({
    secret: input.secretBase32,
    issuer,
    algorithm: p.algorithm,
    digits: String(p.digits),
    period: String(p.stepSeconds),
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${query.toString()}`;
}
