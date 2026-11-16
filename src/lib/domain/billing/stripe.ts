// Stripe billing provider — real integration, config-gated.
//
// HONESTY RULE: when the environment lacks Stripe credentials, every surface
// reports an explicit CONFIG_GAP (required env names listed) — checkout never
// silently pretends to work, and no payment state is simulated.
//
// Required configuration when the operator is ready:
//   STRIPE_SECRET_KEY                      (sk_live_… / sk_test_…)
//   STRIPE_WEBHOOK_SECRET                  (whsec_…, from the Stripe dashboard)
//   STRIPE_PRICE_<PLANCODE>                (price_… per paid plan, e.g. STRIPE_PRICE_RESEARCHER)
//   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY     (pk_…, optional — client-side flows)

import Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/domain/shared/audit";
import { ApiHttpError } from "@/lib/contracts/http";

export const BILLING_PROVIDER = "stripe";

export interface BillingConfigStatus {
  provider: string;
  configured: boolean;
  checkoutReady: boolean;
  webhookReady: boolean;
  missingEnv: string[];
  configuredPlans: string[];
  unconfiguredPlans: string[];
}

const PAID_PLAN_CODES = ["RESEARCHER", "PROFESSIONAL", "TEAM"] as const;
const PRICE_ENV_PREFIX = "STRIPE_PRICE_";

function priceEnvName(planCode: string): string {
  return `${PRICE_ENV_PREFIX}${planCode}`;
}

function secret(): string | undefined {
  const v = process.env.STRIPE_SECRET_KEY;
  return v && v.startsWith("sk_") ? v : undefined;
}

export function getBillingStatus(): BillingConfigStatus {
  const missingEnv: string[] = [];
  const hasSecret = !!secret();
  if (!hasSecret) missingEnv.push("STRIPE_SECRET_KEY");
  const hasWebhook = !!process.env.STRIPE_WEBHOOK_SECRET;
  if (!hasWebhook) missingEnv.push("STRIPE_WEBHOOK_SECRET");

  const configuredPlans = PAID_PLAN_CODES.filter((c) => !!process.env[priceEnvName(c)]);
  const unconfiguredPlans = PAID_PLAN_CODES.filter((c) => !process.env[priceEnvName(c)]);
  if (unconfiguredPlans.length > 0) missingEnv.push(...unconfiguredPlans.map(priceEnvName));

  return {
    provider: BILLING_PROVIDER,
    configured: hasSecret && hasWebhook,
    checkoutReady: hasSecret,
    webhookReady: hasWebhook,
    missingEnv,
    configuredPlans: [...configuredPlans],
    unconfiguredPlans: [...unconfiguredPlans],
  };
}

/** Lazily-constructed Stripe client. Throws CONFIG_GAP when unconfigured. */
function client(): Stripe {
  const key = secret();
  if (!key) {
    throw new ApiHttpError("CONFIGURATION_REQUIRED", "Billing provider is not configured. Set STRIPE_SECRET_KEY (and per-plan price ids) to enable checkout.", false, {
      requiredEnv: getBillingStatus().missingEnv,
    });
  }
  // appInfo shows up in the Stripe dashboard for this integration's API calls
  return new Stripe(key, { appInfo: { name: "FoundrySignal", version: "1.0.0" } });
}

function stripeErrorToHttp(err: unknown): never {
  if (err instanceof Stripe.errors.StripeInvalidRequestError) {
    throw new ApiHttpError("PROVIDER_UNAVAILABLE", err.message, false, { provider: BILLING_PROVIDER });
  }
  if (err instanceof Stripe.errors.StripeAPIError || err instanceof Stripe.errors.StripeConnectionError) {
    throw new ApiHttpError("PROVIDER_UNAVAILABLE", "Billing provider temporarily unavailable — try again.", true, { provider: BILLING_PROVIDER });
  }
  throw new ApiHttpError("PROVIDER_UNAVAILABLE", "Billing provider rejected the request.", false, { provider: BILLING_PROVIDER });
}

export interface CheckoutRequest {
  planCode: string;
  workspaceId: string;
  workspaceName: string;
  email: string;
  origin: string;
}

/**
 * Creates a Stripe Checkout session for a paid plan.
 * metadata carries workspaceId + planCode so the webhook can bind the
 * subscription to the right workspace without trusting client input.
 */
