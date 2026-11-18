// Shared client-IP derivation for rate limits, throttles and audit metadata.
//
// X-Forwarded-For is only meaningful when every hop between the client and
// the app is a proxy that (a) strips or overwrites client-supplied entries
// and (b) appends the real peer. The deployment's Caddy does overwrite the
// header (`header_up X-Forwarded-For {remote_host}`), but the Next server is
// also directly reachable, so the header can never be trusted verbatim.
//
// Algorithm:
//   1. If the immediate peer (the TCP peer of the hop talking to us) is known
//      and NOT in the trusted set, X-Forwarded-For is entirely
//      attacker-controlled → return the peer, ignore the header.
//   2. If the peer is trusted (or unknown-but-the-operator-configured
//      TRUSTED_PROXIES, asserting the ingress rewrites the header), walk the
//      X-Forwarded-For list from the RIGHT, skipping hops in the trusted set,
//      and return the first untrusted address. The rightmost untrusted hop is
//      the closest address that is not one of our own proxies.
//   3. If the immediate peer cannot be determined (the default in stock
//      Next.js route handlers — no socket info is exposed) and no
//      TRUSTED_PROXIES is configured, fall back to "local": every caller gets
//      the same bucket, so header rotation cannot defeat per-IP throttles.
//      Operators fronting the app with a proxy that rewrites X-Forwarded-For
//      should set TRUSTED_PROXIES (comma-separated IPs or CIDRs,
//      e.g. "TRUSTED_PROXIES=10.0.0.0/8,127.0.0.1") to recover per-client IPs.
//
// Unparseable hops are skipped; when no usable address is found the answer
// is "local", never an attacker-chosen string.

import type { NextRequest } from "next/server";

const DEFAULT_TRUSTED_PROXIES = ["127.0.0.1"];

/** Parses TRUSTED_PROXIES: comma-separated IPs and/or CIDRs (IPv4 + IPv6). */
export function parseTrustedProxies(raw: string | undefined = process.env.TRUSTED_PROXIES): string[] {
  const trimmed = raw?.trim();
  if (!trimmed) return [...DEFAULT_TRUSTED_PROXIES];
  return trimmed
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function ipv4ToBigInt(ip: string): bigint | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0n;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = (value << 8n) | BigInt(octet);
  }
  return value;
}

const MAX_XFF_HOPS = 16;

function ipv6ToBigInt(ip: string): bigint | null {
  // An embedded dotted-quad tail ("::ffff:1.2.3.4") occupies the last 32 bits
  // per RFC 4291; rewrite it as two hextets so the rest parses uniformly.
  const lastColon = ip.lastIndexOf(":");
  const tail = ip.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = ipv4ToBigInt(tail);
    if (v4 === null) return null;
    const hi = ((v4 >> 16n) & 0xffffn).toString(16);
    const lo = (v4 & 0xffffn).toString(16);
    ip = `${ip.slice(0, lastColon + 1)}${hi}:${lo}`;
  }
  // Expand "::" compression, then parse 8 hextets.
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":").filter(Boolean) : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":").filter(Boolean) : [];
  if (halves.length === 1 && left.length !== 8) return null;
  const missing = 8 - left.length - right.length;
  if (missing < 0) return null;
  const hextets = halves.length === 2 ? [...left, ...Array<string>(missing).fill("0"), ...right] : left;
  if (hextets.length !== 8) return null;
  let value = 0n;
  for (const hextet of hextets) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(hextet)) return null;
    value = (value << 16n) | BigInt(parseInt(hextet, 16));
  }
  return value;
}

function ipToBigInt(ip: string): { value: bigint; bits: number } | null {
  if (ip.includes(":")) {
    const value = ipv6ToBigInt(ip);
    if (value === null) return null;
    // IPv4-mapped (::ffff:0:0/96): compare as IPv4 so mapped hops match
    // IPv4 CIDRs and exact IPv4 trusted entries.
    if (value >> 32n === 0xffffn) return { value: value & 0xffffffffn, bits: 32 };
    return { value, bits: 128 };
  }
  const value = ipv4ToBigInt(ip);
  return value === null ? null : { value, bits: 32 };
}

