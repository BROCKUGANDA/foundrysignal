// Trading release governance — the server-side source of truth for whether
// swap execution may run. Execution stays OFF until ALL of:
//   1. every review gate is APPROVED by a platform admin (audited, with notes),
//   2. the kill switch is CLEAR,
//   3. TRADING_ENABLED=true exists in the process environment.
// Order INTENTS and quote previews are allowed while gated (they are records,
// not execution); nothing ever reaches /order or /execute until the gate lifts.

import { db } from "@/lib/db";
import { recordAudit } from "@/lib/domain/shared/audit";

export const REVIEW_GATE_KEYS = [
  "PRODUCT_REVIEW",
  "LEGAL_JURISDICTION_REVIEW",
  "PROVIDER_INTEGRATION_REVIEW",
  "SECURITY_REVIEW",
] as const;

export const KILL_SWITCH_KEY = "EXECUTION_KILL_SWITCH";

export type ReviewGateKey = (typeof REVIEW_GATE_KEYS)[number];

export const GATE_DEFS: Array<{ key: ReviewGateKey | typeof KILL_SWITCH_KEY; title: string; description: string }> = [
  {
    key: "PRODUCT_REVIEW",
    title: "Product review",
    description:
      "Product sign-off on the trading surface: scope (which pairs), user flows, slippage/impact affordances, error and UNCERTAIN-state handling, and the position of trading within the research product.",
  },
  {
    key: "LEGAL_JURISDICTION_REVIEW",
    title: "Legal & jurisdiction review",
    description:
      "Qualified legal review of swap execution per operating jurisdiction: licensing/regulatory perimeter, restricted-user geofencing, KYC/AML obligations, terms-of-service coverage and disclosure obligations.",
  },
  {
    key: "PROVIDER_INTEGRATION_REVIEW",
    title: "Provider integration review",
    description:
      "Verified Jupiter Swap API V2 integration (POST /order → client wallet signing → POST /execute), quote expiry handling, failure taxonomy, rate-limit posture and RPC submission reliability.",
  },
  {
    key: "SECURITY_REVIEW",
    title: "Security review",
    description:
      "Threat model covering transaction tampering, session-bound execution authorization, audit coverage, key-handling guarantees (client-side signing only), kill-switch drill and incident runbook.",
  },
  {
    key: KILL_SWITCH_KEY,
    title: "Execution kill switch",
    description:
      "Instant platform-level halt for swap execution. ENGAGED blocks every execution attempt regardless of gate states; only a platform admin may re-CLEAR it (audited).",
  },
];

/** Idempotently seeds the gate rows. Safe to call on every read. */
export async function ensureTradingGates(): Promise<void> {
  await Promise.all(
    GATE_DEFS.map((g) =>
      db.tradingReleaseGate.upsert({
        where: { key: g.key },
        create: {
          key: g.key,
          title: g.title,
          description: g.description,
          // Default-deny posture: the kill switch starts ENGAGED so execution
          // is impossible until an admin explicitly re-clears it (audited).
          ...(g.key === KILL_SWITCH_KEY ? { state: "ENGAGED" } : {}),
        },
        update: { title: g.title, description: g.description },
      })
    )
  );
}

export interface GateView {
  key: string;
  title: string;
  description: string;
  state: string;
  decisionNotes: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  updatedAt: string;
}

export interface TradingReadiness {
  gates: GateView[];
  conditions: {
    allReviewsApproved: boolean;
    killSwitchClear: boolean;
    envFlagSet: boolean;
  };
  executionAllowed: boolean;
  /** Machine-readable block reason when execution is not allowed. */
  blockReason: string;
}

