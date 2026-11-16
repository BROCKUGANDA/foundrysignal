import { handler, ok, ApiHttpError } from "@/lib/contracts/http";
import { requireAuth } from "@/lib/auth/context";
import { JupiterAdapter } from "@/lib/providers/jupiter";
import { isValidSolanaAddress } from "@/lib/providers/solana";
import { z } from "zod";

const bodySchema = z.object({
  inputMint: z.string().min(32).max(64),
  outputMint: z.string().min(32).max(64),
  amount: z.string().regex(/^\d+$/, "amount must be a raw integer string").max(30),
  slippageBps: z.number().int().min(0).max(3000).default(50),
  user: z.string().min(32).max(64), // caller's wallet pubkey (base58) — signing is client-side only
});

/** Build a Jupiter unsigned swap transaction (client wallet signs off-device). */
export const POST = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();
  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiHttpError("BAD_REQUEST", "expected inputMint, outputMint, amount, slippageBps", false);
  }
  const { inputMint, outputMint, amount, slippageBps, user } = parsed.data;
  if (!isValidSolanaAddress(inputMint) || !isValidSolanaAddress(outputMint)) {
    throw new ApiHttpError("BAD_REQUEST", "inputMint and outputMint must be valid Solana addresses.", false);
  }
  if (inputMint === outputMint) {
    throw new ApiHttpError("BAD_REQUEST", "inputMint and outputMint must differ.", false);
  }
  const jup = new JupiterAdapter();
  const res = await jup.createSwapOrder({ inputMint, outputMint, amount, slippageBps, user });
  if (!res.orderId || !res.transactionBase64) {
    throw new ApiHttpError("PROVIDER_UNAVAILABLE", "Jupiter order creation returned no unsigned transaction.", true);
  }
  return { payload: ok({ orderId: res.orderId, inAmount: res.inAmount, outAmount: res.outAmount, transactionBase64: String(res.transactionBase64), raw: res.raw }, requestId) };
});
