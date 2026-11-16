// Durable DB-backed job queue (BullMQ-compatible contract).
// Production driver swap: implement enqueue/claim on Redis+BullMQ; handlers unchanged.

import { db } from "@/lib/db";
import { randomUUID } from "crypto";

export type JobFailureClass = "TRANSIENT" | "PERMANENT";

export interface EnqueueOptions {
  kind: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  queue?: string;
  maxAttempts?: number;
  timeoutMs?: number;
  delayMs?: number;
}

export interface JobHandlerContext {
  jobId: string;
  attempt: number;
  payload: Record<string, unknown>;
  log: (message: string, data?: Record<string, unknown>) => void;
}

export type JobHandler = (ctx: JobHandlerContext) => Promise<void>;

const registry = new Map<string, JobHandler>();

export function registerJob(kind: string, handler: JobHandler): void {
  registry.set(kind, handler);
}

function backoffDelayMs(attempt: number): number {
  // exponential with jitter: base 1s → 32s, ±30% jitter
  const base = Math.min(1000 * Math.pow(2, attempt - 1), 32_000);
  const jitter = base * (0.7 + Math.random() * 0.6);
  return Math.round(jitter);
}

export async function enqueue(opts: EnqueueOptions): Promise<string> {
  // Idempotency: same key returns existing job instead of duplicating
  const existing = await db.jobRecord.findUnique({ where: { idempotencyKey: opts.idempotencyKey } });
  if (existing && existing.status !== "DEAD" && existing.status !== "COMPLETED") {
    return existing.id;
  }
  if (existing) {
    await db.jobRecord.delete({ where: { id: existing.id } });
  }
  const job = await db.jobRecord.create({
    data: {
      kind: opts.kind,
      idempotencyKey: opts.idempotencyKey,
      payloadJson: JSON.stringify(opts.payload),
      queue: opts.queue ?? "default",
      maxAttempts: opts.maxAttempts ?? 5,
      timeoutMs: opts.timeoutMs ?? 60_000,
      runAt: new Date(Date.now() + (opts.delayMs ?? 0)),
    },
  });
  return job.id;
}

function classifyFailure(err: unknown): JobFailureClass {
  const msg = String(err);
  if (/rate limited|timeout|timed out|ECONN|fetch failed|circuit breaker/i.test(msg)) return "TRANSIENT";
  if (/authentication|auth failure|malformed|invalid|private|blocked|not exist|404/i.test(msg)) return "PERMANENT";
  return "TRANSIENT";
}

/** Claims due jobs with lease semantics; called by the worker loop. */
async function claimDueJobs(limit: number) {
  const due = await db.jobRecord.findMany({
    where: {
      status: { in: ["QUEUED", "FAILED"] },
      runAt: { lte: new Date() },
      attempts: { lt: 10 },
      OR: [{ leasedUntil: null }, { leasedUntil: { lte: new Date() } }],
    },
    orderBy: { runAt: "asc" },
    take: limit,
  });
  const claimed: string[] = [];
  for (const job of due) {
    const res = await db.jobRecord.updateMany({
      where: { id: job.id, OR: [{ leasedUntil: null }, { leasedUntil: { lte: new Date() } }] },
      data: { status: "RUNNING", leasedUntil: new Date(Date.now() + job.timeoutMs + 5000), startedAt: new Date() },
    });
    if (res.count === 1) claimed.push(job.id);
  }
  return claimed;
}

async function runJob(jobId: string): Promise<void> {
  const job = await db.jobRecord.findUnique({ where: { id: jobId } });
  if (!job) return;
  const handler = registry.get(job.kind);
  const attempt = job.attempts + 1;
  const logs: string[] = [];
  const log = (message: string, data?: Record<string, unknown>) => {
    logs.push(JSON.stringify({ t: Date.now(), message, ...data }));
  };

  if (!handler) {
    await db.jobRecord.update({
      where: { id: job.id },
      data: { status: "DEAD", failureClass: "PERMANENT", lastError: `No handler registered for kind ${job.kind}`, attempts: attempt, finishedAt: new Date() },
    });
    return;
  }

  try {
    await Promise.race([
      handler({
        jobId: job.id,
        attempt,
        payload: JSON.parse(job.payloadJson) as Record<string, unknown>,
        log,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Job timeout after ${job.timeoutMs}ms`)), job.timeoutMs)
      ),
    ]);
    await db.jobRecord.update({
      where: { id: job.id },
      data: { status: "COMPLETED", attempts: attempt, finishedAt: new Date(), logsJson: logs.join("\n"), lastError: null, failureClass: null },
    });
  } catch (err) {
    const failureClass = classifyFailure(err);
    const message = String(err).slice(0, 500);
    const willRetry = failureClass === "TRANSIENT" && attempt < job.maxAttempts;
    await db.jobRecord.update({
      where: { id: job.id },
      data: {
        status: willRetry ? "FAILED" : "DEAD",
        attempts: attempt,
        lastError: message,
        failureClass,
        logsJson: logs.join("\n"),
        runAt: willRetry ? new Date(Date.now() + backoffDelayMs(attempt)) : undefined,
        finishedAt: willRetry ? undefined : new Date(),
        leasedUntil: null,
      },
    });
  }
}

let workerRunning = false;
let workerInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Starts the in-process worker loop (2s poll, batch of 3). Production: BullMQ
 * worker process consumes the same job kinds.
 */
export function startWorker(): void {
  if (workerInterval) return;
  workerInterval = setInterval(async () => {
    if (workerRunning) return;
    workerRunning = true;
    try {
      const ids = await claimDueJobs(3);
      for (const id of ids) {
        await runJob(id);
      }
      await requeueExpiredLeases();
    } catch (err) {
      console.error(JSON.stringify({ level: "error", component: "worker", message: String(err) }));
    } finally {
      workerRunning = false;
    }
  }, 2000);
  // unref so the dev server can exit cleanly
  if (typeof workerInterval === "object" && "unref" in workerInterval) {
    (workerInterval as unknown as { unref: () => void }).unref();
  }
}

async function requeueExpiredLeases(): Promise<void> {
  const expired = await db.jobRecord.findMany({
    where: { status: "RUNNING", leasedUntil: { lte: new Date() } },
    take: 10,
  });
  for (const job of expired) {
    const willRetry = job.attempts < job.maxAttempts;
    await db.jobRecord.update({
      where: { id: job.id },
      data: {
        status: willRetry ? "FAILED" : "DEAD",
        lastError: (job.lastError ?? "") + " | lease expired",
        runAt: willRetry ? new Date(Date.now() + backoffDelayMs(job.attempts)) : undefined,
        failureClass: job.failureClass ?? "TRANSIENT",
      },
    });
  }
}

export function newIdempotencyKey(prefix: string): string {
  return `${prefix}:${randomUUID()}`;
}
