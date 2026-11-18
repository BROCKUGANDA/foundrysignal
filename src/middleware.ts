// Middleware: per-request CSP with a cryptographic nonce.
//
// Every document response carries a unique `script-src 'nonce-…'` policy.
// The nonce is forwarded to the render pipeline on the *request* headers:
//   - `x-middleware-nonce`       → read by app code via `await headers()`
//   - `Content-Security-Policy`  → parsed by Next.js (getScriptNonceFromHeaders)
//     so framework-emitted <script> tags (hydration bootstrap, RSC payload
//     pushes) receive the same nonce automatically.
// The response CSP is set here once; next.config.ts intentionally does NOT
// set a Content-Security-Policy, so each response carries exactly one.
//
// Uses Web Crypto (globalThis.crypto) so the module is runtime-agnostic —
// Node.js runtime (Next 16 default) and Edge both provide it.

import { NextResponse, type NextRequest } from "next/server";

const isProd = process.env.NODE_ENV === "production";

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function buildCsp(nonce: string): string {
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    // Turbopack HMR requires eval in dev; production stays strict.
    ...(isProd ? [] : ["'unsafe-eval'"]),
  ].join(" ");
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    // Styles are not script execution; inline styles are used pervasively by
    // client islands. Intentionally retained (accepted gap, documented).
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    // ws: for the dev HMR socket (same-origin); harmless in production.
    `connect-src 'self' https:${isProd ? "" : " ws:"}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export function middleware(request: NextRequest) {
  const nonce = generateNonce();
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-middleware-nonce", nonce);
  // Next.js extracts the nonce from the request CSP header for its own scripts.
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // All routes except immutable build assets — those serve no HTML and need
  // no CSP. Everything else (documents, RSC payloads, API JSON, security.txt)
  // passes through and gets exactly one CSP header from this middleware.
  matcher: ["/((?!_next/static|_next/image|_next/webpack-hmr).*)"],
};
