import { describe, expect, test } from "bun:test";
import {
  base32Decode,
  base32Encode,
  buildOtpauthUri,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  hotp,
  normalizeRecoveryCode,
  totpAt,
  verifyTotp,
} from "@/lib/auth/totp";

/** RFC 4648 §10 base32 vectors, trimmed of padding. */
const B32_VECTORS: Array<[string, string]> = [
  ["f", "MY"],
  ["fo", "MZXQ"],
  ["foo", "MZXW6"],
  ["foob", "MZXW6YQ"],
  ["fooba", "MZXW6YTB"],
  ["foobar", "MZXW6YTBOI"],
];

describe("base32 (RFC 4648)", () => {
  test("encodes the published vectors without padding", () => {
    for (const [plain, encoded] of B32_VECTORS) {
      expect(base32Encode(Buffer.from(plain, "ascii"))).toBe(encoded);
    }
  });

  test("round-trips arbitrary bytes", () => {
    for (const bytes of [16, 20, 32, 64]) {
      const raw = Buffer.from(Array.from({ length: bytes }, (_, i) => (i * 37 + 11) % 256));
      expect(base32Decode(base32Encode(raw))).toEqual(raw);
    }
  });

  test("accepts human-friendly spacing but rejects invalid alphabets", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    expect(base32Decode(` ${secret.slice(0, 4)}-${secret.slice(4)} `)).toEqual(base32Decode(secret));
    for (const bad of ["", "ABC189", "abc=", "!!!!"]) {
      expect(() => base32Decode(bad)).toThrow();
    }
  });
});

describe("TOTP (RFC 6238 Appendix B)", () => {
  const sha1Secret = base32Encode(Buffer.from("12345678901234567890", "ascii"));
  const sha256Secret = base32Encode(Buffer.from("12345678901234567890123456789012", "ascii"));
  const sha512Secret = base32Encode(
    Buffer.from("1234567890123456789012345678901234567890123456789012345678901234", "ascii"),
  );

  const vectors: Array<{ algorithm: "SHA1" | "SHA256" | "SHA512"; secret: string; codes: string[] }> = [
    {
      algorithm: "SHA1",
      secret: sha1Secret,
      // 8-digit RFC values, truncated to 6 for the default deployment.
      codes: ["287082", "081804", "050471", "005924", "279037", "353130"],
    },
    {
      algorithm: "SHA256",
      secret: sha256Secret,
      codes: ["119246", "084774", "062674", "819424", "698825", "737706"],
    },
    {
      algorithm: "SHA512",
      secret: sha512Secret,
      codes: ["693936", "091201", "943326", "441116", "618901", "863826"],
    },
  ];
  const times = [59, 1111111109, 1111111111, 1234567890, 2000000000, 20000000000];

  for (const vector of vectors) {
    test(`${vector.algorithm} matches all six published time vectors`, () => {
      times.forEach((t, i) => {
        expect(totpAt(vector.secret, t, { algorithm: vector.algorithm })).toBe(vector.codes[i]);
      });
    });
  }

  test("HOTP uses an 8-byte big-endian counter", () => {
    // RFC 4226 Appendix D, counter 0 -> 755224 (SHA1, secret "12345678901234567890").
    expect(hotp(base32Decode(sha1Secret), 0)).toBe("755224");
  });
});

describe("verification policy", () => {
  const secret = generateTotpSecret();
  const now = 1_700_000_000;
  const code = totpAt(secret, now);

  test("accepts the current step and one step of skew either way", () => {
    for (const delta of [-30, 0, 30]) {
      expect(verifyTotp({ secretBase32: secret, code: totpAt(secret, now + delta), nowSeconds: now }).valid).toBe(true);
    }
  });

  test("rejects codes outside the skew window", () => {
    expect(verifyTotp({ secretBase32: secret, code: totpAt(secret, now - 60), nowSeconds: now }).valid).toBe(false);
    expect(verifyTotp({ secretBase32: secret, code: totpAt(secret, now + 60), nowSeconds: now }).valid).toBe(false);
  });

  test("rejects malformed codes before doing any HMAC work", () => {
    for (const bad of ["", "12345", "1234567", "abcdef", " 12345"]) {
      expect(verifyTotp({ secretBase32: secret, code: bad, nowSeconds: now }).valid).toBe(false);
    }
  });

  test("replay protection blocks reuse of the same or older counter", () => {
    const first = verifyTotp({ secretBase32: secret, code, nowSeconds: now });
    expect(first.valid).toBe(true);
    expect(verifyTotp({ secretBase32: secret, code, nowSeconds: now, lastUsedCounter: first.counter }).valid).toBe(false);
    expect(
      verifyTotp({ secretBase32: secret, code: totpAt(secret, now - 30), nowSeconds: now, lastUsedCounter: first.counter })
        .valid,
    ).toBe(false);
  });

  test("a newer counter is accepted after an accepted one", () => {
    const accepted = verifyTotp({ secretBase32: secret, code, nowSeconds: now, lastUsedCounter: 1 });
    expect(accepted.valid).toBe(true);
    expect(accepted.counter).toBeGreaterThan(1);
  });
});

describe("secret and recovery material", () => {
  test("generated secrets are 20 random bytes and never equal", () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a).toHaveLength(32);
    expect(base32Decode(a)).toHaveLength(20);
    expect(a).not.toBe(b);
  });

  test("recovery codes normalise consistently and hash to unique fixed-size digests", () => {
    const codes = generateRecoveryCodes(10);
    expect(new Set(codes).size).toBe(10);
    expect(codes[0]).toMatch(/^[0-9A-F]{4}(-[0-9A-F]{4}){4}$/);
    expect(normalizeRecoveryCode(` ${codes[0].toLowerCase()} `)).toBe(codes[0].replace(/-/g, ""));
    expect(hashRecoveryCode(codes[0])).toBe(hashRecoveryCode(codes[0].toLowerCase().replace(/-/g, " ")));
    expect(new Set(codes.map(hashRecoveryCode)).size).toBe(10);
    expect(hashRecoveryCode(codes[0])).toHaveLength(64);
  });

  test("otpauth URI is correctly encoded for authenticator apps", () => {
    const uri = buildOtpauthUri({ secretBase32: "JBSWY3DPEHPK3PXP", accountLabel: "ada@example.com" });
    expect(uri).toContain("otpauth://totp/FoundrySignal%3Aada%40example.com");
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(uri).toContain("period=30");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("algorithm=SHA1");
  });
});
