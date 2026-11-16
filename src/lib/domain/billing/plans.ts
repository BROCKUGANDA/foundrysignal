// Plan catalog — configuration data, never hardcoded entitlement logic.
// Prices are integer micros (USD). Marketing copy (feature bullets) lives in
// the UI; entitlements live here as data consumed by server-side limits.

import { db } from "@/lib/db";

export interface PlanView {
  id: string;
  code: string;
  name: string;
  monthlyPriceMicros: number;
  currency: string;
  enterprise: boolean;
  entitlements: Record<string, unknown>;
  sort: number;
}

const PLAN_SEED: Array<{
  code: string;
  name: string;
  monthlyPriceMicros: number;
  entitlements: Record<string, unknown>;
  sort: number;
}> = [
  {
    code: "EXPLORER",
    name: "Explorer",
    monthlyPriceMicros: 0,
    entitlements: {
      dossierAccess: "PUBLIC",
      savedVentures: 10,
      researchRunsPerMonth: 0,
      watchlists: 1,
      alerts: false,
      reportExport: false,
      apiAccess: false,
      seats: 1,
    },
    sort: 10,
  },
  {
    code: "RESEARCHER",
    name: "Researcher",
    monthlyPriceMicros: 39_000_000,
    entitlements: {
      dossierAccess: "FULL",
      savedVentures: 100,
      researchRunsPerMonth: 25,
      watchlists: 5,
      alerts: true,
      reportExport: true,
      apiAccess: false,
      seats: 1,
    },
    sort: 20,
  },
  {
    code: "PROFESSIONAL",
    name: "Professional",
    monthlyPriceMicros: 99_000_000,
    entitlements: {
      dossierAccess: "FULL",
      savedVentures: 500,
      researchRunsPerMonth: 100,
      watchlists: 20,
      alerts: true,
      reportExport: true,
      comparativeResearch: true,
      savedSearches: 50,
      priorityCollection: true,
      apiAccess: false,
      seats: 1,
    },
    sort: 30,
  },
  {
    code: "TEAM",
    name: "Team",
    monthlyPriceMicros: 299_000_000,
    entitlements: {
      dossierAccess: "FULL",
      savedVentures: 2000,
      researchRunsPerMonth: 400,
      watchlists: 100,
      alerts: true,
      reportExport: true,
      comparativeResearch: true,
      savedSearches: 200,
      priorityCollection: true,
      researchRooms: true,
      rolePermissions: true,
      auditExports: true,
      apiAccess: true,
      apiMonthlyCalls: 50_000,
      seats: 5,
    },
    sort: 40,
  },
  {
    code: "ENTERPRISE",
    name: "Enterprise",
    monthlyPriceMicros: -1, // custom pricing — quoted by sales, never a made-up number
    entitlements: {
      dossierAccess: "FULL",
      savedVentures: -1,
      researchRunsPerMonth: -1,
      watchlists: -1,
      alerts: true,
      reportExport: true,
      comparativeResearch: true,
      researchRooms: true,
      rolePermissions: true,
      auditExports: true,
      apiAccess: true,
      apiMonthlyCalls: -1,
      seats: -1,
      ssoScim: "ROADMAP",
      customCollectionScopes: true,
      dedicatedSupport: true,
    },
    sort: 50,
  },
];

/** Idempotently seeds the plan catalog. Existing rows are updated in place. */
export async function ensurePlans(): Promise<void> {
  for (const p of PLAN_SEED) {
    await db.plan.upsert({
      where: { code: p.code },
      create: {
        code: p.code,
        name: p.name,
        monthlyPriceMicros: p.monthlyPriceMicros,
        entitlementsJson: JSON.stringify(p.entitlements),
        sort: p.sort,
      },
      update: {
        name: p.name,
        monthlyPriceMicros: p.monthlyPriceMicros,
        entitlementsJson: JSON.stringify(p.entitlements),
        sort: p.sort,
        active: true,
      },
    });
  }
}

/** Public catalog for the pricing page (active plans, ordered). */
export async function listActivePlans(): Promise<PlanView[]> {
  await ensurePlans();
  const rows = await db.plan.findMany({ where: { active: true }, orderBy: { sort: "asc" } });
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    monthlyPriceMicros: r.monthlyPriceMicros,
    currency: r.currency,
    enterprise: r.monthlyPriceMicros < 0,
    entitlements: JSON.parse(r.entitlementsJson) as Record<string, unknown>,
    sort: r.sort,
  }));
}
