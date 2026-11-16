import { NextRequest, NextResponse } from "next/server";
import { ok, fail, ApiResponse } from "./api";
import { randomUUID } from "crypto";

export interface HandlerCtx {
  requestId: string;
  req: NextRequest;
}

const CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none'; object-src 'none'";

function withHeaders(res: NextResponse, requestId: string): NextResponse {
  res.headers.set("x-request-id", requestId);
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Content-Security-Policy", CSP);
  return res;
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
    const requestId = req.headers.get("x-request-id") ?? randomUUID();
    try {
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