export async function createCheckoutSession(input: CheckoutRequest): Promise<{ url: string; sessionId: string }> {
  const status = getBillingStatus();
  if (!status.checkoutReady) {
    throw new ApiHttpError("CONFIGURATION_REQUIRED", "Checkout is not configured for this deployment.", false, { requiredEnv: status.missingEnv });
  }

  const plan = await db.plan.findUnique({ where: { code: input.planCode } });
  if (!plan || !plan.active || plan.monthlyPriceMicros <= 0) {
    throw new ApiHttpError("VALIDATION_FAILED", "Unknown or non-purchasable plan code.", false);
  }

  const priceId = process.env[priceEnvName(input.planCode)];
  if (!priceId) {
    throw new ApiHttpError("CONFIGURATION_REQUIRED", `Plan ${input.planCode} has no configured price. Missing env: ${priceEnvName(input.planCode)}.`, false, {
      requiredEnv: [priceEnvName(input.planCode)],
    });
  }

  try {
    const session = await client().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: input.email,
      client_reference_id: input.workspaceId,
      metadata: {
        workspaceId: input.workspaceId,
        planCode: input.planCode,
        workspaceName: input.workspaceName,
      },
      subscription_data: { metadata: { workspaceId: input.workspaceId, planCode: input.planCode } },
      success_url: `${input.origin}/settings?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${input.origin}/settings?billing=cancelled`,
      allow_promotion_codes: true,
    });
    if (!session.url) {
      throw new ApiHttpError("PROVIDER_UNAVAILABLE", "Checkout session created without a redirect URL.", false);
    }
    await recordAudit({
      action: "BILLING_CHECKOUT_CREATED",
      targetType: "Plan",
      targetId: plan.id,
      summary: `Checkout session ${session.id} for ${input.planCode} (workspace ${input.workspaceId})`,
      metadata: { sessionId: session.id, planCode: input.planCode, workspaceId: input.workspaceId },
    });
    return { url: session.url, sessionId: session.id };
  } catch (err) {
    if (err instanceof ApiHttpError) throw err;
    stripeErrorToHttp(err);
  }
}

/** Stripe Customer Portal session (manage payment method / cancel / invoices). */
export async function createPortalSession(input: { workspaceId: string; origin: string; email: string }): Promise<{ url: string }> {
  const status = getBillingStatus();
  if (!status.checkoutReady) {
    throw new ApiHttpError("CONFIGURATION_REQUIRED", "Billing portal is not configured for this deployment.", false, { requiredEnv: status.missingEnv });
  }
  const sub = await db.subscription.findFirst({
    where: { workspaceId: input.workspaceId, provider: BILLING_PROVIDER },
    orderBy: { createdAt: "desc" },
  });
  if (!sub?.providerRef) {
    throw new ApiHttpError("NOT_FOUND", "No billing subscription exists for this workspace yet.", false);
  }
  try {
    const stripe = client();
    const remote = await stripe.subscriptions.retrieve(sub.providerRef);
    const session = await stripe.billingPortal.sessions.create({
      customer: typeof remote.customer === "string" ? remote.customer : remote.customer.id,
      return_url: `${input.origin}/settings`,
    });
    return { url: session.url };
  } catch (err) {
    if (err instanceof ApiHttpError) throw err;
    stripeErrorToHttp(err);
  }
}

// ─── Webhook processing ───────────────────────────────────────────────

export function constructWebhookEvent(rawBody: string, signature: string): Stripe.Event {
  const whsec = process.env.STRIPE_WEBHOOK_SECRET;
  if (!whsec) {
    throw new ApiHttpError("CONFIGURATION_REQUIRED", "Webhook endpoint is not configured (missing STRIPE_WEBHOOK_SECRET).", false, { requiredEnv: ["STRIPE_WEBHOOK_SECRET"] });
  }
  try {
    return client().webhooks.constructEvent(rawBody, signature, whsec);
  } catch (err) {
    if (err instanceof Stripe.errors.StripeSignatureVerificationError) {
      throw new ApiHttpError("FORBIDDEN", "Webhook signature verification failed.", false);
    }
    throw new ApiHttpError("VALIDATION_FAILED", "Malformed webhook payload.", false);
  }
}

function subscriptionStatusFromStripe(s: Stripe.Subscription): string {
  switch (s.status) {
    case "active": return "ACTIVE";
    case "past_due": case "unpaid": return "PAST_DUE";
    case "canceled": case "incomplete_expired": return "CANCELED";
    default: return "TRIALING";
  }
}

/** Applies a subscription event to the local record. Idempotent by providerRef. */
async function applySubscription(s: Stripe.Subscription): Promise<void> {
  const planCode = s.metadata?.planCode ?? "";
  const workspaceId = s.metadata?.workspaceId ?? "";
  const plan = planCode ? await db.plan.findUnique({ where: { code: planCode } }) : null;
  if (!plan || !workspaceId) {
    throw new ApiHttpError("VALIDATION_FAILED", "Subscription event missing plan/workspace metadata — cannot bind entitlements.", false, { subscriptionId: s.id });
  }
  const data = {
    workspaceId,
    planId: plan.id,
    status: subscriptionStatusFromStripe(s),
    provider: BILLING_PROVIDER,
    providerRef: s.id,
    // Stripe v23 moved the period to the item level — use the longest item period.
    currentPeriodEnd: new Date(
      Math.max(...s.items.data.map((it) => it.current_period_end ?? 0), 0) * 1000
    ),
    cancelAtPeriodEnd: s.cancel_at_period_end,
  };
  await db.subscription.upsert({
    where: { provider_providerRef: { provider: BILLING_PROVIDER, providerRef: s.id } },
    create: data,
    update: data,
  });
  await recordAudit({
    action: "BILLING_SUBSCRIPTION_SYNCED",
    targetType: "Subscription",
    targetId: s.id,
    summary: `${planCode} → ${data.status} (workspace ${workspaceId})`,
    metadata: { subscriptionId: s.id, status: data.status, planCode, workspaceId },
  });
}

