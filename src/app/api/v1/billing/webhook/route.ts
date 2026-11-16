import { NextResponse } from "next/server";
import { handler, ok } from "@/lib/contracts/http";
import { constructWebhookEvent, processWebhookEvent } from "@/lib/domain/billing/stripe";

// Stripe webhook — signature-verified (timing-safe HMAC over the RAW body),
// idempotent by event id (BillingWebhookEvent ledger). This is the only route
// that mutates subscriptions; checkout success URLs never mutate state.
export const POST = handler(async ({ req, requestId }) => {
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
