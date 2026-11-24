import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { scanForPayment } from "@/lib/domain/billing/crypto";

const destination = "FzTU9xbifKJUKfigi7LvAsmm3vCtxSLcw9SuPrAoY6Uq";
const mint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const memo = "FS-123456abcdef";
const memoProgram = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const signature = "1".repeat(64);
const input = { destination, mint, memo, minAmountBaseUnits: 39_000_000 };
let restore: (() => void) | undefined;
afterEach(() => { restore?.(); restore = undefined; });

function chain(options: { failed?: boolean; transactionFailed?: boolean; memos?: string[]; credit?: string; preCredit?: string; tokenMint?: string; owner?: string; programId?: string; processed?: boolean } = {}) {
  const fetch = spyOn(globalThis, "fetch").mockImplementation(async (request, init) => {
    const body = JSON.parse(typeof init?.body === "string" ? init.body : await (request as Request).text());
    const result = body.method === "getSignaturesForAddress" ? [{ signature, slot: 1, err: options.failed ? { InstructionError: [0, "InvalidArgument"] } : null, memo: `[15] ${memo}`, blockTime: 1700000000, confirmationStatus: options.processed ? "processed" : "confirmed" }] : {
      slot: 1, blockTime: 1700000000, version: "legacy",
      transaction: { signatures: [signature], message: { accountKeys: [], recentBlockhash: "1".repeat(32), instructions: (options.memos ?? [memo]).map((parsed) => ({ program: "spl-memo", programId: options.programId ?? memoProgram, parsed })) } },
      meta: { err: options.failed || options.transactionFailed ? { InstructionError: [0, "InvalidArgument"] } : null, fee: 5000, preBalances: [], postBalances: [],
        preTokenBalances: options.preCredit ? [{ accountIndex: 0, mint, owner: destination, uiTokenAmount: { amount: options.preCredit, decimals: 6, uiAmount: null, uiAmountString: "0" } }] : [], postTokenBalances: [{ accountIndex: 0, mint: options.tokenMint ?? mint, owner: options.owner ?? destination, uiTokenAmount: { amount: options.credit ?? "39000000", decimals: 6, uiAmount: 39, uiAmountString: "39" } }],
      },
    };
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }), { headers: { "content-type": "application/json" } });
  });
  restore = () => fetch.mockRestore();
}

describe("checkout transaction proof", () => {
  test("accepts a successful exact-memo USDC credit to the intended wallet", async () => {
    chain();
    expect(await scanForPayment(input)).toMatchObject({ signature, amountBaseUnits: 39_000_000 });
  });
  test("rejects failed transactions even when the RPC balance payload shows a credit", async () => {
    chain({ failed: true });
    expect(await scanForPayment(input)).toBeNull();
  });
  test("rejects a signature-list memo when the transaction itself has a different memo", async () => {
    chain({ memos: ["FS-other-intent"] });
    expect(await scanForPayment(input)).toBeNull();
  });
  test("rejects multiple checkout memos that could reuse one credit for two intents", async () => {
    chain({ memos: [memo, "FS-other-intent"] });
    expect(await scanForPayment(input)).toBeNull();
  });
  test("rejects wrong mint, wrong destination, and underpayment", async () => {
    for (const options of [{ tokenMint: "wrong" }, { owner: "wrong" }, { credit: "38999999" }]) {
      chain(options);
      expect(await scanForPayment(input)).toBeNull();
      restore?.();
    }
  });
  test("rejects processed signatures, failed transaction metadata, and spoofed memo programs", async () => {
    for (const options of [{ processed: true }, { transactionFailed: true }, { programId: destination }, { memos: [] }]) {
      chain(options);
      expect(await scanForPayment(input)).toBeNull();
      restore?.();
    }
  });
  test("uses integer-precise deltas even when wallet balances exceed Number precision", async () => {
    chain({ preCredit: "9007199254740993", credit: "9007199293740992" });
    expect(await scanForPayment(input)).toBeNull();
  });
  test("rejects invalid payment amounts and malformed chain balance amounts", async () => {
    await expect(scanForPayment({ ...input, minAmountBaseUnits: 0 })).rejects.toThrow(/positive safe integer/);
    chain({ credit: "3.9e7" });
    expect(await scanForPayment(input)).toBeNull();
  });
});