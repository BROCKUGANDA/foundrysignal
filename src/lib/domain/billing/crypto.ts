// USDC checkout — Solana-native subscription payment.
//
// The product's payments are onchain, so checkout settles in USDC on Solana
// instead of routing card details through a fiat processor. Flow:
//
//   1. client requests a payment intent for a plan  -> destination + memo + exact amount
//   2. payer sends USDC to that destination including the memo
//   3. client (or a watcher) asks to verify        -> server reads the chain and,
//      on a matching transfer, idempotently grants the subscription entitlement
//
// No payment state is ever simulated: without a destination wallet configured
// the surface reports CONFIGURATION_REQUIRED with the exact missing env name.

import { randomUUID } from "crypto";
import { createSolanaRpc, address } from "@solana/kit";
import { db } from "@/lib/db";
import { ApiHttpError } from "@/lib/contracts/http";
import { recordAudit } from "@/lib/domain/shared/audit";
import { ensurePlans } from "./plans";

export const BILLING_PROVIDER = "usdc";

/** Solana USDC (SC mint) — the settlement asset for checkout. */
export const DEFAULT_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const MEMO_PREFIX = "FS";
const INTENT_TTL_MINUTES = 30;
const SIGNATURE_SCAN_LIMIT = 25;

export interface CheckoutConfigStatus {
  provider: string;
  configured: boolean;
  checkoutReady: boolean;
  mint: string;
  destination: string | null;
  missingEnv: string[];
}

function destinationWallet(): string | undefined {
  return process.env.PAYOUT_WALLET?.trim() || undefined;
}

export function usdcMint(): string {
  return process.env.USDC_MINT?.trim() || DEFAULT_USDC_MINT;
}

/**
 * Configuration state. `PAYOUT_WALLET` is the only required variable: it is
 * the platform wallet that receives subscriptions. `USDC_MINT` defaults to
 * native Solana USDC.
 */
export function getCheckoutConfig(): CheckoutConfigStatus {
  const destination = destinationWallet();
  const missingEnv: string[] = [];
  if (!destination) missingEnv.push("PAYOUT_WALLET");
  return {
    provider: BILLING_PROVIDER,
    configured: !!destination,
    checkoutReady: !!destination,
    mint: usdcMint(),
    destination: destination ?? null,
    missingEnv,
  };
}

/**
 * USD micros -> USDC base units. USDC has 6 decimals and is 1:1 with USD, so
 * the integer value is unchanged; this function exists so the unit conversion
 * is stated once instead of being implied at every call site.
 */
export function usdMicrosToUsdcBaseUnits(usdMicros: number): number {
  return usdMicros;
}

/** Human-readable amount for display ("39.00"). */
export function baseUnitsToDisplay(baseUnits: number, decimals = 6): string {
  return (baseUnits / 10 ** decimals).toFixed(decimals);
}

/** Stable memo that binds an onchain transfer to exactly one intent. */
export function buildMemo(id: string): string {
  return `${MEMO_PREFIX}-${id.slice(-12)}`;
}

function rpcUrl(): string {
  return process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
}

async function loadPlan(planCode: string) {
  await ensurePlans();
  const plan = await db.plan.findFirst({ where: { code: planCode, active: true } });
  if (!plan) throw new ApiHttpError("NOT_FOUND", `Unknown plan: ${planCode}`, false);
  if (plan.monthlyPriceMicros < 0) {
    throw new ApiHttpError("VALIDATION_FAILED", `${plan.code} is quoted by sales — no self-serve checkout.`, false);
  }
  return plan;
}

export interface CreatedIntent {
  memo: string;
  destination: string;
  mint: string;
  amountBaseUnits: number;
  amountDisplay: string;
  planCode: string;
  expiresAt: string;
  status: string;
}

/** Creates a payment intent. One intent per request; reuse is handled by memo uniqueness. */
export async function createCheckoutIntent(input: {
  workspaceId: string;
  userId: string;
  planCode: string;
}): Promise<CreatedIntent> {
  const config = getCheckoutConfig();
  if (!config.configured) {
    throw new ApiHttpError(
      "CONFIGURATION_REQUIRED",
      `USDC checkout is not configured. Set: ${config.missingEnv.join(", ")}`,
      false
    );
  }

  const plan = await loadPlan(input.planCode);
  const amount = usdMicrosToUsdcBaseUnits(plan.monthlyPriceMicros);

  const intent = await db.cryptoPaymentIntent.create({
    data: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      planCode: plan.code,
      amountBaseUnits: amount,
      mint: config.mint,
      destination: config.destination as string,
      memo: buildMemo(randomUUID()),
      expiresAt: new Date(Date.now() + INTENT_TTL_MINUTES * 60 * 1000),
    },
  });

  await recordAudit({
    actorId: input.userId,
    action: "CHECKOUT_INTENT_CREATED",
    targetType: "WORKSPACE",
    targetId: input.workspaceId,
    summary: `USDC checkout intent for ${plan.code} (${baseUnitsToDisplay(amount)} USDC)`,
    metadata: { memo: intent.memo, destination: intent.destination },
  });

  return {
    memo: intent.memo,
    destination: intent.destination,
    mint: intent.mint,
    amountBaseUnits: intent.amountBaseUnits,
    amountDisplay: baseUnitsToDisplay(intent.amountBaseUnits),
    planCode: plan.code,
    expiresAt: intent.expiresAt.toISOString(),
    status: intent.status,
  };
}

interface ScanResult {
  signature: string;
  amountBaseUnits: number;
}

