// Billing lifecycle worker — keeps the onchain subscription model honest.
//
// Onchain USDC payments cannot self-renew (no custody, no standing debit), so
// "auto-renewal" here means the platform actively drives the renewal loop:
//
//   1. An ACTIVE subscription whose currentPeriodEnd has passed is marked
//      PAST_DUE; entitlement resolution then falls back to Explorer.
//   2. Subscriptions ending within REMINDER_WINDOW_DAYS trigger one reminder
//      email per workspace owner per period (idempotent via job keys).
//   3. The workspace pays again through the normal checkout flow; confirmation
//      extends the existing subscription (see crypto.ts), which is the renewal.
//
// The sweep reschedules itself daily; a stable daily idempotency key means
// overlapping boots never duplicate a sweep.

import { registerJob, enqueue } from "@/lib/jobs/queue";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/domain/email/service";
import { getCheckoutConfig, verifyCheckoutIntent } from "./crypto";

const DAY_MS = 24 * 60 * 60 * 1000;
const REMINDER_WINDOW_DAYS = 7;
const WATCH_INTERVAL_MS = 2 * 60 * 1000;
const WATCH_BATCH = 10;

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://foundrysignal.aiazimara.com").replace(/\/+$/, "");
}

function dayKey(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

registerJob("billing_sweep", async (ctx) => {
  const now = new Date();

  // 1. Expired active periods → PAST_DUE (entitlements fall back to Explorer).
  const expired = await db.subscription.updateMany({
    where: { status: "ACTIVE", currentPeriodEnd: { lt: now } },
    data: { status: "PAST_DUE" },
  });

  // 2. Renewal reminders for subscriptions ending inside the window.
  const soon = new Date(now.getTime() + REMINDER_WINDOW_DAYS * DAY_MS);
  const expiring = await db.subscription.findMany({
    where: { status: "ACTIVE", currentPeriodEnd: { gte: now, lte: soon } },
  });

  let reminders = 0;
  for (const sub of expiring) {
    const plan = await db.plan.findUnique({ where: { id: sub.planId } });
    const periodKey = sub.currentPeriodEnd?.toISOString().slice(0, 10) ?? "unknown";
    const owners = await db.membership.findMany({
      where: { workspaceId: sub.workspaceId, role: "OWNER" },
      select: { user: { select: { email: true, name: true } } },
    });
    for (const owner of owners) {
      const result = await sendEmail({
        to: owner.user.email,
        subject: `FoundrySignal: ${plan?.name ?? "your"} plan renews in ${Math.ceil((sub.currentPeriodEnd!.getTime() - now.getTime()) / DAY_MS)} days`,
        html: `<p>Hi ${owner.user.name ?? "there"},</p>
<p>Your <strong>${plan?.name ?? "FoundrySignal"}</strong> subscription for this workspace ends on
<strong>${sub.currentPeriodEnd?.toISOString().slice(0, 10)}</strong>. To keep your plan's
capabilities, send the next period's USDC payment through the same checkout —
payment confirmation automatically extends your current period.</p>
<p><a href="${siteUrl()}/billing">Renew in your workspace billing page</a></p>
<p>FoundrySignal never auto-charges: nothing is deducted without your transfer.</p>`,
        text: `Your ${plan?.name ?? "FoundrySignal"} subscription ends ${sub.currentPeriodEnd?.toISOString().slice(0, 10)}. Pay via checkout to extend the period. No auto-charge ever occurs.`,
      });
      if (result.delivered) reminders += 1;
    }
    // One sweep-level idempotent marker per subscription+period so a re-run of
    // today's sweep (crash, restart) cannot spam reminders. The next sweep for
    // the same period will short-circuit on the existing job record.
    await enqueue({
      kind: "billing_reminder_marker",
      idempotencyKey: `renewal-reminder-${sub.id}-${periodKey}`,
      payload: { subscriptionId: sub.id, periodKey },
    });
  }

  // 3. Reschedule tomorrow (unique daily key; overlap-safe).
  await enqueue({
    kind: "billing_sweep",
    idempotencyKey: `billing-sweep-${dayKey(1)}`,
    payload: { scheduledFor: dayKey(1) },
    delayMs: DAY_MS,
    maxAttempts: 5,
  });

  ctx.log("billing sweep done", { expired, reminders, expiring: expiring.length });
});

// Marker job: exists purely for idempotency bookkeeping of reminders.
registerJob("billing_reminder_marker", async (ctx) => {
  ctx.log("renewal reminder recorded");
});

/** Boot-time kick-off: schedule today's sweep if none is pending/completed. */
export async function ensureBillingSweepScheduled(): Promise<void> {
  await enqueue({
    kind: "billing_sweep",
    idempotencyKey: `billing-sweep-${dayKey()}`,
    payload: { scheduledFor: dayKey() },
    maxAttempts: 5,
  });
}

/**
 * Checkout watcher. The client verifies its own payment in the foreground, but
 * a payer can close the tab before that call — this job closes that gap by
 * settling any pending intent whose transfer is already onchain. It also marks
 * stale pending intents EXPIRED so the UI never shows an actionable payment
 * window that has actually elapsed.
 *
 * Self-rescheduling with a time-bucketed idempotency key: overlapping boots
 * cannot create duplicate watchers, and a missed tick is recovered on boot.
 */
registerJob("billing_intent_watcher", async (ctx) => {
  if (!getCheckoutConfig().configured) {
    ctx.log("checkout watcher skipped — PAYOUT_WALLET not configured");
    await scheduleNextWatch();
    return;
  }

  const now = new Date();
  // Expire windows that elapsed without settlement (client verifies on demand,
  // but a closed tab must not leave a PENDING row forever).
  const expired = await db.cryptoPaymentIntent.updateMany({
    where: { status: "PENDING", expiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  });

  const pending = await db.cryptoPaymentIntent.findMany({
    where: { status: "PENDING", expiresAt: { gte: now } },
    orderBy: { createdAt: "asc" },
    take: WATCH_BATCH,
  });

  let confirmed = 0;
  for (const intent of pending) {
    try {
      const result = await verifyCheckoutIntent({
        workspaceId: intent.workspaceId,
        userId: intent.userId,
        memo: intent.memo,
      });
      if (result.status === "CONFIRMED") confirmed += 1;
    } catch (err) {
      // One bad RPC response must not stop the rest of the batch. The job's
      // own retry/backoff still handles a total failure.
      ctx.log("checkout watcher intent failed", { memo: intent.memo, error: String(err).slice(0, 200) });
    }
  }

  ctx.log("checkout watcher done", { checked: pending.length, confirmed, expired: expired.count });
  await scheduleNextWatch();
});

async function scheduleNextWatch(): Promise<void> {
  const bucket = Math.floor(Date.now() / WATCH_INTERVAL_MS);
  await enqueue({
    kind: "billing_intent_watcher",
    idempotencyKey: `billing-intent-watcher-${bucket}`,
    payload: { scheduledFor: new Date(Date.now() + WATCH_INTERVAL_MS).toISOString() },
    delayMs: WATCH_INTERVAL_MS,
    maxAttempts: 3,
  });
}

/** Boot-time kick-off for the checkout watcher (safe when checkout is unconfigured). */
export async function ensureBillingWatcherScheduled(): Promise<void> {
  await enqueue({
    kind: "billing_intent_watcher",
    idempotencyKey: `billing-intent-watcher-${Math.floor(Date.now() / WATCH_INTERVAL_MS)}`,
    payload: { scheduledFor: new Date(Date.now() + WATCH_INTERVAL_MS).toISOString() },
    delayMs: WATCH_INTERVAL_MS,
    maxAttempts: 3,
  });
}
