// Client-IP derivation tests — X-Forwarded-For must never be trusted
// verbatim: rightmost-untrusted-hop walk, trusted set via TRUSTED_PROXIES,
// "local" fallback when the peer cannot be determined.
import { describe, test, expect, afterEach } from "bun:test";
import type { NextRequest } from "next/server";
import { clientIp, parseTrustedProxies, isTrustedProxy, normalizeIpCandidate } from "@/lib/auth/client-ip";

function reqWith(headers: Record<string, string>): NextRequest {
  return { headers: new Headers(headers) } as unknown as NextRequest;
}

const savedEnv = { ...process.env };
afterEach(() => {
  process.env = { ...savedEnv };
});

describe("parseTrustedProxies", () => {
  test("defaults to 127.0.0.1 when TRUSTED_PROXIES is unset", () => {
    delete process.env.TRUSTED_PROXIES;
    expect(parseTrustedProxies()).toEqual(["127.0.0.1"]);
  });
  test("parses comma-separated IPs and CIDRs", () => {
    expect(parseTrustedProxies("10.0.0.0/8, 192.168.1.1 ,::1")).toEqual(["10.0.0.0/8", "192.168.1.1", "::1"]);
  });
});

describe("isTrustedProxy", () => {
  test("exact IPv4 and IPv4 CIDR match", () => {
    expect(isTrustedProxy("127.0.0.1", ["127.0.0.1"])).toBe(true);
    expect(isTrustedProxy("10.1.2.3", ["10.0.0.0/8"])).toBe(true);
    expect(isTrustedProxy("11.1.2.3", ["10.0.0.0/8"])).toBe(false);
    expect(isTrustedProxy("192.168.0.1", ["192.168.0.0/16"])).toBe(true);
  });
  test("IPv6 exact and CIDR match", () => {
    expect(isTrustedProxy("::1", ["::1"])).toBe(true);
    expect(isTrustedProxy("fd00::1", ["fd00::/8"])).toBe(true);
  });
});

describe("normalizeIpCandidate", () => {
  test("strips ports and brackets", () => {
    expect(normalizeIpCandidate("1.2.3.4:443")).toBe("1.2.3.4");
    expect(normalizeIpCandidate("[::1]:443")).toBe("::1");
  });
  test("rejects unparseable input", () => {
    expect(normalizeIpCandidate("not-an-ip")).toBeNull();
    expect(normalizeIpCandidate("")).toBeNull();
  });
});

