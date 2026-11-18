# SSRF Fix Report — DNS-rebinding race (H-4)

Date: 2026-11-17
Scope: `src/lib/providers/framework.ts`, `tests/ssrf-pinning.test.ts`, `docs/SECURITY_MODEL.md`
Status: **Fixed** (connect-by-IP pinning). `bun x tsc --noEmit` clean, `bun test` 154/154 green, `bun run build` green.

## What changed

The SSRF guard (`guardedFetch`) already re-validated scheme, hostname blocklist and resolved-IP private ranges on every hop, but validation and connection were two separate DNS resolutions. A hostile authoritative DNS server could answer the validation lookup with a public address and the connect-time lookup with `169.254.169.254` / `127.0.0.1` (the cloud metadata endpoint) — the classic DNS-rebinding TOCTOU (audit §H-4).

Now, **the address chosen during validation is the only address the connection may use**:

1. `validateHop(hopUrl, lookup)` — unchanged checks, in order: scheme allowlist (`http:`/`https:` only) → metadata hostname blocklist → `isIP(hostname)` literal-IP path (private ranges still rejected) → `dns.lookup(hostname, { all: true, verbatim: true })` → **every** record re-checked against `isPrivateIpv4` / `isPrivateIpv6` (mapped/NAT64/6to4/ULA/link-local/loopback — byte-identical to before; any private record fails the hop, any all-private/empty answer fails the hop). Validation now **returns one pinned address**: the first validated record.
2. `pinnedLookupFor(pinned)` builds a `node:net` `lookup(hostname, options, callback)` that **never touches DNS** — it answers with the pinned address (array form when `options.all`, `address`+`family` otherwise). This is the pin.
3. The default transport `requestPinned` performs the request with `node:http`/`node:https` `client.request(url, { lookup, agent: false, headers })`. The hostname is preserved for the URL, the `Host` header and TLS SNI — only address resolution is pinned to the pre-validated IP. undici's global `fetch` cannot pin (no dispatcher option without an undici dependency), so pinning lives at the node:http layer.
4. `guardedFetch(inputUrl, opts?, deps?)` — caller signature unchanged. `deps` (optional, new) injects `{ lookup, transport }` for tests; production uses `dns.promises.lookup` and the pinned `node:http` transport.
5. Redirects are still followed manually (max 3 hops). **Each hop re-validates and re-pins independently** — the redirect target's own DNS answer is checked and the connection for that hop is pinned to that hop's answer. A public entry point cannot redirect into private space, and a rebinding answer on hop 2+ is equally pinned/rejected.
6. Preserved as-is: manual redirect machinery, 3-hop cap, 512 KB content cap (enforced while streaming, before buffering the whole body), `text/*` content-type allowlist, 10 s default timeout (now an explicit timer that destroys the request and maps to `ProviderError("TIMEOUT", "Fetch timed out")`), error contract (`ProviderError` `NETWORK`/`TIMEOUT`/`PERMANENT`/…), all call sites (`website.ts`, collector), and the user-supplied `User-Agent` (including the other agent's pending `foundrysignal.aiazimara.com` UA string).

IPv4/IPv6 blocklist functions (`isPrivateIpv4`, `isPrivateIpv6`) were not modified. No dependencies added. `undici` is not in `node_modules` and has no type declarations in this app, so the planned `undici` Agent route was replaced by the sanctioned `node:http`/`node:https` custom-`lookup` fallback.

## Test evidence

`tests/ssrf-pinning.test.ts` — fully offline (injected DNS lookup + injected transport; zero network I/O, zero real DNS):

- **Rebinding scenario**: first lookup returns `93.184.216.34` (public); any later lookup would return `169.254.169.254`. Asserts the pinned address seen by the transport is `93.184.216.34`, the connect-time lookup resolves to it in both `all` and single mode, and DNS was consulted **exactly once** (validation only).
- **Mixed answers** (public + metadata in one response): hop is rejected as `PERMANENT` before the transport is ever called.
- **Resolution failure** → `PERMANENT`.
- **Multi-hop pinning**: `entry.example` (302) → `hop2.example`; each hop's connection is pinned to that hop's own validated address (`entry.example@93.184.216.34`, `hop2.example@8.8.8.8`); exactly one validation lookup per hop; follows through to the 200 body and `finalUrl`.
- **Redirect into metadata address**: hop 2 rejected `PERMANENT`; hop 2's transport is never invoked.
- **`pinnedLookupFor`** single/all modes.

Note on approach: an end-to-end local-server test is impossible without weakening the guard (a 127.0.0.1 server would fail the private-range checks — correctly), so the test asserts at the lookup/transport seam. Both runtimes in this repo (Bun 1.4.2 for `bun test`/production `server.js`, Node 26 for scripts) honor the custom `lookup` in `node:http.request` — verified empirically for both, including `all: true` array semantics and `Host`-header preservation.

Verification:

- `bun x tsc --noEmit` — clean
- `bun test` — **154 pass / 0 fail** across 8 files (incl. the 6 new pinning tests; all pre-existing tests green)
- `bun run build` (`next build` + asset copy) — green

## Why redirects stay safe

Per-hop `validateHop` → per-hop pin. Hop *n*+1's `Location` is parsed, hash stripped, then fully re-validated (scheme, blocklist, DNS private-range denial on the **fresh** answer) and the connection is pinned to **that** answer. A redirect can therefore never inherit a stale validation or a raced connection.

## Residual risks / notes

- **Pin scope is per hop, not per request flow**: each redirect hop independently pins its own winner among public records; the collector never revalidates *after* the response body streams in — by design (checks happen before connection).
- **Multiple A/AAAA records**: we pin to the first valid record; we do not round-robin. If an authoritative server alternates public/private answers across *separate* requests to the same host, each request validates its own answer and private answers are rejected — the private address is never dialled.
- **Literal-IP URLs** (`http://203.0.113.7/`): validation passes for public literals and the connection pins trivially (no DNS at connect time anyway). Private literals remain rejected.
- **https** path uses the same `lookup` pinning; hostname/SNI preserved. Not exercised against a live TLS endpoint in tests (would require network); the mechanism is identical to `http` and verified at the lookup seam.
- **TOCTOU within TTL is eliminated** for the connection itself: connect-time DNS is bypassed entirely.
- Audit doc `docs/SECURITY_AUDIT.md` (§H-4) and `docs/SECURITY_FIX_REPORT.md` were left untouched as point-in-time records; `docs/SECURITY_MODEL.md` was updated to reflect the closed race. If an egress proxy is introduced later, it complements (not replaces) this pinning.
