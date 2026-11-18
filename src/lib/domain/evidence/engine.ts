// Evidence engine — verification classification is computed EXCLUSIVELY
// from linked evidence. No fabricated states. (docs/DATA_METHODOLOGY.md)

import { db } from "@/lib/db";
import { createHash } from "crypto";

export const COLLECTOR_VERSION = "fs-collector 1.0.0";

export type VerificationClass =
  | "INDEPENDENTLY_CORROBORATED"
  | "SOURCE_CONFIRMED"
  | "SELF_ASSERTED"
  | "FOUNDER_PROVIDED"
  | "DISPUTED"
  | "STALE"
  | "UNKNOWN";

export type ClaimStatus = "SUPPORTED" | "CONTRADICTED" | "OUTDATED" | "UNVERIFIED";

// Freshness starting policies (days) by provider category
const FRESHNESS_DAYS: Record<string, number> = {
  GITHUB_API: 2,
  WEBSITE: 1,
  ONCHAIN_RPC: 1,
  MARKET_API: 0.25,
  FOUNDER_PROVIDED: 30,
  USER_SUBMITTED: 30,
};

function isStale(collectedAt: Date, provider: string, now = new Date()): boolean {
  const days = FRESHNESS_DAYS[provider] ?? 14;
  return now.getTime() - collectedAt.getTime() > days * 24 * 3600 * 1000;
}

/**
 * Classifies one evidence source based on its own provenance and links.
 * Pure function — unit tested in tests/evidence-engine.test.ts.
 */
export function classifySource(input: {
  provider: string;
  sourceType: string;
  collectedAt: Date;
  links: Array<{ relation: string; otherProvider: string; otherSourceType: string }>;
}): VerificationClass {
  if (input.links.some((l) => l.relation === "CONTRADICTS")) return "DISPUTED";
  if (isStale(input.collectedAt, input.provider)) return "STALE";
  if (input.provider === "FOUNDER_PROVIDED") return "FOUNDER_PROVIDED";
  if (input.provider === "USER_SUBMITTED") return "SELF_ASSERTED";

  const authoritative = ["GITHUB_API", "ONCHAIN_RPC", "MARKET_API"];
  const selfAsserting = ["WEBSITE"];

  const supportLinks = input.links.filter((l) => l.relation === "SUPPORTS" || l.relation === "NEUTRAL");
  if (authoritative.includes(input.provider)) {
    // Independent corroboration: supported by another authoritative provider of a different type
    const corroborated = supportLinks.some(
      (l) => authoritative.includes(l.otherProvider) && l.otherSourceType !== input.sourceType
    );
    return corroborated ? "INDEPENDENTLY_CORROBORATED" : "SOURCE_CONFIRMED";
  }
  if (selfAsserting.includes(input.provider)) return "SELF_ASSERTED";
  return "UNKNOWN";
}

/**
 * Recomputes verification for all evidence of an entity and claim statuses.
 * Called after every evidence mutation. Corrections create NEW records;
 * originals are never mutated (only their computed classification).
 */
export async function recomputeVerification(entityType: string, entityId: string): Promise<void> {
  const sources = await db.evidenceSource.findMany({
    where: { entityType, entityId },
    include: { claimLinks: true },
  });

  for (const source of sources) {
    const links = source.claimLinks.map((l) => ({ relation: l.relation, otherProvider: "", otherSourceType: "" }));
    const cls = classifySource({
      provider: source.provider,
      sourceType: source.sourceType,
      collectedAt: source.collectedAt,
      links,
    });
    if (cls !== source.verification) {
      await db.evidenceSource.update({ where: { id: source.id }, data: { verification: cls } });
    }
  }

  // Claim statuses derive from linked evidence
  if (entityType === "VENTURE" || entityType === "FOUNDER") {
    const claimIds = (
      await db.claimEvidenceLink.findMany({
        where: { evidence: { entityType, entityId } },
        select: { claimId: true },
        distinct: ["claimId"],
      })
    ).map((c) => c.claimId);
    for (const claimId of claimIds) {
      await recomputeClaimStatus(claimId);
    }
  }
}

/**
 * Canonical claims: a statement about a given subject exists ONCE in the graph.
 * Collectors re-run frequently — without canonicalization every re-run would
 * spawn a duplicate claim row for the same real-world assertion, inflating the
 * dossier and splitting evidence across copies. This returns the existing
 * canonical claim when the statement already exists, creating it only once.
 */
