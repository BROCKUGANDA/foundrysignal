// Server-side Lana contract tests. No live calls: each request costs 2,000+
// Helius credits, so validation and wire-shape guards are tested offline.
import { describe, test, expect } from "bun:test";
import {
  buildLanaWireBody,
  lanaErrorForStatus,
  lanaRequestSchema,
  LANA_CREDITS,
} from "@/lib/providers/lana";

const base = {
  model: "lana-fast" as const,
  messages: [{ role: "user" as const, content: "What is the current price of SOL?" }],
};

describe("Lana server-side request contract", () => {
  test("defaults to lana-fast, streaming off, and forces read_only upstream", () => {
    const parsed = lanaRequestSchema.parse(base);
    const wire = buildLanaWireBody(parsed) as { model: string; stream: boolean; extensions: Record<string, unknown> };
    expect(wire.model).toBe("lana-fast");
    expect(wire.stream).toBe(false);
    expect(wire.extensions.read_only).toBe(true);
    expect(JSON.stringify(wire)).not.toContain("HELIUS");
    expect(LANA_CREDITS["lana-fast"]).toBe(2_000);
    expect(LANA_CREDITS["lana-thinking"]).toBe(10_000);
  });

  test("rejects unknown fields (upstream does the same)", () => {
    expect(lanaRequestSchema.safeParse({ ...base, tools: [] }).success).toBe(false);
    expect(lanaRequestSchema.safeParse({ ...base, extensions: { read_only: false } }).success).toBe(false);
  });

  test("requires a trailing user message and bounded content", () => {
    expect(lanaRequestSchema.safeParse({ messages: [{ role: "assistant", content: "hi" }] }).success).toBe(false);
    expect(lanaRequestSchema.safeParse({ messages: [{ role: "user", content: "" }] }).success).toBe(false);
    expect(lanaRequestSchema.safeParse({ messages: [{ role: "user", content: "x".repeat(10_001) }] }).success).toBe(false);
  });

  test("bounds max_tokens to the documented maximum", () => {
    expect(lanaRequestSchema.safeParse({ ...base, max_tokens: 8_192 }).success).toBe(true);
    expect(lanaRequestSchema.safeParse({ ...base, max_tokens: 9_000 }).success).toBe(false);
  });

  test("requires wallet when address_kind is supplied", () => {
    expect(
      lanaRequestSchema.safeParse({ ...base, extensions: { user_context: { address_kind: "wallet" } } }).success
    ).toBe(false);
    expect(
      lanaRequestSchema.safeParse({
        ...base,
        extensions: { user_context: { wallet: "11111111111111111111111111111111", address_kind: "wallet" } },
      }).success
    ).toBe(true);
  });

  test("maps upstream failures without echoing provider internals", () => {
    expect(lanaErrorForStatus(400).code).toBe("BAD_REQUEST");
    expect(lanaErrorForStatus(401).code).toBe("CONFIGURATION_REQUIRED");
    expect(lanaErrorForStatus(403).code).toBe("FORBIDDEN");
    const limited = lanaErrorForStatus(429, "5");
    expect(limited.code).toBe("RATE_LIMITED");
    expect(limited.retryable).toBe(true);
    expect(limited.details).toEqual({ retryAfterSeconds: 5 });
    expect(lanaErrorForStatus(503).code).toBe("PROVIDER_UNAVAILABLE");
  });
});
