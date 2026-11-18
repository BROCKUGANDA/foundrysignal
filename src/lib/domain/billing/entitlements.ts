// Entitlement resolution — server-side plan limits for a workspace.
//
// Plans carry entitlements as JSON data on Plan.entitlementsJson; this module
// is the only place that parses it. Rules:
//   1. An ACTIVE subscription whose currentPeriodEnd is unset or in the future
//      wins. Everything else — no subscription, expired, past_due, canceled,
//      or a reference to an inactive plan — falls back to the Explorer plan.
//   2. Corrupt entitlementsJson never throws: it parses to {} and every limit
//      resolves to its most restrictive value (0 = not included).
//   3. Numeric limits: -1 = unlimited, 0 = capability not included, n > 0 = cap.
//      Booleans: true = included, false = not included.
//
// Enforcement belongs in API routes / domain services — never in client UI.

import { db } from "@/lib/db";
import { ApiHttpError } from "@/lib/contracts/http";
import type { AuthContext } from "@/lib/auth/context";
import { ensurePlans } from "./plans";

export type Entitlements = Record<string, unknown>;

const UNLIMITED = -1;

function parseEntitlements(json: string | null | undefined): Entitlements {
  try {
    const value = JSON.parse(json ?? "{}") as unknown;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Entitlements;
    }
    return {};
  } catch {
    return {};
  }
}

/** Coerces an entitlement value to a numeric limit. Absent/corrupt → 0. */
export function planLimit(entitlements: Entitlements, key: string): number {
  const value = entitlements[key];
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.trunc(n);
    return 0;
  }
  if (typeof value === "boolean") return value ? UNLIMITED : 0;
  return 0;
}

/** True when the entitlement grants the capability (any non-zero/non-false value). */
function entitlementGranted(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === "number") return Number.isFinite(value) && value !== 0;
  if (typeof value === "string") {
    // Fail closed on any string form of false, however it is spelled —
    // "false", "0", "no", "off", "none", "roadmap", non-finite numbers all
    // mean not included.
    const v = value.trim().toUpperCase();
    return !(v === "" || v === "FALSE" || v === "0" || v === "NO" || v === "OFF" || v === "NONE" || v === "ROADMAP" || v === "NAN" || v === "INFINITY" || v === "-INFINITY");
  }
  return false;
}

interface ResolvedPlan {
  code: string;
  name: string;
  monthlyPriceMicros: number;
  entitlements: Entitlements;
  /** The subscription that granted this plan, or null for the Explorer fallback. */
  subscription: { status: string; currentPeriodEnd: Date | null } | null;
}

async function findExplorerPlan() {
  let plan = await db.plan.findFirst({ where: { code: "EXPLORER", active: true } });
  if (!plan) {
    // Never-seeded EXPLORER (e.g. fresh DB): try to seed now. If that fails we
    // degrade to deny — empty entitlements below — instead of a 500.
    try {
      await ensurePlans();
      plan = await db.plan.findFirst({ where: { code: "EXPLORER", active: true } });
    } catch (err) {
      console.error(
        JSON.stringify({ level: "error", msg: "Explorer plan unavailable; denying entitlements", error: err instanceof Error ? err.message : String(err) })
      );
      plan = null;
    }
  }
  return plan;
}

async function resolvePlan(workspaceId: string): Promise<ResolvedPlan> {
  const subscription = await db.subscription.findFirst({
    where: { workspaceId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
  const periodValid =
    subscription && (!subscription.currentPeriodEnd || subscription.currentPeriodEnd.getTime() >= Date.now());

  if (subscription && periodValid) {
    const plan = await db.plan.findUnique({ where: { id: subscription.planId } });
    if (plan && plan.active) {
      return {
        code: plan.code,
        name: plan.name,
        monthlyPriceMicros: plan.monthlyPriceMicros,
        entitlements: parseEntitlements(plan.entitlementsJson),
        subscription: { status: subscription.status, currentPeriodEnd: subscription.currentPeriodEnd },
      };
    }
  }

  const explorer = await findExplorerPlan();
  return {
    code: explorer?.code ?? "EXPLORER",
    name: explorer?.name ?? "Explorer",
    monthlyPriceMicros: explorer?.monthlyPriceMicros ?? 0,
    entitlements: parseEntitlements(explorer?.entitlementsJson),
    subscription: null,
  };
}

/** The caller workspace's effective entitlements (Explorer fallback applied). */
export async function getEntitlements(workspaceId: string): Promise<Entitlements> {
  return (await resolvePlan(workspaceId)).entitlements;
}

export interface CurrentPlan {
  code: string;
  name: string;
  monthlyPriceMicros: number;
  enterprise: boolean;
  entitlements: Entitlements;
  /** null when the workspace rides the free Explorer fallback. */
  subscription: { status: string; currentPeriodEnd: string | null } | null;
}

/** The caller workspace's effective plan (Explorer fallback applied). */
export async function currentPlan(workspaceId: string): Promise<CurrentPlan> {
  const resolved = await resolvePlan(workspaceId);
  return {
    code: resolved.code,
    name: resolved.name,
    monthlyPriceMicros: resolved.monthlyPriceMicros,
    enterprise: resolved.monthlyPriceMicros < 0,
    entitlements: resolved.entitlements,
    subscription: resolved.subscription
      ? {
          status: resolved.subscription.status,
          currentPeriodEnd: resolved.subscription.currentPeriodEnd?.toISOString() ?? null,
        }
      : null,
  };
}

/**
 * Boolean/feature gate. Throws 402 PAYMENT_REQUIRED when the workspace's plan
 * does not include `key`.
 */
export async function requireEntitlement(ctx: AuthContext, key: string): Promise<void> {
  const entitlements = await getEntitlements(ctx.workspaceId);
  if (!entitlementGranted(entitlements[key])) {
    throw new ApiHttpError(
      "PAYMENT_REQUIRED",
      `Your plan does not include ${key}. Upgrade your plan to unlock it.`,
      false,
      { feature: key },
    );
  }
}

/**
 * Metered/limited gate. Throws 402 PAYMENT_REQUIRED when the plan does not
 * include the capability at all (limit 0). Otherwise returns the numeric limit
 * — -1 means unlimited, n > 0 is the cap the caller must enforce.
 */
export async function assertPlanAllows(ctx: AuthContext, capability: string): Promise<number> {
  const entitlements = await getEntitlements(ctx.workspaceId);
  const limit = planLimit(entitlements, capability);
  if (limit === 0) {
    throw new ApiHttpError(
      "PAYMENT_REQUIRED",
      `Your plan does not include ${capability}. Upgrade your plan to unlock it.`,
      false,
      { feature: capability },
    );
  }
  return limit;
}