/**
 * Processes a verified webhook event exactly once.
 * Insert-first claim: the ledger row IS the lock — concurrent deliveries of
 * the same event hit the unique eventId and are acked as duplicates.
 * Failure semantics:
 *  - permanent/structural failure (ApiHttpError, e.g. missing metadata):
 *    recorded FAILED and acked 200 so Stripe does not retry forever; ops can
 *    see it in the ledger. NOT treated as duplicate for future retries.
 *  - transient failure (DB/unknown error): the claim row is released so the
 *    incoming Stripe retry can reprocess — no permanent state divergence.
 */
export async function processWebhookEvent(event: Stripe.Event): Promise<"processed" | "duplicate" | "skipped"> {
  // Claim the event (unique eventId). P2002 → another delivery already holds it.
  try {
    await db.billingWebhookEvent.create({
      data: { eventId: event.id, type: event.type, payloadJson: JSON.stringify(event.data.object), status: "PROCESSED" },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await db.billingWebhookEvent.findUnique({ where: { eventId: event.id } });
      // A FAILED claim does NOT block reprocessing when the failure was transient —
      // release it so this delivery can retry the work.
      if (existing?.status === "FAILED" && existing.error?.startsWith("TRANSIENT:")) {
        await db.billingWebhookEvent.delete({ where: { eventId: event.id } });
      } else {
        return "duplicate";
      }
    } else {
      throw err; // transient DB problem → 500 → Stripe retries
    }
  }

  let outcome: "processed" | "skipped" = "processed";

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode === "subscription" && session.subscription) {
          const sub = await client().subscriptions.retrieve(
            typeof session.subscription === "string" ? session.subscription : session.subscription.id
          );
          await applySubscription(sub);
        } else {
          outcome = "skipped";
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        await applySubscription(event.data.object);
        break;
      }
      case "customer.subscription.deleted": {
        const s = event.data.object;
        await db.subscription.updateMany({
          where: { provider: BILLING_PROVIDER, providerRef: s.id },
          data: { status: "CANCELED", cancelAtPeriodEnd: false },
        });
        break;
      }
      default:
        outcome = "skipped";
    }
  } catch (err) {
    if (err instanceof ApiHttpError) {
      // Permanent/structural: keep the ledger row (audit) and ack — Stripe
      // cannot fix a payload problem by retrying.
      await db.billingWebhookEvent.update({
        where: { eventId: event.id },
        data: { status: "FAILED", error: `PERMANENT: ${err.message}` },
      }).catch(() => undefined);
      throw err;
    }
    // Transient: release the claim so the retry reprocesses cleanly.
    const transient = `TRANSIENT: ${err instanceof Error ? err.message : String(err)}`;
    await db.billingWebhookEvent.delete({ where: { eventId: event.id } }).catch(() => undefined);
    throw new Error(transient);
  }

  if (outcome === "skipped") {
    await db.billingWebhookEvent.update({
      where: { eventId: event.id },
      data: { status: "SKIPPED" },
    }).catch(() => undefined);
  }
  return outcome;
}

/**
 * Resolves a validated redirect origin for payment URLs (F-6).
 * The client-supplied Origin header is NEVER trusted on its own: it must match
 * an allowlisted origin — NEXT_PUBLIC_SITE_URL, any ALLOWED_ORIGINS entries,
 * or the deployment's own origin. Otherwise the request is rejected.
 */
export function resolveAllowedOrigin(originHeader: string | null, requestOrigin: string): string {
  const allowed = new Set<string>(
    [
      process.env.NEXT_PUBLIC_SITE_URL,
      ...(process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()),
      requestOrigin,
    ]
      .filter((v): v is string => !!v)
      .map((v) => v.replace(/\/+$/, ""))
  );
  if (originHeader) {
    const normalized = originHeader.replace(/\/+$/, "");
    if (!allowed.has(normalized)) {
      throw new ApiHttpError("FORBIDDEN", "Origin is not allowed for billing redirects.", false, { origin: originHeader });
    }
    return normalized;
  }
  // No Origin header (same-server call): fall back to the configured site URL,
  // else the deployment origin.
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ?? requestOrigin;
}

/** Current subscription for a workspace (with plan joined). */
export async function getWorkspaceSubscription(workspaceId: string) {
  const sub = await db.subscription.findFirst({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });
  if (!sub) return null;
  const plan = await db.plan.findUnique({ where: { id: sub.planId } });
  return {
    status: sub.status,
    provider: sub.provider,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
    plan: plan ? { code: plan.code, name: plan.name } : null,
  };
}
