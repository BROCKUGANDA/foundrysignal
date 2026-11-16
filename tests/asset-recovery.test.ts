// Guards the stale-deployment recovery path: cached HTML that points at chunk
// hashes removed by a redeploy must self-heal, but never in an endless loop.
import { describe, test, expect } from "bun:test";
import {
  ASSET_RECOVERY_BOOTSTRAP,
  recoveryUrl,
} from "../src/components/fs/asset-recovery";

describe("asset recovery bootstrap", () => {
  test("only reacts to Next static script failures", () => {
    expect(ASSET_RECOVERY_BOOTSTRAP).toContain('el.tagName!=="SCRIPT"');
    expect(ASSET_RECOVERY_BOOTSTRAP).toContain('"/_next/static/"');
  });

  test("bounds retries to two attempts per two-minute window", () => {
    expect(ASSET_RECOVERY_BOOTSTRAP).toContain("s.n>=2");
    expect(ASSET_RECOVERY_BOOTSTRAP).toContain("120000");
  });

  test("cache-busted retry preserves path and existing query", () => {
    const url = recoveryUrl("https://example.test/markets?q=solana");
    expect(url).toContain("/markets?q=solana");
    expect(url).toContain("__fs_recovery=");
  });
});
