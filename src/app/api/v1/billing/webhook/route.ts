import { NextResponse } from "next/server";
import { handler, ok } from "@/lib/contracts/http";
import { constructWebhookEvent, processWebhookEvent } from "@/lib/domain/billing/stripe";
import { clientIp } from "@/lib/auth/client-ip";
import { rateLimit } from "@/lib/rate-limit";

// Per-IP throttle for the unauthenticated webhook endpoint — Postgres-backed
// (RateLimitBucket via src/lib/rate-limit.ts), so the limit holds across
// processes and restarts. Stripe retries arrive from a small, stable set of
// source addresses, so 50 requests per 10 minutes per IP is generous for
// legitimate traffic and tight for abuse.
const WEBHOOK_WINDOW_MS = 10 * 60 * 1000;
const WEBHOOK_MAX_PER_WINDOW = 50;

// Stripe webhook — signature-verified (timing-safe HMAC over the RAW body),
// idempotent by event id (BillingWebhookEvent ledger). This is the only route
// that mutates subscriptions; checkout success URLs never mutate state.
export const POST = handler(async ({ req, requestId }) => {
  const throttle = await rateLimit({
    key: `webhook:${clientIp(req)}`,
    limit: WEBHOOK_MAX_PER_WINDOW,
    windowMs: WEBHOOK_WINDOW_MS,
  });
  if (!throttle.allowed) {
    return NextResponse.json(
      { success: false, error: { code: "RATE_LIMITED", message: "Too many requests. Try again later.", retryable: true, requestId } },
      { status: 429 }
    );
  }
  const raw = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { success: false, error: { code: "BAD_REQUEST", message: "Missing stripe-signature header.", retryable: false, requestId } },
      { status: 400 }
    );
  }

  const event = constructWebhookEvent(raw, signature);
  const outcome = await processWebhookEvent(event);

  // 200 for processed/duplicate/skipped — Stripe replays on non-2xx, and
  // duplicates must not error (idempotent ack).
  return NextResponse.json(
    ok({ received: true, eventId: event.id, outcome }, requestId),
    { status: 200 }
  );
});
