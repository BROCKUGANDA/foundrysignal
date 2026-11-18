import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import type { LookupFunction } from "node:net";
import { lookup as dnsLookup } from "node:dns/promises";

// Provider framework: DataProvider contract, circuit breaker, rate-limit state.
// Every external integration implements this contract; adapters never merge
// data across providers as if equivalent — every observation carries its provider.

export type ProviderHealthState = "HEALTHY" | "DEGRADED" | "RATE_LIMITED" | "UNAVAILABLE" | "MISCONFIGURED";

export type ProviderFailureKind =
  | "NETWORK" | "TIMEOUT" | "RATE_LIMITED" | "INVALID_RESPONSE" | "AUTH_FAILURE" | "PERMANENT" | "PROVIDER_BLOCKED";

export interface RateLimitState {
  limit: number | null;
  remaining: number | null;
  resetAt: Date | null;
  source: "HEADER" | "PROBE" | "CONFIG";
}

export interface ProviderRequest {
  url: string;
  init?: RequestInit & { headers?: Record<string, string> };
  timeoutMs?: number;
}

export interface ProviderResult<T> {
  data: T;
  rateLimit?: RateLimitState;
  collectedAt: Date;
}

export interface DataProvider {
  readonly name: string;
  getHealth(): Promise<ProviderHealthState>;
  fetch<T>(request: ProviderRequest, parse: (raw: unknown) => T): Promise<ProviderResult<T>>;
  getRateLimitState(): Promise<RateLimitState>;
}

export class ProviderError extends Error {
  constructor(
    public kind: ProviderFailureKind,
    message: string,
    public retryable: boolean = kind === "NETWORK" || kind === "TIMEOUT" || kind === "RATE_LIMITED"
  ) {
    super(message);
  }
}

// ─── Circuit breaker (per provider) ───────────────────────────────────

interface BreakerState {
  failures: number;
  openedAt: number | null;
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
}

const FAILURE_THRESHOLD = 5;
const OPEN_DURATION_MS = 30_000;

const breakers = new Map<string, BreakerState>();

function breaker(name: string): BreakerState {
  let b = breakers.get(name);
  if (!b) {
    b = { failures: 0, openedAt: null, state: "CLOSED" };
    breakers.set(name, b);
  }
  return b;
}

export function breakerAllows(name: string): boolean {
  const b = breaker(name);
  if (b.state === "OPEN") {
    if (b.openedAt && Date.now() - b.openedAt > OPEN_DURATION_MS) {
      b.state = "HALF_OPEN";
      return true;
    }
    return false;
  }
  return true;
}

export function breakerRecordSuccess(name: string): void {
  const b = breaker(name);
  b.failures = 0;
  b.state = "CLOSED";
  b.openedAt = null;
}

export function breakerRecordFailure(name: string): void {
  const b = breaker(name);
  b.failures += 1;
  if (b.failures >= FAILURE_THRESHOLD || b.state === "HALF_OPEN") {
    b.state = "OPEN";
    b.openedAt = Date.now();
  }
}

export function breakerSnapshot(name: string): BreakerState {
  return { ...breaker(name) };
}

// ─── Base provider implementation ─────────────────────────────────────

export interface BaseProviderConfig {
  name: string;
  timeoutMs?: number;
  parseRateLimit?: (headers: Headers) => RateLimitState | undefined;
}

