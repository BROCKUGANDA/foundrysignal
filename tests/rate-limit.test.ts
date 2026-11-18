// Postgres-backed fixed-window limiter. Real DB (dev/test database);
// buckets created here are cleaned up.
import { describe, test, expect, afterEach } from "bun:test";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

const keys: string[] = [];
function bucketKey(tag: string): string {
  const k = `test-rl-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  keys.push(k);
  return k;
}

afterEach(async () => {
  await db.rateLimitBucket.deleteMany({ where: { key: { in: keys.splice(0) } } });
});

describe("rateLimit (postgres-backed)", () => {
  test("allows up to the limit in one window, then blocks", async () => {
    const k = bucketKey("cap");
    for (let i = 0; i < 3; i += 1) {
      const r = await rateLimit({ key: k, limit: 3, windowMs: 60_000 });
      expect(r.allowed).toBe(true);
    }
    const blocked = await rateLimit({ key: k, limit: 3, windowMs: 60_000 });
    expect(blocked).toEqual({ allowed: false, remaining: 0 });
  });

  test("expired full bucket resets on the next hit instead of staying blocked", async () => {
    const k = bucketKey("rollover");
    await db.rateLimitBucket.create({
      data: {
        key: k,
        count: 10,
        windowStart: new Date(Date.now() - 120_000),
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    const r = await rateLimit({ key: k, limit: 3, windowMs: 60_000 });
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(2);
  });

  test("sweep deletes expired buckets on the write path", async () => {
    const stale = bucketKey("stale");
    await db.rateLimitBucket.create({
      data: {
        key: stale,
        count: 1,
        windowStart: new Date(Date.now() - 120_000),
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    const r = await rateLimit({ key: bucketKey("sweep-trigger"), limit: 5, windowMs: 60_000 });
    expect(r.allowed).toBe(true);
    expect(await db.rateLimitBucket.findUnique({ where: { key: stale } })).toBeNull();
  });

  test("live partial bucket reports remaining allowance", async () => {
    const k = bucketKey("remaining");
    const first = await rateLimit({ key: k, limit: 5, windowMs: 60_000 });
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(4);
    const second = await rateLimit({ key: k, limit: 5, windowMs: 60_000 });
    expect(second.remaining).toBeLessThanOrEqual(4);
  });
});
