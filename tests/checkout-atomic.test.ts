import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import type { PrismaClient } from "@prisma/client";

const unexpected = () => { throw new Error("Unexpected database boundary call"); };
const db = {
  cryptoPaymentIntent: { findFirst: unexpected, update: unexpected, updateMany: unexpected },
  plan: { findFirst: unexpected },
  subscription: { findFirst: unexpected, upsert: unexpected, create: unexpected, update: unexpected },
  auditEvent: { create: unexpected },
  $queryRaw: unexpected, $transaction: unexpected,
} as unknown as PrismaClient;
mock.module("@/lib/db", () => ({ db }));
const { verifyCheckoutIntent } = await import("@/lib/domain/billing/crypto");

// Boundary tests only: no database connections, no claim of PostgreSQL isolation proof.
const memo = "FS-atomic-test";
const signature = "1".repeat(64);
const destination = "FzTU9xbifKJUKfigi7LvAsmm3vCtxSLcw9SuPrAoY6Uq";
const mint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const input = { workspaceId: "workspace", userId: "user", memo };
const intent = { id: "intent", ...input, planCode: "RESEARCHER", amountBaseUnits: 39_000_000,
  mint, destination, status: "PENDING", provider: "usdc", providerRef: null,
  expiresAt: new Date(Date.now() + 600_000), confirmedAt: null, createdAt: new Date() };
const restores: (() => void)[] = [];
let inTransaction = false;
let writes = 0;
let attempts = 0;
let conflicts = 0;
let missingPlan = false;
let claimCount = 1;
let confirmedOnRecheck = false;
let failClaim = false;
let failSubscription = true;
let commitFailure = false;
let periodEnd: Date | null = null;
let writtenPeriodEnd: unknown;
let rawConflict = false;