describe("clientIp", () => {
  test("no peer and no TRUSTED_PROXIES → 'local' (header rotation cannot defeat throttles)", () => {
    delete process.env.TRUSTED_PROXIES;
    expect(clientIp(reqWith({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("local");
  });
  test("known untrusted peer ignores X-Forwarded-For entirely", () => {
    process.env.TRUSTED_PROXIES = "203.0.113.1";
    expect(clientIp(reqWith({ "x-forwarded-for": "1.2.3.4" }), "198.51.100.9")).toBe("198.51.100.9");
  });
  test("trusted peer → rightmost untrusted hop wins", () => {
    process.env.TRUSTED_PROXIES = "127.0.0.1";
    const req = reqWith({ "x-forwarded-for": "9.9.9.9, 203.0.113.7, 127.0.0.1" });
    expect(clientIp(req, "127.0.0.1")).toBe("203.0.113.7");
  });
  test("leftmost attacker-injected hops are never selected over proxy-appended ones", () => {
    process.env.TRUSTED_PROXIES = "127.0.0.1";
    const req = reqWith({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 3.3.3.3, 127.0.0.1" });
    // rightmost untrusted is 3.3.3.3 — what the trusted proxy appended
    expect(clientIp(req, "127.0.0.1")).toBe("3.3.3.3");
  });
  test("all-trusted XFF with trusted peer → peer", () => {
    process.env.TRUSTED_PROXIES = "127.0.0.1";
    const req = reqWith({ "x-forwarded-for": "127.0.0.1, 127.0.0.1" });
    expect(clientIp(req, "127.0.0.1")).toBe("127.0.0.1");
  });
  test("configured TRUSTED_PROXIES lets an XFF-rewriting ingress supply client IPs", () => {
    process.env.TRUSTED_PROXIES = "10.0.0.0/8";
    const req = reqWith({ "x-forwarded-for": "198.51.100.23, 10.1.2.3" });
    expect(clientIp(req)).toBe("198.51.100.23");
  });
  test("garbage XFF falls back to local without trusting attacker strings", () => {
    process.env.TRUSTED_PROXIES = "127.0.0.1";
    const req = reqWith({ "x-forwarded-for": "garbage, also-garbage" });
    expect(clientIp(req)).toBe("local");
  });
});
describe("clientIp edge cases (hardening)", () => {
  test("IPv4-mapped IPv6 hop matches IPv4 CIDR trusted set", () => {
    expect(isTrustedProxy("::ffff:10.1.2.3", ["10.0.0.0/8"])).toBe(true);
    expect(isTrustedProxy("::ffff:11.0.0.1", ["10.0.0.0/8"])).toBe(false);
  });
  test("IPv4-mapped hop matches exact IPv4 trusted entry", () => {
    expect(isTrustedProxy("::ffff:1.2.3.4", ["1.2.3.4"])).toBe(true);
  });
  test("malformed CIDR entries fail to safe default (no broadening)", () => {
    expect(isTrustedProxy("1.2.3.4", ["10.0.0.0/"])).toBe(false);   // empty prefix must not mean /0
    expect(isTrustedProxy("1.2.3.4", ["1.2.3.4/"])).toBe(false);    // empty prefix must not mean /32
    expect(isTrustedProxy("1.2.3.4", ["10.0.0.0/33"])).toBe(false); // oversized prefix for IPv4
    expect(isTrustedProxy("1.2.3.4", ["::1/128"])).toBe(false);     // family mismatch
    expect(isTrustedProxy("1.2.3.4", ["10.0.0.0/x"])).toBe(false);  // non-numeric prefix
    expect(isTrustedProxy("1.2.3.4", [""])).toBe(false);            // empty entry
    expect(isTrustedProxy("10.9.8.7", ["10.0.0.0/8 ".trim()])).toBe(true); // tolerated whitespace
  });
  test("explicit /0 is the operator's documented choice and still works", () => {
    expect(isTrustedProxy("203.0.113.9", ["0.0.0.0/0"])).toBe(true);
  });
  test("trusted-entry matching is case-insensitive for hex digits", () => {
    expect(isTrustedProxy("fd00::1234", ["FD00::/8"])).toBe(true);
    expect(isTrustedProxy("FD00::1234", ["fd00::1234"])).toBe(true);
  });
  test("mapped IPv4 and uppercase-hex XFF entries are accepted hops", () => {
    expect(normalizeIpCandidate("::ffff:1.2.3.4")).toBe("::ffff:1.2.3.4");
    expect(normalizeIpCandidate("2001:DB8::AB")).toBe("2001:DB8::AB");
    expect(normalizeIpCandidate("::ffff:999.1.2.3")).toBeNull();
  });
  test("more than 16 hops — leftmost beyond-cap hops are ignored", () => {
    process.env.TRUSTED_PROXIES = "10.0.0.0/8";
    // 203.0.113.99 is untrusted but sits at position 1 of 21 hops; only the
    // rightmost 16 are considered, all of which are trusted 10.x addresses,
    // so no client identity is derivable.
    const hops = ["203.0.113.99", ...Array.from({ length: 20 }, (_, i) => `10.0.0.${i + 1}`)];
    const req = reqWith({ "x-forwarded-for": hops.join(", ") });
    expect(clientIp(req)).toBe("local");
  });
  test("whitespace-only and 'unknown' XFF values are not usable hops", () => {
    process.env.TRUSTED_PROXIES = "127.0.0.1";
    expect(clientIp(reqWith({ "x-forwarded-for": " , , " }), "127.0.0.1")).toBe("127.0.0.1");
    expect(clientIp(reqWith({ "x-forwarded-for": "unknown" }), "127.0.0.1")).toBe("127.0.0.1");
    expect(clientIp(reqWith({ "x-forwarded-for": "" }), "127.0.0.1")).toBe("127.0.0.1");
  });
  test("uppercase-hex IPv6 XFF hops participate in trusted-set walk", () => {
    process.env.TRUSTED_PROXIES = "FD00::/8";
    const req = reqWith({ "x-forwarded-for": "198.51.100.77, FD00::10" });
    expect(clientIp(req)).toBe("198.51.100.77");
  });
});
