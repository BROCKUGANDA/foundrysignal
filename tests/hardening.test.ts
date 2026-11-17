// Regressions for the production-hardening audit: gate enforcement, trusted
// throttle keys, credential redaction, visibility, and public-content polish.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { pathToSection } from "@/lib/client/routes";
import { safeRpcEndpoint } from "@/lib/providers/solana";
import robots from "@/app/robots";

const src = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

describe("trading release gate", () => {
  test("swap route refuses before building a signable transaction", () => {
    const route = src("src/app/api/v1/trading/swap/route.ts");
    expect(route).toContain("getTradingReadiness()");
    expect(route).toContain("EXECUTION_GATED");
    // The gate check must precede the provider call.
    expect(route.indexOf("getTradingReadiness()")).toBeLessThan(route.indexOf("createSwapOrder("));
  });

  test("execute accepts both gated and post-gate intent states", () => {
    const route = src("src/app/api/v1/trading/execute/route.ts");
    expect(route).toContain('intent.status !== "INTENT_RECORDED"');
    expect(route).toContain('status: { in: ["GATED_EXECUTION_DISABLED", "INTENT_RECORDED"] }');
  });
});

describe("trusted proxy and credential handling", () => {
  test("auth throttle prefers CF-Connecting-IP over client XFF", () => {
    const route = src("src/app/api/v1/auth/[action]/route.ts");
    expect(route).toContain('"cf-connecting-ip"');
    expect(route).not.toContain('req.headers.get("x-forwarded-for")?.split(",")[0]');
  });

  test("RPC endpoint display redacts credential query params", () => {
    expect(safeRpcEndpoint("https://mainnet.helius-rpc.com/?api-key=secret123")).toContain("REDACTED");
    expect(safeRpcEndpoint("https://api.mainnet-beta.solana.com")).toBe("https://api.mainnet-beta.solana.com/");
    expect(safeRpcEndpoint("https://rpc.example/?api-key=s3cr3t")).not.toContain("s3cr3t");
  });
});

describe("tenant visibility", () => {
  test("venture detail filters to PUBLIC", () => {
    expect(src("src/app/api/v1/ventures/[slug]/route.ts")).toContain('where: { slug, visibility: "PUBLIC" }');
    expect(src("src/app/api/v1/research/runs/route.ts")).toContain('visibility: "PUBLIC" }');
    const sub = src("src/app/api/v1/ventures/[slug]/[sub]/route.ts");
    expect(sub).toContain('where: { slug, visibility: "PUBLIC" }');
    expect(sub).toContain(".strict()");
  });
});

describe("public content polish", () => {
  test("marketing copy has no double-encoded dashes", () => {
    const copy = src("src/components/fs/marketing/page.tsx");
    expect(copy).not.toContain("â€”");
    expect(copy).not.toContain("â€“");
    expect(copy).toContain("—");
  });

  test("no placeholder .example addresses on public pages", () => {
    expect(src("src/components/fs/marketing/page.tsx")).not.toContain("@foundrysignal.example");
  });

  test("/auth?mode=login reaches the login form state", () => {
    expect(pathToSection("/auth", "?mode=login")?.params.mode).toBe("login");
    expect(pathToSection("/auth", "?mode=register")?.params.mode).toBe("register");
  });

  test("robots keeps the trading surface out of the index", () => {
    expect(robots().rules[0].disallow).toContain("/trade");
  });
});
