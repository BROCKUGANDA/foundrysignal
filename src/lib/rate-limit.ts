// Shared, restart-safe, multi-process rate limiter backed by PostgreSQL
// (Prisma). Replaces the per-process in-memory Map limiters for the routes
// that opted in — buckets live in the RateLimitBucket table so every app
// instance sees the same counters and a restart does not reset them.
//
// Semantics: fixed window per key. The first hit in a window creates the
// bucket with count=1 and expiresAt = now + windowMs; subsequent hits
// increment the same row until the window lapses, at which point the next
// hit resets the bucket.
//
// Atomicity: every mutation is ONE conditional statement evaluated by
// Postgres against the row it locks — a conditional UPDATE (increment only
// while count < limit), an UPDATE that resets an expired window, or an
// INSERT guarded by the primary-key constraint on `key`. There is no
// read-then-write race and concurrent increments can never overshoot the
// limit. No multi-statement transaction is used on purpose: on Postgres any
// error inside a transaction aborts it, which would break the P2002 retry;
// single statements need no wrapping. Before the INSERT fallback we do an
// existence read — not for correctness (the INSERT is still race-guarded by
// the PK and a P2002 just retries the loop) but so the steady-state "bucket
// is full" path returns BLOCKED without issuing an INSERT that is guaranteed
// to fail and log a Prisma error per request.
//
// Failure mode — FAIL OPEN by deliberate choice: if the database errors, the
// request is ALLOWED and the result carries `dbError: true` (plus a
// console.error). Rationale: the routes wired to this limiter are
// availability-sensitive; a transient Postgres blip must not take down every
// write endpoint. The trade-off is that a sustained DB outage silently lifts
// the throttle — acceptable because the DB is on the request path anyway
// (the handlers themselves read/write through Prisma), and the error is
// logged so operators can alert on it. Callers must not turn a `dbError`
// into a 500.

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Present and true only when the backing store errored and we failed open. */
  dbError?: boolean;
}

export async function rateLimit({
  key,
  limit,
  windowMs,
}: {
  key: string;
  limit: number;
  windowMs: number;
}): Promise<RateLimitResult> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + windowMs);

  // Two passes are enough: the first pass may lose a create race (P2002) or a
  // window-reset race (another request resets the expired window first); the
  // second resolves either via increment. If neither passes, the bucket exists,
  // its window is live, and it is full → blocked.
  //
  // Opportunistic bounded sweep: expired buckets are never read again, so drop
  // a small batch on this write path. Failures are swallowed — the sweep must
  // never affect availability or turn this call into a dbError report.
  try {
    const stale = await db.rateLimitBucket.findMany({
      where: { expiresAt: { lt: now } },
      select: { key: true },
      take: 250,
    });
    if (stale.length > 0) {
      await db.rateLimitBucket.deleteMany({
        where: { key: { in: stale.map((row) => row.key) }, expiresAt: { lt: now } },
      });
    }
  } catch {
    // Intentionally ignored — see comment above.
  }
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      // 1) Live window with capacity → conditional increment (atomic).
      const incremented = await db.rateLimitBucket.updateMany({
        where: { key, expiresAt: { gt: now }, count: { lt: limit } },
        data: { count: { increment: 1 } },
      });
      if (incremented.count === 1) {
        const row = await db.rateLimitBucket.findUnique({
          where: { key },
          select: { count: true },
        });
        // Concurrent increments may make this read lag the true count;
        // clamp so `remaining` never goes negative or above the limit.
        const used = Math.min(Math.max(row?.count ?? limit, 0), limit);
        return { allowed: true, remaining: Math.max(limit - used, 0) };
      }

      // 2) Window expired → atomically reset it for this hit.
      const reset = await db.rateLimitBucket.updateMany({
        where: { key, expiresAt: { lte: now } },
        data: { count: 1, windowStart: now, expiresAt: windowEnd },
      });
      if (reset.count === 1) {
        return { allowed: true, remaining: limit - 1 };
      }

      // 3) Bucket may not exist → check, then create. The existence read
      //    keeps the full-bucket steady state from issuing a doomed INSERT.
      //    If a concurrent creator wins (P2002), loop once more.
      const existing = await db.rateLimitBucket.findUnique({
        where: { key },
        select: { key: true },
      });
      if (existing) {
        // Live window (reset matched nothing) and full (increment matched
        // nothing) → blocked. Retry first: our increment/reset may simply
        // have raced a concurrent window reset — one more pass resolves it.
        // (Steady-state full buckets cost one extra pass, then fall out of
        // the loop and report blocked.)
        continue;
      }
      try {
        await db.rateLimitBucket.create({
          data: { key, count: 1, windowStart: now, expiresAt: windowEnd },
        });
        return { allowed: true, remaining: limit - 1 };
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          continue;
        }
        throw err;
      }
    }
    // Both passes exhausted: live, full bucket (or perpetual contention).
    return { allowed: false, remaining: 0 };
  } catch (err) {
    // FAIL OPEN — see module header. Log for observability; do not throw.
    console.error(
      JSON.stringify({
        level: "error",
        msg: "rate-limit store error; failing open",
        key,
        error: err instanceof Error ? err.message : String(err),
      })
    );
    return { allowed: true, remaining: limit, dbError: true };
  }
}
