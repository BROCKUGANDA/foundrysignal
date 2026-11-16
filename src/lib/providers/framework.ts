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
 * IPv6 SSRF blocklist: loopback, link-local, ULA, IPv4-mapped, NAT64,
 * 6to4, discard-only and unspecified ranges. IPv4-mapped addresses are
 * additionally re-checked through isPrivateIpv4.
 */
export function isPrivateIpv6(ipRaw: string): boolean {
  const ip = ipRaw.toLowerCase().replace(/^\[|\]$/g, "");
  if (ip === "::" || ip === "::1") return true; // unspecified / loopback
  if (ip.startsWith("fe8") || ip.startsWith("fe9") || ip.startsWith("fea") || ip.startsWith("feb")) return true; // link-local
  if (ip.startsWith("fc") || ip.startsWith("fd")) return true; // ULA fc00::/7
  if (ip.startsWith("::ffff:")) {
    const v4 = ip.slice(7);
    return isPrivateIpv4(v4);
  }
  if (ip.startsWith("64:ff9b:")) return true; // NAT64 well-known prefix
  if (ip.startsWith("2002:")) return true; // 6to4
  if (ip.startsWith("100:")) return true; // discard-only 100::/64
  if (ip.startsWith("::/")) return true; // defensive: malformed prefix forms
  // ::a.b.c.d textual form (IPv4-compressed)
  const v4Match = ip.match(/^::((?:\d{1,3}\.){3}\d{1,3})$/);
  if (v4Match) return isPrivateIpv4(v4Match[1]);
  return false;
}

export interface GuardedFetchResult {
  status: number;
  body: string;
  contentType: string;
  finalUrl: string;
}

/** Validates one URL hop: scheme allowlist, metadata blocklist, DNS/IP private-range denial. */
async function validateHop(hopUrl: URL): Promise<void> {
  if (hopUrl.protocol !== "http:" && hopUrl.protocol !== "https:") {
    throw new ProviderError("PERMANENT", "Only http/https URLs are allowed", false);
  }
  const hostname = hopUrl.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new ProviderError("PERMANENT", "Blocked host", false);
  }
  const { isIP } = await import("net");
  const dns = await import("dns/promises");
  if (isIP(hostname)) {
    if (isPrivateIpv4(hostname) || isPrivateIpv6(hostname)) {
      throw new ProviderError("PERMANENT", "Private IP addresses are not fetchable", false);
    }
    return;
  }
  try {
    const records = await dns.lookup(hostname, { all: true, verbatim: true });
    if (records.length === 0) throw new ProviderError("PERMANENT", "Host could not be resolved", false);
    for (const r of records) {
      if (isPrivateIpv4(r.address) || isPrivateIpv6(r.address)) {
        throw new ProviderError("PERMANENT", "Host resolves to a private address", false);
      }
    }
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    throw new ProviderError("PERMANENT", "DNS resolution failed", false);
  }
}

const MAX_REDIRECTS = 3;

/**
 * Fetches a user-supplied URL with SSRF defenses:
 * - only http/https, per-hop
 * - hostname blocklist (metadata endpoints), per-hop
 * - resolved-IP check against private/link-local ranges (v4 + v6, incl.
 *   mapped/NAT64/6to4), re-resolved per attempt and per redirect hop
 * - redirects are followed MANUALLY: every Location hop is re-validated before
 *   being fetched, so a public entry point cannot redirect into private space
 *
 * Residual risk (documented in SECURITY_REVIEW): the OS resolver and the HTTP
 * client resolve DNS independently, so a hostile authoritative server can
 * still attempt a rebinding race between validation and connection. Full
 * mitigation requires connect-by-IP pinning or an egress proxy — tracked as
 * a known limitation, not silently assumed away.
 */
export async function guardedFetch(
  inputUrl: string,
  opts?: { timeoutMs?: number; maxBytes?: number }
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
  let hop = 0;
  let lastStatus = 0;

  while (true) {
    await validateHop(current);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(current.toString(), {
        signal: controller.signal,
        redirect: "manual", // every redirect hop is re-validated below
        headers: {
          "User-Agent": "FoundrySignal-Collector/1.0 (+https://foundrysignal.example/bot)",
          Accept: "text/html,application/xhtml+xml",
        },
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new ProviderError("TIMEOUT", "Fetch timed out");
      }
      throw new ProviderError("NETWORK", `Fetch failed: ${String(err)}`);
    } finally {
      clearTimeout(timer);
    }

    lastStatus = res.status;

    // Redirect handling: re-validate each hop (scheme/host/DNS) before following.
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
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
      res.body?.cancel().catch(() => undefined);
      current = next;
      hop += 1;
      if (hop > MAX_REDIRECTS) {
        throw new ProviderError("PERMANENT", `Too many redirects (>${MAX_REDIRECTS})`, false);
      }
      continue;
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("text/")) {
      res.body?.cancel().catch(() => undefined);
      throw new ProviderError("PERMANENT", `Unsupported content type: ${contentType}`, false);
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > maxBytes) {
      throw new ProviderError("PERMANENT", "Response exceeded size limit", false);
    }
    const body = new TextDecoder("utf-8").decode(buf);
    return { status: lastStatus, body, contentType, finalUrl: current.toString() };
  }
}
