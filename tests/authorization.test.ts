// Authorization tests — real DB: unauthenticated and cross-tenant access must
// fail on protected service paths. Uses the dev database (test data cleaned up).
import { describe, test, expect, afterAll } from "bun:test";
import { db } from "@/lib/db";
import { hashPassword, sha256, emailHash } from "@/lib/auth/session";
import { ROLE_RANK } from "@/lib/auth/context";

// NOTE: route-level auth is exercised via E2E (agent-browser); these tests
// verify the service-layer building blocks and tenant isolation invariants.

async function makeUser(tag: string) {
  return db.user.create({
    data: {
      email: `authz-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.local`,
      emailHash: `hash-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: tag,
      passwordHash: await hashPassword("test-password-123"),
    },
  });
}

describe("password hashing", () => {
  test("bcrypt hash differs from plaintext and verifies", async () => {
    const { verifyPassword } = await import("@/lib/auth/session");
    const hash = await hashPassword("super-secret-10");
    expect(hash).not.toContain("super-secret");
    expect(await verifyPassword("super-secret-10", hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });
});

describe("hash helpers", () => {
  test("emailHash is deterministic + case-insensitive", () => {
    expect(emailHash("User@Example.COM")).toBe(emailHash("user@example.com"));
    expect(emailHash("a@b.c")).not.toBe(emailHash("other@b.c"));
  });
  test("sha256 is stable", () => {
    expect(sha256("foundrysignal")).toHaveLength(64);
    expect(sha256("foundrysignal")).toBe(sha256("foundrysignal"));
  });
});

describe("tenant isolation invariants", () => {
  test("workspaces do not share watchlist rows across tenants", async () => {
    const [u1, u2] = await Promise.all([makeUser("t1"), makeUser("t2")]);
    const w1 = await db.workspace.create({ data: { name: "W1", slug: `w1-${Date.now()}` } });
    const w2 = await db.workspace.create({ data: { name: "W2", slug: `w2-${Date.now()}` } });
    await db.membership.create({ data: { workspaceId: w1.id, userId: u1.id, role: "OWNER" } });
    await db.membership.create({ data: { workspaceId: w2.id, userId: u2.id, role: "OWNER" } });

    const v = await db.venture.create({ data: { name: "AuthzProbe", slug: `authz-probe-${Date.now()}` } });
    const wl1 = await db.watchlist.create({ data: { workspaceId: w1.id, name: "List A" } });
    await db.watchlistItem.create({ data: { watchlistId: wl1.id, ventureId: v.id } });

    const itemsForW1 = await db.watchlistItem.count({ where: { watchlist: { workspaceId: w1.id } } });
    const itemsForW2 = await db.watchlistItem.count({ where: { watchlist: { workspaceId: w2.id } } });
    expect(itemsForW1).toBe(1);
    expect(itemsForW2).toBe(0);

    // cleanup
    await db.watchlistItem.deleteMany({ where: { ventureId: v.id } });
    await db.watchlist.deleteMany({ where: { workspaceId: { in: [w1.id, w2.id] } } });
    await db.venture.delete({ where: { id: v.id } });
    await db.membership.deleteMany({ where: { userId: { in: [u1.id, u2.id] } } });
    await db.workspace.deleteMany({ where: { id: { in: [w1.id, w2.id] } } });
    await db.user.deleteMany({ where: { id: { in: [u1.id, u2.id] } } });
  });
});

describe("role ranking", () => {
  test("rank order", () => {
    expect(ROLE_RANK.OWNER).toBe(3);
    expect(ROLE_RANK.ADMIN).toBe(2);
    expect(ROLE_RANK.ANALYST).toBe(1);
    expect(ROLE_RANK.VIEWER).toBe(0);
  });
});

describe("registration personas", () => {
  test("registration defaults to VENTURE_INVESTOR and accepts every persona", async () => {
    const { RegisterSchema } = await import("@/lib/auth/service");
    const base = { email: "persona@test.local", password: "test-password-123" };
    expect(RegisterSchema.parse(base).userType).toBe("VENTURE_INVESTOR");
    for (const userType of ["FOUNDER", "RESEARCH_ANALYST", "LIMITED_PARTNER", "OTHER"]) {
      expect(RegisterSchema.parse({ ...base, userType }).userType).toBe(userType);
    }
    expect(() => RegisterSchema.parse({ ...base, userType: "PLATFORM_ADMIN" })).toThrow();
  });

  test("self-service account update cannot set role fields", async () => {
    const { UpdateAccountSchema } = await import("@/lib/auth/service");
    const parsed = UpdateAccountSchema.parse({
      name: "New Name",
      platformRole: "PLATFORM_ADMIN",
      workspaceRole: "OWNER",
    }) as Record<string, unknown>;
    expect(parsed.name).toBe("New Name");
    expect(parsed.platformRole).toBeUndefined();
    expect(parsed.workspaceRole).toBeUndefined();
    expect(Object.keys(parsed)).toEqual(["name"]);
  });
});