export function createBaseProvider(config: BaseProviderConfig): DataProvider {
  const lastRateLimit: { state: RateLimitState } = {
    state: { limit: null, remaining: null, resetAt: null, source: "CONFIG" },
  };
  return {
    name: config.name,
    async getHealth(): Promise<ProviderHealthState> {
      const b = breakerSnapshot(config.name);
      if (b.state === "OPEN") return "DEGRADED";
      if (lastRateLimit.state.remaining !== null && lastRateLimit.state.remaining === 0) return "RATE_LIMITED";
      return "HEALTHY";
    },
    async getRateLimitState(): Promise<RateLimitState> {
      return lastRateLimit.state;
    },
    async fetch<T>(request: ProviderRequest, parse: (raw: unknown) => T): Promise<ProviderResult<T>> {
      if (!breakerAllows(config.name)) {
        throw new ProviderError("NETWORK", `Circuit breaker open for ${config.name}`, true);
      }
      const timeoutMs = request.timeoutMs ?? config.timeoutMs ?? 15_000;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(request.url, { ...request.init, signal: controller.signal });
        if (config.parseRateLimit) {
          const rl = config.parseRateLimit(res.headers);
          if (rl) lastRateLimit.state = rl;
        }
        if (res.status === 429) {
          throw new ProviderError("RATE_LIMITED", `${config.name}: rate limited (HTTP 429)`);
        }
        if (res.status === 401 || res.status === 403) {
          throw new ProviderError("AUTH_FAILURE", `${config.name}: authentication failure (HTTP ${res.status})`, false);
        }
        if (res.status === 423 || res.status === 451) {
          throw new ProviderError("PERMANENT", `${config.name}: resource blocked (HTTP ${res.status})`, false);
        }
        if (!res.ok) {
          const retryable = res.status >= 500;
          throw new ProviderError(retryable ? "NETWORK" : "PERMANENT", `${config.name}: HTTP ${res.status}`, retryable);
        }
        const text = await res.text();
        let raw: unknown;
        try {
          raw = JSON.parse(text);
        } catch {
          raw = text;
        }
        let data: T;
        try {
          data = parse(raw);
        } catch (err) {
          throw new ProviderError("INVALID_RESPONSE", `${config.name}: invalid response schema — ${String(err)}`, false);
        }
        breakerRecordSuccess(config.name);
        return { data, rateLimit: lastRateLimit.state, collectedAt: new Date() };
      } catch (err) {
        if (err instanceof ProviderError) {
          if (!err.retryable) breakerRecordFailure(config.name);
          if (err.kind === "NETWORK" || err.kind === "TIMEOUT") breakerRecordFailure(config.name);
          throw err;
        }
        if (err instanceof Error && err.name === "AbortError") {
          breakerRecordFailure(config.name);
          throw new ProviderError("TIMEOUT", `${config.name}: request timed out after ${timeoutMs}ms`);
        }
        breakerRecordFailure(config.name);
        throw new ProviderError("NETWORK", `${config.name}: ${String(err)}`);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

// ─── SSRF-guarded fetch (for user-supplied URLs) ──────────────────────

const BLOCKED_HOSTNAMES = new Set([
  "metadata.google.internal", "metadata.goog", "instance-data",
]);

export function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((n) => parseInt(n, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local incl. AWS metadata 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 192 && b === 0) return true; // 192.0.0.0/24
  if (a === 198 && (b === 18 || b === 19)) return true;
  return false;
}

/**
 * Expands an IPv6 literal to its 8 hextets, handling "::" compression and an
 * embedded dotted-quad tail (RFC 4291). Returns null when unparseable.
 */
function ipv6Hextets(raw: string): number[] | null {
  let ip = raw.toLowerCase().replace(/^\[|\]$/g, "");
  const lastColon = ip.lastIndexOf(":");
  const tail = lastColon >= 0 ? ip.slice(lastColon + 1) : ip;
  if (tail.includes(".")) {
    const parts = tail.split(".");
    if (parts.length !== 4) return null;
    const octets: number[] = [];
    for (const p of parts) {
      if (!/^\d{1,3}$/.test(p)) return null;
      const n = Number(p);
      if (n > 255) return null;
      octets.push(n);
    }
    const hi = ((octets[0] << 8) | octets[1]).toString(16);
    const lo = ((octets[2] << 8) | octets[3]).toString(16);
    ip = `${ip.slice(0, lastColon + 1)}${hi}:${lo}`;
  }
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":").filter(Boolean) : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":").filter(Boolean) : [];
  if (halves.length === 1 && left.length !== 8) return null;
  const missing = 8 - left.length - right.length;
  if (missing < 0) return null;
  const hextets = halves.length === 2 ? [...left, ...Array<string>(missing).fill("0"), ...right] : left;
  if (hextets.length !== 8) return null;
  const out: number[] = [];
  for (const h of hextets) {
    if (!/^[0-9a-f]{1,4}$/.test(h)) return null;
    out.push(parseInt(h, 16));
  }
  return out;
}

/**
 * IPv6 SSRF blocklist: loopback, link-local, ULA, IPv4-mapped, NAT64, 6to4,
 * discard-only and unspecified ranges. IPv4-mapped and IPv4-compatible
 * (deprecated, ::/96) addresses are re-checked through isPrivateIpv4 in any
 * textual form (dotted tail or hex hextets), so "::ffff:7f00:1" cannot
 * smuggle 127.0.0.1 past the filter.
 */
export function isPrivateIpv6(ipRaw: string): boolean {
  const h = ipv6Hextets(ipRaw);
  if (!h) return ipRaw.includes(":"); // fail safe on unparseable IPv6-looking input
  if (h.every((x) => x === 0)) return true; // :: unspecified
  if (h.slice(0, 7).every((x) => x === 0) && h[7] === 1) return true; // ::1 loopback
  if ((h[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((h[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
  // ::ffff:0:0/96 IPv4-mapped → re-check embedded IPv4 (dotted or hex form)
  if (h.slice(0, 5).every((x) => x === 0) && h[5] === 0xffff) {
    return isPrivateIpv4(`${h[6] >> 8}.${h[6] & 255}.${h[7] >> 8}.${h[7] & 255}`);
  }
  // ::/96 IPv4-compatible (deprecated) → re-check embedded IPv4
  if (h.slice(0, 6).every((x) => x === 0)) {
    return isPrivateIpv4(`${h[6] >> 8}.${h[6] & 255}.${h[7] >> 8}.${h[7] & 255}`);
  }
  if (h[0] === 0x0064 && h[1] === 0xff9b) return true; // 64:ff9b::/96 NAT64 well-known prefix
  if (h[0] === 0x2002) return true; // 2002::/16 6to4
  if (h[0] === 0x0100 && h[1] === 0x0000 && h[2] === 0x0000 && h[3] === 0x0000) return true; // 100::/64 discard-only
  return false;
}

export interface GuardedFetchResult {
  status: number;
  body: string;
  contentType: string;
  finalUrl: string;
}

/** Pinned address chosen by hop validation and used for the connection. */
export interface PinnedAddress {
  address: string;
  family: number;
}

/** DNS lookup with `all: true` — the seam tests inject to simulate a rebinding authoritative server. */
export type LookupAll = (
  hostname: string,
  options: { all: true; verbatim: true }
) => Promise<PinnedAddress[]>;

/**
 * Connect-time lookup handed to the HTTP transport. It never touches DNS:
 * it answers with the single address that already passed this hop's
 * validation, so the connection cannot be rebound to a different answer.
 */
export type ConnectLookup = (
  hostname: string,
  options: { all?: boolean } & Record<string, unknown>,
  callback: (
    err: NodeJS.ErrnoException | null,
    address?: string | PinnedAddress[],
    family?: number
  ) => void
) => void;

export interface TransportResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

export type GuardedTransport = (
  url: URL,
  pinned: PinnedAddress,
  lookup: ConnectLookup,
  init: { timeoutMs: number; maxBytes: number; headers: Record<string, string> }
) => Promise<TransportResponse>;

export interface GuardedFetchDeps {
  /** Test seam: DNS lookup used for hop validation. Defaults to dns.promises.lookup. */
  lookup?: LookupAll;
  /** Test seam: HTTP transport. Defaults to node:http/node:https with connect-by-IP pinning. */
  transport?: GuardedTransport;
}

const defaultLookup: LookupAll = (hostname, options) =>
  dnsLookup(hostname, options) as Promise<PinnedAddress[]>;

/** Builds a connect-time lookup that returns ONLY the pinned, pre-validated address. */
export function pinnedLookupFor(pinned: PinnedAddress): ConnectLookup {
  return (_hostname, options, callback) => {
    if (options && options.all) {
      callback(null, [{ address: pinned.address, family: pinned.family }]);
      return;
    }
    callback(null, pinned.address, pinned.family);
  };
}

function firstHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | undefined {
  const v = headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0];
  return typeof v === "string" ? v : undefined;
}

/**
 * Validates one URL hop (scheme allowlist, metadata blocklist, DNS/IP
 * private-range denial — all checks unchanged) and returns the ONE address
 * the connection must be pinned to. The connection may only use the address
 * returned here; DNS is never consulted again for this hop.
 */
async function validateHop(hopUrl: URL, lookup: LookupAll): Promise<PinnedAddress> {
  if (hopUrl.protocol !== "http:" && hopUrl.protocol !== "https:") {
    throw new ProviderError("PERMANENT", "Only http/https URLs are allowed", false);
  }
  const hostname = hopUrl.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new ProviderError("PERMANENT", "Blocked host", false);
  }
  const ipVersion = isIP(hostname);
  if (ipVersion) {
    if (isPrivateIpv4(hostname) || isPrivateIpv6(hostname)) {
      throw new ProviderError("PERMANENT", "Private IP addresses are not fetchable", false);
    }
    return { address: hostname, family: ipVersion };
  }
  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    if (records.length === 0) throw new ProviderError("PERMANENT", "Host could not be resolved", false);
    for (const r of records) {
      if (isPrivateIpv4(r.address) || isPrivateIpv6(r.address)) {
        throw new ProviderError("PERMANENT", "Host resolves to a private address", false);
      }
    }
    // Every record passed the private-range checks; pin to the first valid one.
    return { address: records[0].address, family: records[0].family };
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    throw new ProviderError("PERMANENT", "DNS resolution failed", false);
  }
}

/** Marker error so transport timeouts map onto the ProviderError TIMEOUT contract. */
class GuardedTimeoutError extends Error {}

/**
 * Default transport: node:http/node:https request whose connect-time DNS
 * lookup always returns the pinned, pre-validated address. The hostname is
 * preserved for the Host header and TLS SNI — only address resolution is pinned.
 * undici is not a dependency of this app (Node's global fetch has no dispatcher
 * option), so pinning is enforced at the node:http layer instead.
 */
const requestPinned: GuardedTransport = (url, _pinned, lookup, init) => {
  const { promise, resolve, reject } = Promise.withResolvers<TransportResponse>();
  const client = url.protocol === "https:" ? https : http;
    const timeoutError = new GuardedTimeoutError("Fetch timed out");
    const req = client.request(
      url,
      {
        lookup: lookup as unknown as LookupFunction,
        agent: false,
        headers: init.headers,
      },
      (res) => {
        const headers = res.headers as Record<string, string | string[] | undefined>;
        const status = res.statusCode ?? 0;
        // Redirect bodies are not buffered or size-capped: the hop is either
        // superseded by manual redirect handling or returned to the caller.
        if (status >= 300 && status < 400 && firstHeader(headers, "location")) {
          res.resume();
          resolve({ status, headers, body: "" });
          return;
        }
        const chunks: Buffer[] = [];
        let received = 0;
        let settled = false;
        res.on("data", (chunk: Buffer) => {
          if (settled) return;
          received += chunk.length;
          if (received > init.maxBytes) {
            settled = true;
            res.resume(); // discard the remainder
            reject(new ProviderError("PERMANENT", "Response exceeded size limit", false));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          if (settled) return;
          settled = true;
          resolve({ status, headers, body: Buffer.concat(chunks).toString("utf-8") });
        });
        res.on("error", (err) => {
          if (settled) return;
          settled = true;
          reject(err);
        });
      }
    );
    const timer = setTimeout(() => {
      req.destroy(timeoutError);
    }, init.timeoutMs);
    req.on("error", (err) => {
      clearTimeout(timer);
      if (err === timeoutError) {
        reject(timeoutError);
        return;
      }
      reject(err);
    });
    req.on("close", () => clearTimeout(timer));
    req.end();
  return promise;
};

const MAX_REDIRECTS = 3;

/**
 * Fetches a user-supplied URL with SSRF defenses:
 * - only http/https, per-hop
 * - hostname blocklist (metadata endpoints), per-hop
 * - resolved-IP check against private/link-local ranges (v4 + v6, incl.
 *   mapped/NAT64/6to4), re-resolved per attempt and per redirect hop
 * - connect-by-IP pinning: the validated address for a hop is the ONLY address
 *   the connection may use — the transport's connect-time lookup returns the
 *   pinned address and never consults DNS again, closing the DNS-rebinding
 *   race between validation and connect
 * - redirects are followed MANUALLY: every Location hop is re-validated and
 *   re-pinned before being fetched, so a public entry point cannot redirect
 *   into private space
 *
 * undici is not a dependency of this app (and Node's global fetch exposes no
 * dispatcher option), so pinning is enforced at the node:http/node:https
 * layer via a custom `lookup`; hostname, Host header and TLS SNI are
 * preserved — only address resolution is pinned.
 */
export async function guardedFetch(
  inputUrl: string,
  opts?: { timeoutMs?: number; maxBytes?: number },
  deps?: GuardedFetchDeps
): Promise<GuardedFetchResult> {
  let current: URL;
  try {
    current = new URL(inputUrl);
  } catch {
    throw new ProviderError("PERMANENT", "Malformed URL", false);
  }
  current.hash = ""; // never transmit fragments across redirects

  const timeoutMs = opts?.timeoutMs ?? 10_000;
  const maxBytes = opts?.maxBytes ?? 512 * 1024;
  const lookup = deps?.lookup ?? defaultLookup;
  const transport = deps?.transport ?? requestPinned;
  let hop = 0;
  let lastStatus = 0;

  while (true) {
    // Validate AND pin: the connection for this hop goes to the very address
    // that just passed the private-range checks — DNS is not consulted again.
    const pinned = await validateHop(current, lookup);

    let res: TransportResponse;
    try {
      res = await transport(current, pinned, pinnedLookupFor(pinned), {
        timeoutMs,
        maxBytes,
        headers: {
          "User-Agent": "FoundrySignal-Collector/1.0 (+https://foundrysignal.aiazimara.com/bot)",
          Accept: "text/html,application/xhtml+xml",
        },
      });
    } catch (err) {
      if (err instanceof ProviderError) throw err; // e.g. transport-enforced size limit
      if (err instanceof GuardedTimeoutError || (err instanceof Error && err.name === "AbortError")) {
        throw new ProviderError("TIMEOUT", "Fetch timed out");
      }
      throw new ProviderError("NETWORK", `Fetch failed: ${String(err)}`);
    }

    lastStatus = res.status;

    // Redirect handling: re-validate and re-pin each hop (scheme/host/DNS) before following.
    if (res.status >= 300 && res.status < 400) {
      const location = firstHeader(res.headers, "location");
      if (!location) {
        throw new ProviderError("PERMANENT", `Redirect ${res.status} without Location`, false);
      }
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        throw new ProviderError("PERMANENT", "Malformed redirect target", false);
      }
      next.hash = "";
      current = next;
      hop += 1;
      if (hop > MAX_REDIRECTS) {
        throw new ProviderError("PERMANENT", `Too many redirects (>${MAX_REDIRECTS})`, false);
      }
      continue;
    }

    const contentType = firstHeader(res.headers, "content-type") ?? "";
    if (!contentType.startsWith("text/")) {
      throw new ProviderError("PERMANENT", `Unsupported content type: ${contentType}`, false);
    }
    const bodyByteLength = Buffer.byteLength(res.body, "utf-8");
    if (bodyByteLength > maxBytes) {
      throw new ProviderError("PERMANENT", "Response exceeded size limit", false);
    }
    return { status: lastStatus, body: res.body, contentType, finalUrl: current.toString() };
  }
}
