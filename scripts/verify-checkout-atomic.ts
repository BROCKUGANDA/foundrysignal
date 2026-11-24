import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "checkout-atomic-postgres");
assert.equal(url.pathname, "/checkout_atomic_validation");
assert.equal(url.username, "checkout_test");
assert.equal(process.env.CHECKOUT_ATOMIC_ISOLATED, "yes");

const { db } = await import("../src/lib/db");
const { verifyCheckoutIntent } = await import("../src/lib/domain/billing/crypto");
const destination = "FzTU9xbifKJUKfigi7LvAsmm3vCtxSLcw9SuPrAoY6Uq";
const mint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const signature = "1".repeat(64);
const day = 86_400_000;
let memo = "";
let scans = 0;
let gate: { count: number; release: () => void; promise: Promise<void> } | undefined;
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (request: RequestInfo | URL, init?: RequestInit) => {
  const requestMemo = memo;
  const body = JSON.parse(typeof init?.body === "string" ? init.body : await (request as Request).text());
  assert.ok(["getSignaturesForAddress", "getTransaction"].includes(body.method), "RPC must be read-only");
  if (body.method === "getSignaturesForAddress") {
    scans++;
    if (gate) {
      const current = gate;
      if (--current.count === 0) current.release();
      await current.promise;
    }
  }
  const result = body.method === "getSignaturesForAddress" ? [{ signature, slot: 1, err: null, memo: requestMemo, blockTime: 1700000000, confirmationStatus: "confirmed" }] : {
    slot: 1, blockTime: 1700000000, version: "legacy",
    transaction: { signatures: [signature], message: { accountKeys: [], recentBlockhash: "1".repeat(32), instructions: [{ program: "spl-memo", programId: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr", parsed: requestMemo }] } },
    meta: { err: null, fee: 5000, preBalances: [], postBalances: [], preTokenBalances: [], postTokenBalances: [{ accountIndex: 0, mint, owner: destination, uiTokenAmount: { amount: "39000000", decimals: 6, uiAmount: 39, uiAmountString: "39" } }] },
  };
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }), { headers: { "content-type": "application/json" } });
}) as typeof fetch;

let passed = 0;
async function check(name: string, run: () => Promise<void>) {
  await run();
  passed++;
  console.log(`PASS ${passed}: ${name}`);
}

try {
  console.log(JSON.stringify(await db.$queryRaw`SELECT version(), current_database()`));
  const id = randomUUID();
  const user = await db.user.create({ data: { email: `${id}@example.invalid`, emailHash: id, passwordHash: "not-a-real-password" } });
  const workspace = await db.workspace.create({ data: { name: "Atomic validation", slug: id } });
  const plan = await db.plan.create({ data: { code: `TEST-${id}`, name: "Validation", monthlyPriceMicros: 39_000_000, entitlementsJson: "{}" } });
  const baseline = new Date(Date.now() + 10 * day);
  const subscription = await db.subscription.create({ data: { workspaceId: workspace.id, planId: plan.id, provider: "usdc", providerRef: id, status: "ACTIVE", currentPeriodEnd: baseline } });
  async function intent() {
    return db.cryptoPaymentIntent.create({ data: { workspaceId: workspace.id, userId: user.id, planCode: plan.code, amountBaseUnits: 39_000_000, mint, destination, memo: `FS-${randomUUID()}`, expiresAt: new Date(Date.now() + day) } });
  }
  const verify = (value: { memo: string }) => verifyCheckoutIntent({ workspaceId: workspace.id, userId: user.id, memo: value.memo });
  const end = async () => (await db.subscription.findUniqueOrThrow({ where: { id: subscription.id } })).currentPeriodEnd!.getTime();
  await check("same intent concurrent verification grants exactly one period", async () => {
    const value = await intent(); memo = value.memo;
    let release!: () => void;
    gate = { count: 2, promise: new Promise<void>((resolve) => { release = resolve; }), release: () => release() };
    try { assert.ok((await Promise.all([verify(value), verify(value)])).every((result) => result.status === "CONFIRMED")); }
    finally { gate = undefined; }
    assert.equal(await end(), baseline.getTime() + 30 * day);
    assert.equal(await db.subscription.count({ where: { workspaceId: workspace.id } }), 1);
    await check("already-confirmed verification performs no chain scan", async () => {
      const before = scans; await verify(value); assert.equal(scans, before);
      assert.equal(await end(), baseline.getTime() + 30 * day);
    });
  });
  await check("distinct concurrent renewals preserve both periods", async () => {
    const values = await Promise.all([intent(), intent()]);
    // Bind each concurrent read-only RPC proof to its own intent memo.
    const { AsyncLocalStorage } = await import("node:async_hooks");
    const context = new AsyncLocalStorage<string>();
    const fetch = globalThis.fetch;
    globalThis.fetch = (async (...args: Parameters<typeof fetch>) => { memo = context.getStore()!; return fetch(...args); }) as typeof fetch;
    let release!: () => void;
    gate = { count: 2, promise: new Promise<void>((resolve) => { release = resolve; }), release: () => release() };
    try { assert.ok((await Promise.all(values.map((value) => context.run(value.memo, () => verify(value))))).every((result) => result.status === "CONFIRMED")); }
    finally { gate = undefined; globalThis.fetch = fetch; }
    assert.equal(await end(), baseline.getTime() + 90 * day);
  });
  for (const table of ["CryptoPaymentIntent", "Subscription"]) {
    await check(`real PostgreSQL ${table} write failure rolls back intent and entitlement`, async () => {
      const value = await intent(); memo = value.memo;
      const before = await end();
      await db.$executeRawUnsafe(`CREATE FUNCTION checkout_validation_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected checkout write failure'; END $$`);
      await db.$executeRawUnsafe(`CREATE TRIGGER checkout_validation_failure BEFORE UPDATE ON "${table}" FOR EACH ROW EXECUTE FUNCTION checkout_validation_fail()`);
      try { await assert.rejects(verify(value), /injected checkout write failure/); }
      finally {
        await db.$executeRawUnsafe(`DROP TRIGGER checkout_validation_failure ON "${table}"`);
        await db.$executeRawUnsafe("DROP FUNCTION checkout_validation_fail()");
      }
      assert.equal((await db.cryptoPaymentIntent.findUniqueOrThrow({ where: { id: value.id } })).status, "PENDING");
      assert.equal(await end(), before);
    });
  }
  await check("inactive plan fails closed", async () => {
    const value = await intent(); memo = value.memo; const before = await end();
    await db.plan.update({ where: { id: plan.id }, data: { active: false } });
    await assert.rejects(verify(value), /Unknown plan/);
    assert.equal((await db.cryptoPaymentIntent.findUniqueOrThrow({ where: { id: value.id } })).status, "PENDING");
    assert.equal(await end(), before);
  });
  console.log(JSON.stringify({ passed, failed: 0, scans, intents: await db.cryptoPaymentIntent.count(), confirmed: await db.cryptoPaymentIntent.count({ where: { status: "CONFIRMED" } }), subscriptions: await db.subscription.count() }));
} finally {
  globalThis.fetch = originalFetch;
  await db.$disconnect();
}