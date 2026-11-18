// USDC checkout — configuration gating, unit math and intent creation.
// Chain verification is exercised against mainnet separately; these tests
// pin the properties that must hold without network access.
import { describe, test, expect, afterEach } from "bun:test";
import { db } from "@/lib/db";
import {
  getCheckoutConfig,
  usdMicrosToUsdcBaseUnits,
  baseUnitsToDisplay,
  buildMemo,
  createCheckoutIntent,
} from "@/lib/domain/billing/crypto";

const ORIGINAL_PAYOUT = process.env.PAYOUT_WALLET;

afterEach(async () => {
  if (ORIGINAL_PAYOUT === undefined) delete process.env.PAYOUT_WALLET;
  else process.env.PAYOUT_WALLET = ORIGINAL_PAYOUT;
  await db.cryptoPaymentIntent.deleteMany({ where: { memo: { startsWith: "FS-" } } });
});

describe("checkout configuration", () => {
  test("requires PAYOUT_WALLET and never simulates a configured provider", () => {
    delete process.env.PAYOUT_WALLET;
    const config = getCheckoutConfig();
    expect(config.configured).toBe(false);
    expect(config.checkoutReady).toBe(false);
    expect(config.missingEnv).toContain("PAYOUT_WALLET");
  });

  test("configured once the destination wallet is set", () => {
    process.env.PAYOUT_WALLET = "HQnBm9xZnuTQhS7EniLvUqHZcXGhGdLLRiBELkNqxVsv";
    const config = getCheckoutConfig();
    expect(config.configured).toBe(true);
    expect(config.provider).toBe("usdc");
    expect(config.mint).toBe("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  });
});

describe("amount math", () => {
  test("USD micros map 1:1 to USDC base units", () => {
    expect(usdMicrosToUsdcBaseUnits(39_000_000)).toBe(39_000_000);
    expect(baseUnitsToDisplay(39_000_000)).toBe("39.000000");
    expect(baseUnitsToDisplay(0)).toBe("0.000000");
  });
});

describe("intent creation", () => {
  test("memo is prefixed and derived from the intent id", () => {
    const memo = buildMemo("clxabcdefghijklmnop");
    expect(memo).toMatch(/^FS-[a-z0-9]{12}$/);
  });

  test("creates a priced intent for a real plan", async () => {
    process.env.PAYOUT_WALLET = "HQnBm9xZnuTQhS7EniLvUqHZcXGhGdLLRiBELkNqxVsv";
    const intent = await createCheckoutIntent({
      workspaceId: `test-ws-${Date.now()}`,
      userId: "test-user",
      planCode: "RESEARCHER",
    });
    expect(intent.amountBaseUnits).toBe(39_000_000);
    expect(intent.amountDisplay).toBe("39.000000");
    expect(intent.planCode).toBe("RESEARCHER");
    expect(intent.status).toBe("PENDING");
    expect(intent.expiresAt).toBeTruthy();
    // 30-minute intent TTL claimed by the checkout flow
    const ttlMs = new Date(intent.expiresAt).getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(29 * 60 * 1000);
    expect(ttlMs).toBeLessThanOrEqual(30 * 60 * 1000);
  });

  test("refuses enterprise self-checkout (quoted by sales)", async () => {
    process.env.PAYOUT_WALLET = "HQnBm9xZnuTQhS7EniLvUqHZcXGhGdLLRiBELkNqxVsv";
    await expect(
      createCheckoutIntent({ workspaceId: `test-ws-${Date.now()}`, userId: "test-user", planCode: "ENTERPRISE" })
    ).rejects.toThrow(/quoted by sales/);
  });

  test("refuses checkout when unconfigured", async () => {
    delete process.env.PAYOUT_WALLET;
    await expect(
      createCheckoutIntent({ workspaceId: `test-ws-${Date.now()}`, userId: "test-user", planCode: "RESEARCHER" })
    ).rejects.toThrow(/CONFIGURATION|not configured/i);
  });
});
