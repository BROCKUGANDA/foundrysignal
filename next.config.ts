import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Security headers applied to every route (pages + API). API route handlers
// add per-response headers too. The Content-Security-Policy is NOT set here:
// it is emitted per-response by src/middleware.ts with a per-request nonce
// (script-src 'nonce-…' 'strict-dynamic', no 'unsafe-inline'), so every
// document gets a fresh nonce. Keeping a second, static CSP here would make
// browsers enforce both policies (intersection) and break nonce'd scripts.

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  typescript: {
    // Full `tsc --noEmit` runs in CI/audit; the build must not mask config errors,
    // so type errors are NOT ignored — they fail the build.
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
        ],
      },
    ];
  },
};

export default nextConfig;
