// Entitlement resolution — plan limits, fallback rules and 402 gates.
// Real DB (dev/test database); all rows created here are cleaned up.
import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { db } from "@/lib/db";
import { ensurePlans } from "@/lib/domain/billing/plans";
import {
  getEntitlements,
  currentPlan,
  requireEntitlement,
  assertPlanAllows,
  planLimit,
} from "@/lib/domain/billing/entitlements";
import { fail } from "@/lib/contracts/api";
import { ApiHttpError } from "@/lib/contracts/http";
import type { AuthContext } from "@/lib/auth/context";

const createdWorkspaceIds: string[] = [];
const createdPlanCodes: string[] = [];

function fakeCtx(workspaceId: string): AuthContext {
  return {
    session: { userId: "test-user", issuedAt: 0, activeWsId: workspaceId } as unknown as AuthContext["session"],
    userId: "test-user",
    platformRole: "USER",
    workspaceId,
    workspaceRole: "OWNER",
  };
}

async function makeWorkspace(tag: string) {
  const ws = await db.workspace.create({
    data: { name: `ent-${tag}`, slug: `ent-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` },
  });
  createdWorkspaceIds.push(ws.id);
  return ws;
}

async function subscribe(workspaceId: string, planCode: string, currentPeriodEnd?: Date) {
  const plan = await db.plan.findFirst({ where: { code: planCode } });
  if (!plan) throw new Error(`plan ${planCode} missing — ensurePlans not run?`);
  return db.subscription.create({
    data: { workspaceId, planId: plan.id, status: "ACTIVE", provider: "usdc", providerRef: `test-${workspaceId}-${Date.now()}`, currentPeriodEnd: currentPeriodEnd ?? null },
  });
}

beforeAll(async () => {
  await ensurePlans();
});

afterEach(async () => {
  await db.subscription.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
  await db.workspace.deleteMany({ where: { id: { in: createdWorkspaceIds } } });
  createdWorkspaceIds.length = 0;
  if (createdPlanCodes.length) {
    await db.plan.deleteMany({ where: { code: { in: createdPlanCodes } } });
    createdPlanCodes.length = 0;
  }
});

describe("Explorer fallback (no subscription)", () => {
  test("absent subscription resolves to Explorer entitlements", async () => {
    const ws = await makeWorkspace("free");
    const ent = await getEntitlements(ws.id);
    expect(planLimit(ent, "researchRunsPerMonth")).toBe(0);
    expect(planLimit(ent, "watchlists")).toBe(1);
    expect(planLimit(ent, "savedVentures")).toBe(10);
    expect(ent.reportExport).toBe(false);
  });

  test("Explorer is denied paid capabilities with 402 PAYMENT_REQUIRED", async () => {
    const ws = await makeWorkspace("free-402");
    const ctx = fakeCtx(ws.id);
    await expect(requireEntitlement(ctx, "reportExport")).rejects.toMatchObject({ code: "PAYMENT_REQUIRED" });
    await expect(assertPlanAllows(ctx, "researchRunsPerMonth")).rejects.toMatchObject({ code: "PAYMENT_REQUIRED" });
  });

  test("currentPlan reports Explorer with no subscription", async () => {
    const ws = await makeWorkspace("free-plan");
    const plan = await currentPlan(ws.id);
    expect(plan.code).toBe("EXPLORER");
    expect(plan.subscription).toBeNull();
    expect(plan.enterprise).toBe(false);
  });
});

describe("active subscription", () => {
  test("Researcher subscription grants paid capabilities", async () => {
    const ws = await makeWorkspace("researcher");
    await subscribe(ws.id, "RESEARCHER", new Date(Date.now() + 30 * 24 * 3600 * 1000));
    const ctx = fakeCtx(ws.id);
    const ent = await getEntitlements(ws.id);
    expect(ent.reportExport).toBe(true);
    expect(await assertPlanAllows(ctx, "researchRunsPerMonth")).toBe(25);
    expect(planLimit(ent, "watchlists")).toBe(5);
    await expect(requireEntitlement(ctx, "reportExport")).resolves.toBeUndefined();
    const plan = await currentPlan(ws.id);
    expect(plan.code).toBe("RESEARCHER");
    expect(plan.subscription?.status).toBe("ACTIVE");
  });

  test("expired subscription falls back to Explorer and is denied", async () => {
    const ws = await makeWorkspace("expired");
    await subscribe(ws.id, "RESEARCHER", new Date(Date.now() - 24 * 3600 * 1000));
    const ctx = fakeCtx(ws.id);
    const ent = await getEntitlements(ws.id);
    expect(ent.reportExport).toBe(false);
    await expect(requireEntitlement(ctx, "reportExport")).rejects.toMatchObject({ code: "PAYMENT_REQUIRED" });
    expect((await currentPlan(ws.id)).code).toBe("EXPLORER");
  });
});

describe("defensive parsing", () => {
  test("corrupt entitlementsJson never throws and denies everything", async () => {
    const code = `TEST_CORRUPT_${Date.now().toString(36).toUpperCase()}`;
    createdPlanCodes.push(code);
    await db.plan.create({
      data: { code, name: "Corrupt", monthlyPriceMicros: 1000, entitlementsJson: "{not valid json", sort: 999 },
    });
    const ws = await makeWorkspace("corrupt");
    await subscribe(ws.id, code);
    const ctx = fakeCtx(ws.id);
    await expect(getEntitlements(ws.id)).resolves.toEqual({});
    await expect(requireEntitlement(ctx, "reportExport")).rejects.toMatchObject({ code: "PAYMENT_REQUIRED" });
    await expect(assertPlanAllows(ctx, "researchRunsPerMonth")).rejects.toMatchObject({ code: "PAYMENT_REQUIRED" });
  });
});

describe("402 contract", () => {
  test("PAYMENT_REQUIRED maps to HTTP 402", () => {
    const { status } = fail("PAYMENT_REQUIRED", "upgrade", "req-test");
    expect(status).toBe(402);
    const err = new ApiHttpError("PAYMENT_REQUIRED", "upgrade", false);
    expect(err.code).toBe("PAYMENT_REQUIRED");
  });
});