export async function getTradingReadiness(): Promise<TradingReadiness> {
  await ensureTradingGates();
  const rows = await db.tradingReleaseGate.findMany({ orderBy: { createdAt: "asc" } });
  const gates: GateView[] = rows.map((r) => ({
    key: r.key,
    title: r.title,
    description: r.description,
    state: r.state,
    decisionNotes: r.decisionNotes,
    decidedBy: r.decidedBy,
    decidedAt: r.decidedAt?.toISOString() ?? null,
    updatedAt: r.updatedAt.toISOString(),
  }));

  const byKey = new Map(rows.map((r) => [r.key, r]));
  const allReviewsApproved = REVIEW_GATE_KEYS.every((k) => byKey.get(k)?.state === "APPROVED");
  const killSwitchClear = byKey.get(KILL_SWITCH_KEY)?.state === "CLEAR";
  const envFlagSet = process.env.TRADING_ENABLED === "true";
  const executionAllowed = allReviewsApproved && killSwitchClear && envFlagSet;

  const reasons: string[] = [];
  if (!allReviewsApproved) {
    const pending = REVIEW_GATE_KEYS.filter((k) => byKey.get(k)?.state !== "APPROVED");
    reasons.push(`review gates pending: ${pending.join(", ")}`);
  }
  if (!killSwitchClear) reasons.push("execution kill switch ENGAGED");
  if (!envFlagSet) reasons.push("TRADING_ENABLED env flag not set");

  return {
    gates,
    conditions: { allReviewsApproved, killSwitchClear, envFlagSet },
    executionAllowed,
    blockReason: reasons.length > 0 ? reasons.join(" · ") : "all conditions met",
  };
}

const GATE_TRANSITIONS: Record<string, string[]> = {
  NOT_STARTED: ["IN_REVIEW", "REJECTED"],
  IN_REVIEW: ["APPROVED", "REJECTED", "NOT_STARTED"],
  APPROVED: ["REJECTED"], // re-approval after rejection goes REJECTED → IN_REVIEW → APPROVED
  REJECTED: ["IN_REVIEW"],
};

export interface GateDecisionInput {
  key: string;
  state: string;
  decisionNotes: string;
  adminUserId: string;
}

/** Applies an admin decision to a gate with transition validation + audit. */
export async function decideGate(input: GateDecisionInput): Promise<GateView> {
  await ensureTradingGates();
  const row = await db.tradingReleaseGate.findUnique({ where: { key: input.key } });
  if (!row) {
    const err = new Error(`Unknown gate key: ${input.key}`);
    (err as Error & { code?: string }).code = "NOT_FOUND";
    throw err;
  }

  const isKillSwitch = input.key === KILL_SWITCH_KEY;
  const validTargets = isKillSwitch ? ["CLEAR", "ENGAGED"] : GATE_TRANSITIONS[row.state] ?? [];

  if (!validTargets.includes(input.state)) {
    const err = new Error(
      isKillSwitch
        ? `Kill switch can only be CLEAR or ENGAGED.`
        : `Invalid transition ${row.state} → ${input.state}. Allowed: ${validTargets.join(", ")}.`
    );
    (err as Error & { code?: string }).code = "INVALID_TRANSITION";
    throw err;
  }

  const updated = await db.tradingReleaseGate.update({
    where: { key: input.key },
    data: {
      state: input.state,
      decisionNotes: input.decisionNotes,
      decidedBy: input.adminUserId,
      decidedAt: new Date(),
    },
  });

  await recordAudit({
    actorId: input.adminUserId,
    action: isKillSwitch ? "TRADING_KILL_SWITCH" : "TRADING_GATE_DECISION",
    targetType: "TradingReleaseGate",
    targetId: updated.id,
    summary: `${input.key} → ${input.state} — ${input.decisionNotes}`,
    metadata: { key: input.key, state: input.state, notes: input.decisionNotes },
  });

  return {
    key: updated.key,
    title: updated.title,
    description: updated.description,
    state: updated.state,
    decisionNotes: updated.decisionNotes,
    decidedBy: updated.decidedBy,
    decidedAt: updated.decidedAt?.toISOString() ?? null,
    updatedAt: updated.updatedAt.toISOString(),
  };
}