export async function getOrCreateCanonicalClaim(data: {
  ventureId: string | null;
  subjectType: string;
  subjectId: string | null;
  statement: string;
  category?: string;
  origin?: string;
  status?: string;
}): Promise<{ id: string; created: boolean }> {
  const existing = await db.claim.findFirst({
    where: {
      ventureId: data.ventureId,
      subjectType: data.subjectType,
      subjectId: data.subjectId,
      statement: data.statement,
      origin: data.origin ?? "SELF_ASSERTED",
    },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return { id: existing.id, created: false };
  const claim = await db.claim.create({
    data: {
      ventureId: data.ventureId,
      subjectType: data.subjectType,
      subjectId: data.subjectId,
      statement: data.statement,
      category: data.category ?? "GENERAL",
      origin: data.origin ?? "SELF_ASSERTED",
      status: data.status ?? "UNVERIFIED",
    },
  });
  return { id: claim.id, created: true };
}

export async function recomputeClaimStatus(claimId: string): Promise<void> {
  const claim = await db.claim.findUnique({ where: { id: claimId } });
  if (!claim) return;
  const links = await db.claimEvidenceLink.findMany({
    where: { claimId },
    include: { evidence: true },
  });
  if (links.length === 0) {
    await db.claim.update({ where: { id: claimId }, data: { status: "UNVERIFIED" } });
    return;
  }
  const contradicted = links.some((l) => l.relation === "CONTRADICTS" && !isStale(l.evidence.collectedAt, l.evidence.provider));
  const supported = links.filter((l) => l.relation === "SUPPORTS");
  if (contradicted) {
    await db.claim.update({ where: { id: claimId }, data: { status: "CONTRADICTED" } });
    return;
  }
  if (supported.length === 0) {
    await db.claim.update({ where: { id: claimId }, data: { status: "UNVERIFIED" } });
    return;
  }
  const authoritativeSupport = supported.some(
    (l) => ["GITHUB_API", "ONCHAIN_RPC", "MARKET_API"].includes(l.evidence.provider)
  );
  const multipleSources = new Set(supported.map((l) => l.evidence.provider)).size >= 2;
  if (authoritativeSupport && multipleSources) {
    await db.claim.update({ where: { id: claimId }, data: { status: "SUPPORTED" } });
  } else if (authoritativeSupport) {
    await db.claim.update({ where: { id: claimId }, data: { status: "SUPPORTED" } });
  } else {
    await db.claim.update({ where: { id: claimId }, data: { status: "UNVERIFIED" } });
  }
}

export interface CreateEvidenceInput {
  ventureId?: string | null;
  entityType: string;
  entityId?: string;
  claimId?: string;
  url?: string | null;
  provider: string;
  sourceType: string;
  title?: string;
  payload: unknown;
  observationTime?: Date;
  relation?: "SUPPORTS" | "CONTRADICTS" | "NEUTRAL";
}

/**
 * Persists an immutable evidence source + snapshot (content-hashed) and
 * optionally links to a claim. Returns the evidence source id.
 */
export async function recordEvidence(input: CreateEvidenceInput): Promise<string> {
  const payloadJson = JSON.stringify(input.payload);
  const contentHash = createHash("sha256").update(payloadJson).digest("hex");

  const source = await db.evidenceSource.create({
    data: {
      ventureId: input.ventureId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      claimId: input.claimId ?? null,
      url: input.url ?? null,
      provider: input.provider,
      sourceType: input.sourceType,
      title: input.title,
      contentHash,
      collectorVersion: COLLECTOR_VERSION,
      observationTime: input.observationTime ?? new Date(),
      verification: "UNKNOWN",
    },
  });

  await db.evidenceSnapshot.create({
    data: { sourceId: source.id, payload: payloadJson, contentHash, sizeBytes: Buffer.byteLength(payloadJson) },
  });

  if (input.claimId) {
    await db.claimEvidenceLink.create({
      data: {
        claimId: input.claimId,
        evidenceId: source.id,
        relation: input.relation ?? "SUPPORTS",
      },
    }).catch(async () => {
      // idempotent: ignore unique violations on re-collection
    });
  }

  await recomputeVerification(input.entityType, input.entityId ?? "");
  if (input.claimId) await recomputeClaimStatus(input.claimId);
  return source.id;
}

/** Change intelligence: compares two snapshot payloads. */
export function diffSnapshots(a: unknown, b: unknown): Array<{ field: string; before: unknown; after: unknown }> {
  const changes: Array<{ field: string; before: unknown; after: unknown }> = [];
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    if (JSON.stringify(a) !== JSON.stringify(b)) changes.push({ field: "value", before: a, after: b });
    return changes;
  }
  const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
  for (const k of keys) {
    const va = (a as Record<string, unknown>)[k];
    const vb = (b as Record<string, unknown>)[k];
    if (JSON.stringify(va) !== JSON.stringify(vb)) changes.push({ field: k, before: va, after: vb });
  }
  return changes;
}
