import { NextRequest, NextResponse } from "next/server";
import { ok, fail, ApiResponse } from "./api";
import { randomUUID } from "crypto";
import { resolveSession } from "@/lib/auth/session";
import { clientIp } from "@/lib/auth/client-ip";
import { rateLimit } from "@/lib/rate-limit";
import { ZodError } from "zod";

export interface HandlerCtx {
  requestId: string;
  req: NextRequest;
}

function withHeaders(res: NextResponse, requestId: string): NextResponse {
  res.headers.set("x-request-id", requestId);
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return res;
}

/** Client-supplied x-request-id is only honored when it is a sane token;
 * anything else (newline-bearing, overlong, empty) is replaced so callers
 * cannot poison log correlation or the response header. */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
function resolveRequestId(req: NextRequest): string {
  const supplied = req.headers.get("x-request-id");
  if (supplied && REQUEST_ID_PATTERN.test(supplied)) return supplied;
  return randomUUID();
}

/** Bodies over this cap are rejected before any route logic runs. */
const MAX_CONTENT_LENGTH = 256_000;

/**
 * Postgres-backed, shared per-user rate limit for mutating (non-GET)
 * requests — 60 requests per 60 seconds per key, keyed on the session user
 * id with a client-IP fallback for anonymous callers. The billing webhook
 * is excluded (it carries no session and has its own per-IP throttle).
 * Buckets live in the RateLimitBucket table (see src/lib/rate-limit.ts), so
 * the limit holds across processes and restarts.
 */
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;
const WEBHOOK_PATH = "/api/v1/billing/webhook";

async function checkRateLimit(key: string): Promise<void> {
  const { allowed } = await rateLimit({
    key: `write:${key}`,
    limit: RATE_LIMIT_MAX,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });
  if (!allowed) {
    throw new ApiHttpError("RATE_LIMITED", "Too many requests. Try again later.", true);
  }
}

/**
 * CSRF defense-in-depth (layer 2, on top of SameSite=Lax): mutating requests
 * that carry an Origin header must match the deployment's host. Browser
 * same-origin POSTs always send Origin; cross-origin attackers cannot spoof
 * it. Server-to-server calls (e.g. the billing webhook) send no Origin and
 * pass through. A Sec-Fetch-Site of cross-site is also rejected.
 */
function verifyMutationOrigin(req: NextRequest): void {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return;
  const host = req.headers.get("host");
  const origin = req.headers.get("origin");
  const fetchSite = req.headers.get("sec-fetch-site");

  if (fetchSite === "cross-site") {
    throw new ApiHttpError("FORBIDDEN", "Cross-site request rejected.", false);
  }
  if (origin && host) {
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = null;
    }
    if (originHost !== host) {
      throw new ApiHttpError("FORBIDDEN", "Origin does not match request host.", false);
    }
  }
}

/**
 * Wraps a route handler: assigns request ID, catches errors into the
 * envelope, sets security headers. Domain errors are thrown as ApiHttpError.
 * Handlers may either return { payload, status } (JSON envelope) or a raw
 * NextResponse (passthrough — used for file downloads), which still gets
 * security headers, the request ID, and error handling.
 */
export function handler(fn: (ctx: HandlerCtx) => Promise<{ payload: ApiResponse<unknown>; status?: number } | NextResponse>) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const requestId = resolveRequestId(req);
    try {
      // Reject oversized bodies before any route logic runs. Only the
      // declared Content-Length is inspected; chunked bodies without a
      // length still reach the route (they are bounded by the platform's
      // own limits).
      const contentLength = Number(req.headers.get("content-length") ?? "0");
      if (Number.isFinite(contentLength) && contentLength > MAX_CONTENT_LENGTH) {
        throw new ApiHttpError("PAYLOAD_TOO_LARGE", "Request body exceeds the 256 KB limit.", false);
      }

      // Per-user throttle for mutating requests (Postgres-backed, shared
      // across processes; see rate-limit.ts for the fail-open policy).
      if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS"
          && req.nextUrl.pathname !== WEBHOOK_PATH) {
        const session = await resolveSession();
        await checkRateLimit(session?.userId ?? clientIp(req));
      }

      verifyMutationOrigin(req);
      const result = await fn({ requestId, req });
      if (result instanceof NextResponse) {
        return withHeaders(result, requestId);
      }
      return withHeaders(NextResponse.json(result.payload, { status: result.status ?? 200 }), requestId);
    } catch (err) {
      if (err instanceof ApiHttpError) {
        const { payload, status } = fail(err.code, err.message, requestId, {
          retryable: err.retryable,
          details: err.details,
        });
        return withHeaders(NextResponse.json(payload, { status }), requestId);
      }
      // Zod failures from `Schema.parse()` at service boundaries are caller
      // errors, not server faults: map them to the same 422 envelope that
      // explicit VALIDATION_FAILED throws produce instead of a generic 500.
      if (err instanceof ZodError) {
        const issue = err.issues[0];
        const message = issue
          ? `${issue.path.join(".") || "body"}: ${issue.message}`
          : "Request validation failed.";
        const { payload, status } = fail("VALIDATION_FAILED", message, requestId, { retryable: false });
        return withHeaders(NextResponse.json(payload, { status }), requestId);
      }
      console.error(
        JSON.stringify({ level: "error", requestId, path: req.nextUrl.pathname, message: String(err) })
      );
      const { payload, status } = fail("INTERNAL", "An unexpected error occurred.", requestId);
      return withHeaders(NextResponse.json(payload, { status }), requestId);
    }
  };
}

export class ApiHttpError extends Error {
  constructor(
    public code: Parameters<typeof fail>[0],
    message: string,
    public retryable = false,
    public details?: Record<string, unknown>
  ) {
    super(message);
  }
}

export { ok, fail };