/** Strips brackets/port decoration: "[::1]:443" → "::1", "1.2.3.4:443" → "1.2.3.4". */
export function normalizeIpCandidate(raw: string): string | null {
  let candidate = raw.trim();
  if (!candidate) return null;
  const bracketed = /^\[([^\]]+)\](:\d+)?$/.exec(candidate);
  if (bracketed) candidate = bracketed[1];
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(candidate)) candidate = candidate.slice(0, candidate.lastIndexOf(":"));
  return ipToBigInt(candidate) ? candidate : null;
}

function maskFor(bits: number, prefix: number): bigint {
  if (prefix <= 0) return 0n;
  if (prefix >= bits) return (1n << BigInt(bits)) - 1n;
  return ((1n << BigInt(prefix)) - 1n) << BigInt(bits - prefix);
}

/** True when `ip` matches any entry in `trusted` (exact IP or CIDR).
 * Malformed entries (bad CIDR, empty prefix, oversized prefix, non-IP network)
 * are skipped — a typo must never broaden trust. */
export function isTrustedProxy(ip: string, trusted: string[]): boolean {
  const parsed = ipToBigInt(ip);
  if (!parsed) return false;
  for (const entry of trusted) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const slash = trimmed.indexOf("/");
    if (slash === -1) {
      const norm = normalizeIpCandidate(trimmed);
      const entryParsed = norm ? ipToBigInt(norm) : null;
      if (entryParsed && entryParsed.value === parsed.value && entryParsed.bits === parsed.bits) return true;
      continue;
    }
    const networkNorm = normalizeIpCandidate(trimmed.slice(0, slash));
    const prefixRaw = trimmed.slice(slash + 1).trim();
    // Empty or malformed prefix ("10.0.0.0/") must not mean /0.
    if (!/^\d{1,3}$/.test(prefixRaw)) continue;
    const prefix = Number(prefixRaw);
    const networkParsed = networkNorm ? ipToBigInt(networkNorm) : null;
    if (!networkParsed || networkParsed.bits !== parsed.bits) continue;
    if (prefix > networkParsed.bits) continue; // oversized prefix is not meaningful trust
    const mask = maskFor(parsed.bits, prefix);
    if ((parsed.value & mask) === (networkParsed.value & mask)) return true;
  }
  return false;
}

/**
 * Derives the client IP. `peer` is the immediate TCP peer when the runtime
 * can supply it (Next.js route handlers cannot — pass nothing); when it is
 * unknown and TRUSTED_PROXIES is not configured, returns "local" rather than
 * trusting the header.
 */
export function clientIp(req: NextRequest, peer?: string | null): string {
  const trusted = parseTrustedProxies();
  const resolvedPeer = peer ?? null;
  const peerNormalized = resolvedPeer ? normalizeIpCandidate(resolvedPeer) : null;

  // Peer known and untrusted → the header is worthless; the peer is the truth.
  if (peerNormalized && !isTrustedProxy(peerNormalized, trusted)) {
    return peerNormalized;
  }

  const xff = req.headers.get("x-forwarded-for");
  // Cap the walk: the rightmost hops are the only ones we consider anyway,
  // and an unbounded list would let a client force linear work per request.
  const hops = xff
    ? xff.split(",").map(normalizeIpCandidate).slice(-MAX_XFF_HOPS)
    : [];
  // The header may only be honored when we know the peer is a trusted proxy,
  // or the operator configured TRUSTED_PROXIES to assert the ingress rewrites
  // the header. Otherwise (stock Next.js: no socket info, no env) the answer
  // is "local" — a single bucket, immune to header rotation.
  const mayTrustXff = Boolean(peerNormalized) || Boolean(process.env.TRUSTED_PROXIES?.trim());
  if (mayTrustXff && hops.length > 0) {
    for (let i = hops.length - 1; i >= 0; i--) {
      const hop = hops[i];
      if (hop && !isTrustedProxy(hop, trusted)) return hop;
    }
    // Every hop was trusted — no client identity derivable.
    return peerNormalized ?? "local";
  }

  return peerNormalized ?? "local";
}