interface TokenBalanceLike {
  mint: string;
  owner?: string | null;
  uiTokenAmount: { amount: string };
}

/** Sums the USDC credited to `destination` by a parsed transaction. */
function usdcReceived(
  tx: {
    meta: {
      preTokenBalances?: readonly TokenBalanceLike[] | null;
      postTokenBalances?: readonly TokenBalanceLike[] | null;
    } | null;
  },
  mint: string,
  destination: string,
): number {
  const delta = (balances: readonly TokenBalanceLike[] | null | undefined) =>
    (balances ?? [])
      .filter((b) => b.mint === mint && b.owner === destination)
      .reduce((sum, b) => sum + Number(b.uiTokenAmount.amount), 0);
  return delta(tx.meta?.postTokenBalances) - delta(tx.meta?.preTokenBalances);
}

/**
 * Scans recent transactions paying the destination for one whose memo matches
 * the intent and whose USDC credit meets the amount. The signature list's
 * `memo` field does the cheap first pass; the transaction read confirms the
 * token movement so a memo alone can never grant an entitlement.
 */
export async function scanForPayment(input: {
  mint: string;
  destination: string;
  memo: string;
  minAmountBaseUnits: number;
}): Promise<ScanResult | null> {
  const rpc = createSolanaRpc(rpcUrl());
  const signatures = await rpc
    .getSignaturesForAddress(address(input.destination), { limit: SIGNATURE_SCAN_LIMIT })
    .send();

  for (const sig of signatures) {
    if (!sig.memo || !sig.memo.includes(input.memo)) continue;
    const tx = await rpc
      .getTransaction(sig.signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" })
      .send();
    if (!tx) continue;
    const received = usdcReceived(tx, input.mint, input.destination);
    if (received >= input.minAmountBaseUnits) {
      return { signature: sig.signature, amountBaseUnits: received };
    }
  }
  return null;
}

export interface VerificationResult {
  status: string;
  memo: string;
  planCode: string | null;
  signature: string | null;
  confirmedAt: string | null;
  expiresAt: string;
  note: string;
}

/**
 * Verifies an intent against the chain and, on success, idempotently records
 * the subscription entitlement. Safe to call repeatedly: a CONFIRMED intent
 * short-circuits before any chain read.
 */
export async function verifyCheckoutIntent(input: {
  workspaceId: string;
  userId: string;
  memo: string;
}): Promise<VerificationResult> {
  const intent = await db.cryptoPaymentIntent.findFirst({
    where: { memo: input.memo, workspaceId: input.workspaceId },
  });
  if (!intent) throw new ApiHttpError("NOT_FOUND", "Unknown payment intent.", false);

  if (intent.status === "CONFIRMED") {
    return {
      status: intent.status,
      memo: intent.memo,
      planCode: intent.planCode,
      signature: intent.providerRef,
      confirmedAt: intent.confirmedAt?.toISOString() ?? null,
      expiresAt: intent.expiresAt.toISOString(),
      note: "Payment already confirmed.",
    };
  }

  if (intent.expiresAt.getTime() < Date.now()) {
    await db.cryptoPaymentIntent.update({ where: { id: intent.id }, data: { status: "EXPIRED" } });
    return {
      status: "EXPIRED",
      memo: intent.memo,
      planCode: intent.planCode,
      signature: null,
      confirmedAt: null,
      expiresAt: intent.expiresAt.toISOString(),
      note: "Payment window elapsed before a matching transfer was observed.",
    };
  }

  const payment = await scanForPayment({
    mint: intent.mint,
    destination: intent.destination,
    memo: intent.memo,
    minAmountBaseUnits: intent.amountBaseUnits,
  });

  if (!payment) {
    return {
      status: intent.status,
      memo: intent.memo,
      planCode: intent.planCode,
      signature: null,
      confirmedAt: null,
      expiresAt: intent.expiresAt.toISOString(),
      note: "No matching USDC transfer found yet. Keep this memo in the payment.",
    };
  }

  const plan = await db.plan.findFirst({ where: { code: intent.planCode, active: true } });
  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  // Idempotent entitlement: (provider, providerRef) is unique, so a retry or a
  // second verification cannot double-grant.
  if (plan) {
    await db.subscription.upsert({
      where: { provider_providerRef: { provider: BILLING_PROVIDER, providerRef: intent.memo } },
      create: {
        workspaceId: intent.workspaceId,
        planId: plan.id,
        status: "ACTIVE",
        provider: BILLING_PROVIDER,
        providerRef: intent.memo,
        currentPeriodEnd: periodEnd,
      },
      update: { status: "ACTIVE", currentPeriodEnd: periodEnd, cancelAtPeriodEnd: false },
    });
  }

  const updated = await db.cryptoPaymentIntent.update({
    where: { id: intent.id },
    data: { status: "CONFIRMED", providerRef: payment.signature, confirmedAt: new Date() },
  });

  await recordAudit({
    actorId: input.userId,
    action: "CHECKOUT_CONFIRMED",
    targetType: "WORKSPACE",
    targetId: intent.workspaceId,
    summary: `USDC payment confirmed for ${intent.planCode} (${payment.signature})`,
    metadata: { memo: intent.memo, signature: payment.signature },
  });

  return {
    status: updated.status,
    memo: updated.memo,
    planCode: updated.planCode,
    signature: payment.signature,
    confirmedAt: updated.confirmedAt?.toISOString() ?? null,
    expiresAt: updated.expiresAt.toISOString(),
    note: "Payment confirmed onchain; subscription active.",
  };
}
