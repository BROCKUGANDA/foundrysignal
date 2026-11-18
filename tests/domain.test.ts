// Shared-domain unit tests: URL parsing, SSRF guard rules, slugification,
// authorization rank logic, throttle classification.
import { describe, test, expect } from "bun:test";
import { parseGithubEntity, normalizeWebsite } from "@/lib/domain/ventures/service";
import { slugifyVenture } from "@/lib/domain/shared/slug";
import { ROLE_RANK } from "@/lib/auth/context";
import { isPrivateIpv4, isPrivateIpv6 } from "./helpers/ssrf";

describe("GitHub entity parsing", () => {
  test("parses organization URL", () => {
    const r = parseGithubEntity("https://github.com/solana-foundation");
    expect(r).not.toBeNull();
    expect(r!.kind).toBe("ORG");
    expect(r!.owner).toBe("solana-foundation");
  });

  test("parses repository URL", () => {
    const r = parseGithubEntity("https://github.com/solana-labs/solana-web3.js");
    expect(r!.kind).toBe("REPO");
    expect(r!.owner).toBe("solana-labs");
    expect(r!.repo).toBe("solana-web3.js");
  });

  test("rejects non-github URLs", () => {
    expect(parseGithubEntity("https://gitlab.com/foo/bar")).toBeNull();
    expect(parseGithubEntity("not a url")).toBeNull();
  });

  test("strips .git suffix", () => {
    const r = parseGithubEntity("https://github.com/foo/bar.git");
    expect(r!.repo).toBe("bar");
  });
});

describe("website normalization", () => {
  test("adds https and strips www", () => {
    const r = normalizeWebsite("www.example.com");
    expect(r!.domain).toBe("example.com");
    expect(r!.url).toBe("https://example.com");
  });

  test("rejects localhost and metadata endpoints", () => {
    expect(normalizeWebsite("http://localhost:3000")).toBeNull();
    expect(normalizeWebsite("http://169.254.169.254/latest/meta-data")).toBeNull();
    expect(normalizeWebsite("http://127.0.0.1")).toBeNull();
  });
});

describe("slugification", () => {
  test("keeps alphanumeric dashes", () => {
    expect(slugifyVenture("Acme DeFi Labs!")).toBe("acme-defi-labs");
  });
  test("falls back for empty", () => {
    expect(slugifyVenture("***")).toMatch(/^venture-/);
  });
});

describe("workspace role ranking (RBAC)", () => {
  test("owner outranks admin outranks analyst outranks viewer", () => {
    expect(ROLE_RANK.OWNER).toBeGreaterThan(ROLE_RANK.ADMIN);
    expect(ROLE_RANK.ADMIN).toBeGreaterThan(ROLE_RANK.ANALYST);
    expect(ROLE_RANK.ANALYST).toBeGreaterThan(ROLE_RANK.VIEWER);
  });
});

describe("SSRF private-range detection", () => {
  test.each([
    ["10.0.0.1", true],
    ["127.0.0.1", true],
    ["169.254.169.254", true],
    ["172.16.0.9", true],
    ["192.168.1.1", true],
    ["100.64.0.2", true],
    ["0.0.0.0", true],
    ["8.8.8.8", false],
    ["1.1.1.1", false],
    ["93.184.216.34", false],
  ])("%s → %p", (ip, expected) => {
    expect(isPrivateIpv4(ip)).toBe(expected);
  });
});

describe("SSRF IPv6 private-range detection", () => {
  test.each([
    ["::1", true],
    ["::", true],
    ["fe80::1", true],
    ["fc00::1", true],
    ["fd12:3456:789a:1::1", true],
    ["::ffff:10.0.0.1", true],
    ["::ffff:192.168.1.1", true],
    ["::ffff:8.8.8.8", false],
    ["64:ff9b::8.8.8.8", true],
    ["2002:0a00:0001::1", true],
    ["100::1", true],
    ["2607:f8b0:4005:80a::200e", false],
    ["2a01:4f8:c17:1234::1", false],
  ])("%s → %p", (ip, expected) => {
    expect(isPrivateIpv6(ip)).toBe(expected);
  });
});

describe("SSRF IPv6 private-range detection — hex/embedded forms", () => {
  test.each([
    ["::ffff:7f00:1", true],            // IPv4-mapped 127.0.0.1 in hex hextets
    ["::ffff:7f00:0001", true],         // full hextet form of the above
    ["0:0:0:0:0:ffff:7f00:0001", true], // full mapped form, left-padded
    ["::ffff:a00:1", true],             // IPv4-mapped 10.0.0.1
    ["::7f00:0001", true],              // deprecated ::/96 compatible, hex form
    ["::127.0.0.1", true],              // compatible, dotted tail
    ["::10.0.0.1", true],               // compatible, dotted tail
    ["64:ff9b::7f00:0001", true],       // NAT64 of 127.0.0.1
    ["2002:0a00:0001::", true],         // 6to4 prefix
    ["::ffff:8.8.8.8", false],          // mapped public address stays public
    ["::ffff:808:808", false],          // mapped 8.8.8.8 in hex
    ["fe90::abcd", true],               // link-local /10 (fe80..febf)
    ["fdaa::1", true],                  // ULA
    ["2607:f8b0:4005:80a::200e", false],// public Google
  ])("%s → %p", (ip, expected) => {
    expect(isPrivateIpv6(ip)).toBe(expected);
  });
});
