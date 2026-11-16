// Server-only Lana client. The Helius API key stays on the server: never
// expose this module, the key, or these helpers to a client component.
// Docs: https://www.helius.dev/docs/agents/lana-api
import { z } from "zod";
import { ApiHttpError } from "@/lib/contracts/http";

const LANA_ENDPOINT = "https://beta.helius-rpc.com/v1/lana/messages";

export const LANA_MODELS = ["lana-fast", "lana-thinking"] as const;
export type LanaModel = (typeof LANA_MODELS)[number];

/** Flat per-request price in Helius credits (streaming or not). */
export const LANA_CREDITS: Record<LanaModel, number> = {
  "lana-fast": 2_000,
  "lana-thinking": 10_000,
};

const userContextSchema = z
  .object({
    wallet: z.string().min(1).max(128).optional(),
    address_kind: z.enum(["wallet", "token"]).optional(),
    time_zone: z.string().min(1).max(64).optional(),
    network: z.enum(["mainnet", "devnet"]).optional(),
  })
  .strict()
  .refine((v) => !v.address_kind || !!v.wallet, {
    message: "address_kind requires wallet",
    path: ["address_kind"],
  });

/**
 * Unknown fields are rejected: the upstream API does the same. Content blocks
 * are intentionally limited to plain text/images-as-URLs are not accepted
 * here, so no base64 payloads reach the paid upstream.
 */
export const lanaRequestSchema = z
  .object({
    model: z.enum(LANA_MODELS).default("lana-fast"),
    messages: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant"]),
            content: z.string().min(1).max(10_000),
          })
          .strict()
      )
      .min(1)
      .max(20)
      .refine((m) => m[m.length - 1]?.role === "user", {
        message: "last message must have role user",
        path: ["messages"],
      }),
    system: z.string().min(1).max(10_000).optional(),
    max_tokens: z.number().int().min(1).max(8_192).optional(),
    stream: z.boolean().default(false),
    extensions: z
      .object({
        output_format: z.enum(["markdown", "plain"]).optional(),
        include_followups: z.boolean().optional(),
        include_documents: z.boolean().optional(),
        enable_deep_scan: z.boolean().optional(),
        user_context: userContextSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type LanaRequestInput = z.infer<typeof lanaRequestSchema>;

/** Builds the exact upstream body. `read_only` is forced true: Lana does not
 * document a flow for showing and signing wallet actions, so callers must not
 * be able to unlock transfer/swap/token-launch tools. */
export function buildLanaWireBody(input: LanaRequestInput): Record<string, unknown> {
  const wire: Record<string, unknown> = {
    model: input.model,
    stream: input.stream,
    messages: input.messages.map(({ role, content }) => ({ role, content })),
    extensions: { ...(input.extensions ?? {}), read_only: true },
  };
  if (input.system !== undefined) wire.system = input.system;
  if (input.max_tokens !== undefined) wire.max_tokens = input.max_tokens;
  return wire;
}

export function lanaConfigured(): boolean {
  return !!process.env.HELIUS_API_KEY;
}

/** Maps upstream failures onto the platform's error taxonomy. Upstream bodies
 * are deliberately not echoed — they may contain provider internals. */
export function lanaErrorForStatus(status: number, retryAfter?: string | null): ApiHttpError {
  const seconds = retryAfter ? Number(retryAfter) : NaN;
  const details = Number.isFinite(seconds) && seconds > 0 ? { retryAfterSeconds: seconds } : undefined;
  switch (status) {
    case 400:
      return new ApiHttpError("BAD_REQUEST", "Lana rejected the request body.", false, details);
    case 401:
      return new ApiHttpError("CONFIGURATION_REQUIRED", "The Helius API key was rejected by Lana.", false);
    case 403:
      return new ApiHttpError("FORBIDDEN", "This Helius plan does not include Lana access.", false);
    case 429:
      return new ApiHttpError("RATE_LIMITED", "Lana is rate limiting this project.", true, details);
    case 503:
      return new ApiHttpError("PROVIDER_UNAVAILABLE", "Lana is at capacity or restarting.", true, details);
    default:
      return new ApiHttpError("PROVIDER_UNAVAILABLE", `Lana returned HTTP ${status}.`, true, details);
  }
}

/** Performs the server-side lookup. A turn can run up to five minutes. */
export async function requestLana(wire: Record<string, unknown>): Promise<Response> {
  const key = process.env.HELIUS_API_KEY;
  if (!key) {
    throw new ApiHttpError("CONFIGURATION_REQUIRED", "HELIUS_API_KEY is not configured.", false);
  }

  let upstream: Response;
  try {
    upstream = await fetch(LANA_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": key },
      body: JSON.stringify(wire),
      cache: "no-store",
      signal: AbortSignal.timeout(330_000),
    });
  } catch {
    throw new ApiHttpError("PROVIDER_UNAVAILABLE", "Lana provider is unreachable.", true);
  }

  if (!upstream.ok) {
    const error = lanaErrorForStatus(upstream.status, upstream.headers.get("retry-after"));
    await upstream.arrayBuffer().catch(() => undefined);
    throw error;
  }
  return upstream;
}
