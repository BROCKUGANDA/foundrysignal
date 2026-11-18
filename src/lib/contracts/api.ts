// FoundrySignal API envelope + error taxonomy (contract layer)

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "PAYLOAD_TOO_LARGE"
  | "VALIDATION_FAILED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_TRANSITION"
  | "RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_RATE_LIMITED"
  | "QUOTE_EXPIRED"
  | "EXECUTION_GATED"
  | "PAYMENT_REQUIRED"
  | "CONFIGURATION_REQUIRED"
  | "INTERNAL";

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  retryable: boolean;
  requestId: string;
  details?: Record<string, unknown>;
}

export interface ApiMetadata {
  requestId: string;
  timestamp: string;
  version: string;
  nextCursor?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  metadata: ApiMetadata;
}

export function ok<T>(data: T, requestId: string, nextCursor?: string): ApiResponse<T> {
  return {
    success: true,
    data,
    metadata: { requestId, timestamp: new Date().toISOString(), version: "v1", nextCursor },
  };
}

export function fail(
  code: ApiErrorCode,
  message: string,
  requestId: string,
  opts?: { retryable?: boolean; status?: number; details?: Record<string, unknown> }
): { payload: ApiResponse<never>; status: number } {
  return {
    payload: {
      success: false,
      error: { code, message, retryable: opts?.retryable ?? false, requestId, details: opts?.details },
      metadata: { requestId, timestamp: new Date().toISOString(), version: "v1" },
    },
    status: opts?.status ?? statusForCode(code),
  };
}

function statusForCode(code: ApiErrorCode): number {
  switch (code) {
    case "BAD_REQUEST": return 400;
    case "PAYLOAD_TOO_LARGE": return 413;
    case "VALIDATION_FAILED": return 422;
    case "UNAUTHENTICATED": return 401;
    case "FORBIDDEN": return 403;
    case "NOT_FOUND": return 404;
    case "CONFLICT": return 409;
    case "RATE_LIMITED": return 429;
    case "PROVIDER_RATE_LIMITED": return 429;
    case "PROVIDER_UNAVAILABLE": return 503;
    case "QUOTE_EXPIRED": return 410;
    case "EXECUTION_GATED": return 403;
    case "PAYMENT_REQUIRED": return 402;
    case "CONFIGURATION_REQUIRED": return 501;
    case "INVALID_TRANSITION": return 409;
    case "INTERNAL": return 500;
  }
}

// ─── Domain enums (string unions; validated with zod at boundaries) ──

export const VERIFICATION_CLASSES = [
  "INDEPENDENTLY_CORROBORATED",
  "SOURCE_CONFIRMED",
  "SELF_ASSERTED",
  "FOUNDER_PROVIDED",
  "DISPUTED",
  "STALE",
  "UNKNOWN",
] as const;
export type VerificationClass = (typeof VERIFICATION_CLASSES)[number];

export const CLAIM_STATUSES = ["SUPPORTED", "CONTRADICTED", "OUTDATED", "UNVERIFIED"] as const;
export const CONFIDENCE_LEVELS = [
  "SELF_ASSERTED", "SOURCE_CONFIRMED", "INDEPENDENTLY_CORROBORATED", "DISPUTED", "UNKNOWN",
] as const;

export const VENTURE_CATEGORIES = [
  "DEFI", "INFRA", "DEVTOOLS", "PAYMENTS", "CONSUMER", "GAMING", "RWA", "OTHER",
] as const;

export const WORKSPACE_ROLES = ["OWNER", "ADMIN", "ANALYST", "VIEWER"] as const;
export const PLATFORM_ROLES = ["USER", "MODERATOR", "PLATFORM_ADMIN"] as const;

/**
 * Registration personas — who is signing up. Stored on the user record so the
 * product can tailor onboarding without implying a privilege level: a persona
 * never grants platform or workspace role. `VENTURE_INVESTOR` is the default
 * because the research terminal is investor-first, not because it is the only
 * allowed type.
 */
export const USER_TYPES = [
  "VENTURE_INVESTOR",
  "FOUNDER",
  "RESEARCH_ANALYST",
  "LIMITED_PARTNER",
  "OTHER",
] as const;
export type UserType = (typeof USER_TYPES)[number];

export const USER_TYPE_LABELS: Record<UserType, string> = {
  VENTURE_INVESTOR: "Investor / VC",
  FOUNDER: "Founder / operator",
  RESEARCH_ANALYST: "Independent analyst",
  LIMITED_PARTNER: "Limited partner",
  OTHER: "Other",
};

export const PROVIDER_HEALTH = [
  "HEALTHY", "DEGRADED", "RATE_LIMITED", "UNAVAILABLE", "MISCONFIGURED",
] as const;
export type ProviderHealth = (typeof PROVIDER_HEALTH)[number];
