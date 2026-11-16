import { NextResponse } from "next/server";
import { handler, ok, ApiHttpError } from "@/lib/contracts/http";
import { requireAuth } from "@/lib/auth/context";
import {
  buildLanaWireBody,
  lanaConfigured,
  lanaRequestSchema,
  LANA_CREDITS,
  requestLana,
} from "@/lib/providers/lana";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-side proxy for Helius Lana. The API key is read from the server
 * environment only and the upstream call is made here: shipping a browser
 * client that calls Lana directly would expose the key and spend plan credits.
 *
 * Both streaming (SSE passthrough) and non-streaming (JSON envelope) modes are
 * supported. read_only is forced server-side in buildLanaWireBody.
 */
export const POST = handler(async ({ req, requestId }) => {
  // Paid lookups must never be anonymous.
  await requireAuth();

  const raw = await req.json().catch(() => null);
  const parsed = lanaRequestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiHttpError("BAD_REQUEST", "Invalid Lana request.", false, {
      issues: parsed.error.issues.slice(0, 10).map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  if (!lanaConfigured()) {
    throw new ApiHttpError("CONFIGURATION_REQUIRED", "HELIUS_API_KEY is not configured.", false);
  }

  const upstream = await requestLana(buildLanaWireBody(parsed.data));

  if (parsed.data.stream) {
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
        "x-lana-model": parsed.data.model,
      },
    });
  }

  const data = await upstream.json().catch(() => null);
  if (!data || typeof data !== "object") {
    throw new ApiHttpError("PROVIDER_UNAVAILABLE", "Lana returned an invalid response.", true);
  }
  if ((data as { stop_reason?: string }).stop_reason === "error") {
    throw new ApiHttpError("PROVIDER_UNAVAILABLE", "Lana turn failed.", true, {
      lanaError: (data as { error?: unknown }).error ?? null,
    });
  }

  const content = Array.isArray((data as { content?: unknown }).content)
    ? ((data as { content: unknown[] }).content)
    : [];
  const answer = content
    .filter((block) => (block as { type?: string })?.type === "text" && typeof (block as { text?: unknown }).text === "string")
    .map((block) => (block as { text: string }).text)
    .join("");

  return {
    payload: ok(
      {
        answer,
        id: (data as { id?: string }).id ?? null,
        model: (data as { model?: string }).model ?? parsed.data.model,
        stop_reason: (data as { stop_reason?: string }).stop_reason ?? null,
        usage: (data as { usage?: unknown }).usage ?? null,
        sources: Array.isArray((data as { sources?: unknown }).sources) ? (data as { sources: unknown[] }).sources : [],
        follow_up: Array.isArray((data as { follow_up?: unknown }).follow_up) ? (data as { follow_up: unknown[] }).follow_up : [],
        creditsCharged: LANA_CREDITS[parsed.data.model],
        streaming: false,
      },
      requestId
    ),
  };
});