beforeEach(() => {
  inTransaction = false; writes = 0; attempts = 0; conflicts = 0;
  missingPlan = false; claimCount = 1; confirmedOnRecheck = false; failClaim = false;
  failSubscription = true; commitFailure = false; periodEnd = null; writtenPeriodEnd = undefined; rawConflict = false;
  const reads = spyOn(db.cryptoPaymentIntent, "findFirst").mockImplementation(async () =>
    ({ ...intent, ...(inTransaction && confirmedOnRecheck ? { status: "CONFIRMED", providerRef: signature, confirmedAt: new Date() } : {}) }));
  const plan = spyOn(db.plan, "findFirst").mockImplementation(async () => missingPlan ? null :
    ({ id: "plan", code: "RESEARCHER", name: "Researcher", monthlyPriceMicros: 39_000_000, currency: "USD", entitlementsJson: "{}", active: true, sort: 0 }));
  const existing = spyOn(db.subscription, "findFirst").mockImplementation(async () => periodEnd ? ({
    id: "subscription", workspaceId: input.workspaceId, planId: "old-plan", status: "ACTIVE", provider: "usdc",
    providerRef: "old-intent", currentPeriodEnd: periodEnd, cancelAtPeriodEnd: true, createdAt: new Date(), updatedAt: new Date(),
  }) : null);
  const upsert = spyOn(db.subscription, "upsert").mockImplementation(async () => {
    expect(inTransaction).toBe(true); writes++; throw new Error("subscription write failed");
  });
  const create = spyOn(db.subscription, "create").mockImplementation(async (args) => {
    expect(inTransaction).toBe(true); writes++;
    writtenPeriodEnd = args.data.currentPeriodEnd;
    if (failSubscription) throw new Error("subscription write failed");
    return { ...args.data, id: "subscription" } as never;
  });
  const renew = spyOn(db.subscription, "update").mockImplementation(async (args) => {
    expect(inTransaction).toBe(true); writes++;
    expect(args.data).toMatchObject({ status: "ACTIVE", planId: "plan", cancelAtPeriodEnd: false });
    writtenPeriodEnd = args.data.currentPeriodEnd;
    if (failSubscription) throw new Error("subscription write failed");
    return { ...args.data, id: "subscription" } as never;
  });
  const update = spyOn(db.cryptoPaymentIntent, "update").mockImplementation(async () => { throw new Error("unconditional intent write"); });
  const claim = spyOn(db.cryptoPaymentIntent, "updateMany").mockImplementation(async (args) => {
    expect(inTransaction).toBe(true);
    expect(args?.where).toMatchObject({ id: intent.id, status: "PENDING" });
    if (failClaim) throw new Error("claim write failed");
    return { count: claimCount };
  });
  const lock = spyOn(db, "$queryRaw").mockImplementation(async (sql, ...values) => {
    expect(inTransaction).toBe(true);
    expect(String.raw(sql as TemplateStringsArray, ...values)).toContain('FROM "Workspace"');
    expect(String.raw(sql as TemplateStringsArray, ...values)).toContain("FOR UPDATE");
    expect(values).toEqual([input.workspaceId]);
    return [{ id: input.workspaceId }];
  });
  const transaction = spyOn(db, "$transaction").mockImplementation(async (callback, options) => {
    attempts++;
    expect(options).toMatchObject({ isolationLevel: "Serializable" });
    if (attempts <= conflicts) throw Object.assign(new Error("serialization conflict"), rawConflict ? { code: "P2010", meta: { code: "40001" } } : { code: "P2034" });
    inTransaction = true;
    try {
      const result = await (callback as (tx: typeof db) => Promise<unknown>)(db);
      if (commitFailure) throw new Error("commit failed");
      return result;
    }
    finally { inTransaction = false; }
  });
  const audit = spyOn(db.auditEvent, "create").mockImplementation(async () => {
    expect(inTransaction).toBe(false); expect(commitFailure).toBe(false);
    return {} as never;
  });
  const fetch = spyOn(globalThis, "fetch").mockImplementation(async (_request, init) => {
    const body = JSON.parse(String(init?.body));
    const result = body.method === "getSignaturesForAddress"
      ? [{ signature, slot: 1, err: null, memo, blockTime: 1700000000, confirmationStatus: "confirmed" }]
      : { slot: 1, blockTime: 1700000000, version: "legacy",
        transaction: { signatures: [signature], message: { accountKeys: [], recentBlockhash: "1".repeat(32), instructions: [{ program: "spl-memo", programId: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr", parsed: memo }] } },
        meta: { err: null, fee: 5000, preBalances: [], postBalances: [], preTokenBalances: [], postTokenBalances: [{ accountIndex: 0, mint, owner: destination, uiTokenAmount: { amount: "39000000", decimals: 6, uiAmount: 39, uiAmountString: "39" } }] } };
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }), { headers: { "content-type": "application/json" } });
  });
  for (const mock of [reads, plan, existing, upsert, create, renew, update, claim, lock, transaction, audit, fetch]) restores.push(() => mock.mockRestore());
});
afterEach(() => { restores.splice(0).reverse().forEach((restore) => restore()); });

test("subscription failure is inside a serializable transaction, never a partial standalone grant", async () => {
  await expect(verifyCheckoutIntent(input)).rejects.toThrow("subscription write failed");
  expect(attempts).toBe(1); expect(writes).toBe(1);
});
test("missing plan fails closed before entitlement writes", async () => {
  missingPlan = true;
  await expect(verifyCheckoutIntent(input)).rejects.toThrow(/plan/i);
  expect(writes).toBe(0);
});
test("failed intent claim cannot grant an entitlement", async () => {
  failClaim = true;
  await expect(verifyCheckoutIntent(input)).rejects.toThrow("claim write failed");
  expect(writes).toBe(0);
});
test("lost compare-and-swap cannot grant an entitlement", async () => {
  claimCount = 0;
  await expect(verifyCheckoutIntent(input)).rejects.toThrow();
  expect(writes).toBe(0);
});
test("confirmation discovered after chain scan does not renew again", async () => {
  confirmedOnRecheck = true;
  expect(await verifyCheckoutIntent(input)).toMatchObject({ status: "CONFIRMED", signature });
  expect(writes).toBe(0);
});
test("serialization conflicts retry with a bounded budget", async () => {
  conflicts = 10;
  await expect(verifyCheckoutIntent(input)).rejects.toThrow("serialization conflict");
  expect(attempts).toBe(4); expect(writes).toBe(0);
});
test("transient conflict retries settlement, not the chain transfer", async () => {
  conflicts = 1; confirmedOnRecheck = true;
  expect(await verifyCheckoutIntent(input)).toMatchObject({ status: "CONFIRMED" });
  expect(attempts).toBe(2); expect(writes).toBe(0);
});
test("renewal extends the existing future period by exactly thirty days", async () => {
  failSubscription = false;
  periodEnd = new Date(Date.now() + 10 * 86_400_000);
  expect(await verifyCheckoutIntent(input)).toMatchObject({ status: "CONFIRMED", signature });
  expect(writtenPeriodEnd).toEqual(new Date(periodEnd.getTime() + 30 * 86_400_000));
  expect(writes).toBe(1);
});
test("first settlement creates one entitlement and surfaces commit failure", async () => {
  failSubscription = false; commitFailure = true;
  await expect(verifyCheckoutIntent(input)).rejects.toThrow("commit failed");
  expect(attempts).toBe(1); expect(writes).toBe(1);
});
test("raw PostgreSQL serialization errors retry the entire unit", async () => {
  rawConflict = true; conflicts = 1; confirmedOnRecheck = true;
  expect(await verifyCheckoutIntent(input)).toMatchObject({ status: "CONFIRMED" });
  expect(attempts).toBe(2);
});