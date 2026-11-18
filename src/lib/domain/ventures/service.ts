// Venture registry domain service. No fabricated data — the registry grows
// only through real ingestion or admin entry.

import { db } from "@/lib/db";
import { slugifyVenture } from "@/lib/domain/shared/slug";
import { recordAudit } from "@/lib/domain/shared/audit";
import { recordEvidence, getOrCreateCanonicalClaim } from "@/lib/domain/evidence/engine";
import { enqueue } from "@/lib/jobs/queue";
import { isValidSolanaAddress } from "@/lib/providers/solana";
import { ApiHttpError } from "@/lib/contracts/http";
import { z } from "zod";

export const VENTURE_CATEGORIES = ["DEFI", "INFRA", "DEVTOOLS", "PAYMENTS", "CONSUMER", "GAMING", "RWA", "OTHER"] as const;

export const CreateVentureSchema = z.object({
  name: z.string().min(2).max(120),
  tagline: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  category: z.enum(VENTURE_CATEGORIES).default("OTHER"),
  websiteUrl: z.string().url().max(500).optional().or(z.literal("")),
  githubOrgUrl: z.string().url().max(500).optional().or(z.literal("")),
  githubRepoUrl: z.string().url().max(500).optional().or(z.literal("")),
  xHandle: z.string().max(80).optional().or(z.literal("")),
  mint: z.string().max(64).optional().or(z.literal("")),
});

export function parseGithubEntity(urlStr: string): { kind: "ORG" | "REPO"; owner: string; repo?: string; orgId: string } | null {
  try {
    const u = new URL(urlStr);
    if (u.hostname !== "github.com" && u.hostname !== "www.github.com") return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return null;
    const owner = parts[0].replace(/^@/, "");
    if (!owner) return null;
    if (parts.length >= 2 && parts[1] && parts[1] !== "orgs" && parts[1] !== "repositories") {
      return { kind: "REPO", owner, repo: parts[1].replace(/\.git$/, ""), orgId: owner };
    }
    return { kind: "ORG", owner, orgId: owner };
  } catch {
    return null;
  }
}

export function normalizeWebsite(urlStr: string): { domain: string; url: string } | null {
  try {
    const u = new URL(urlStr.startsWith("http") ? urlStr : `https://${urlStr}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const domain = u.hostname.replace(/^www\./, "").toLowerCase();
    if (!domain.includes(".")) return null;
    if (["localhost", "127.0.0.1", "0.0.0.0", "169.254.169.254"].includes(domain)) return null;
    return { domain, url: `https://${domain}` };
  } catch {
    return null;
  }
}

export interface CreateVentureResult {
  ventureId: string;
  slug: string;
  jobs: string[];
  identities: Array<{ type: string; externalId: string }>;
  /** true when a venture with the same normalized website identity already existed */
  existing: boolean;
}

/** Attach an identity to a venture if it does not already carry it. Returns true when newly attached. */
async function attachIdentityIfMissing(
  ventureId: string,
  identityType: string,
  externalId: string,
  url: string
): Promise<boolean> {
  const clash = await db.ventureIdentity.findUnique({
    where: { ventureId_identityType_externalId: { ventureId, identityType, externalId } },
  });
  if (clash) return false;
  await db.ventureIdentity.create({
    data: { ventureId, identityType, externalId, url, confidence: "SELF_ASSERTED" },
  });
  return true;
}

export async function createVenture(input: unknown, actorId: string): Promise<CreateVentureResult> {
  const parsed = CreateVentureSchema.parse(input);
  const name = parsed.name.trim();

  const website = parsed.websiteUrl ? normalizeWebsite(parsed.websiteUrl) : null;
  if (parsed.websiteUrl && !website) {
    throw new ApiHttpError("BAD_REQUEST", "Website URL could not be normalized.", false);
  }
  const ghOrg = parsed.githubOrgUrl ? parseGithubEntity(parsed.githubOrgUrl) : null;
  const ghRepo = parsed.githubRepoUrl ? parseGithubEntity(parsed.githubRepoUrl) : null;
  if (parsed.githubOrgUrl && (!ghOrg || ghOrg.kind !== "ORG")) {
    throw new ApiHttpError("BAD_REQUEST", "GitHub organization URL must be https://github.com/<org>.", false);
  }
  if (parsed.githubRepoUrl && (!ghRepo || ghRepo.kind !== "REPO")) {
    throw new ApiHttpError("BAD_REQUEST", "GitHub repository URL must be https://github.com/<owner>/<repo>.", false);
  }
  if (parsed.mint && !isValidSolanaAddress(parsed.mint)) {
    throw new ApiHttpError("BAD_REQUEST", "Token mint is not a valid Solana address.", false);
  }

  // ─── Identity dedup: one website = one venture. ───
  // The evidence graph must never fragment across duplicate rows for the same
  // real-world project, so a submission whose normalized website domain already
  // exists resolves to the existing venture (missing identities are attached
  // there, audit-logged) instead of creating a duplicate.
  if (website) {
    const existing = await db.venture.findUnique({ where: { websiteKey: website.domain } });
    if (existing) {
      const jobs: string[] = [];
      const identities: Array<{ type: string; externalId: string }> = [];
      const attached: string[] = [];

      if (website && (await attachIdentityIfMissing(existing.id, "WEBSITE", website.domain, website.url))) {
        attached.push("WEBSITE");
      }
      if (ghOrg && (await attachIdentityIfMissing(existing.id, "GITHUB_ORG", ghOrg.owner, `https://github.com/${ghOrg.owner}`))) {
        attached.push("GITHUB_ORG");
        identities.push({ type: "GITHUB_ORG", externalId: ghOrg.owner });
        jobs.push(
          await enqueue({
            kind: "collect_github_org",
            idempotencyKey: `collect_gh_org:${existing.id}:${ghOrg.owner}:${Date.now()}`,
            payload: { ventureId: existing.id, org: ghOrg.owner, maxRepos: 3 },
          })
        );
      }
      if (ghRepo && (await attachIdentityIfMissing(existing.id, "GITHUB_REPO", `${ghRepo.owner}/${ghRepo.repo}`, `https://github.com/${ghRepo.owner}/${ghRepo.repo}`))) {
        attached.push("GITHUB_REPO");
        identities.push({ type: "GITHUB_REPO", externalId: `${ghRepo.owner}/${ghRepo.repo}` });
        jobs.push(
          await enqueue({
            kind: "collect_github_repo",
            idempotencyKey: `collect_gh_repo:${existing.id}:${ghRepo.owner}/${ghRepo.repo}:${Date.now()}`,
            payload: { ventureId: existing.id, owner: ghRepo.owner, repo: ghRepo.repo },
          })
        );
      }
      if (parsed.xHandle) {
        const xId = parsed.xHandle.replace(/^@/, "");
        if (await attachIdentityIfMissing(existing.id, "X", xId, `https://x.com/${xId}`)) {
          attached.push("X");
          identities.push({ type: "X", externalId: xId });
        }
      }
      if (parsed.mint) {
        // Mint is globally unique; reassign to this venture if already registered
        await db.tokenAsset.upsert({
          where: { mint: parsed.mint },
          create: { ventureId: existing.id, mint: parsed.mint, association: "CLAIMED" },
          update: { ventureId: existing.id },
        });
        identities.push({ type: "MINT", externalId: parsed.mint });
      }

      await db.ventureHistoryEvent.create({
        data: {
          ventureId: existing.id,
          kind: "IDENTITY_ATTACHED",
          summary: attached.length
            ? `Researcher re-submission matched this venture by website; attached identities: ${attached.join(", ")}`
            : "Researcher re-submission matched this venture by website (no new identities)",
        },
      });
      await recordAudit({
        actorId,
        action: "VENTURE_DEDUP_MATCH",
        targetType: "VENTURE",
        targetId: existing.id,
        summary: `Submission for ${website.domain} resolved to existing venture ${existing.name}${attached.length ? `; attached ${attached.join(", ")}` : " (no new identities)"}`,
      });

      return { ventureId: existing.id, slug: existing.slug, jobs, identities, existing: true };
    }
  }

  // Unique slug with collision suffix
  let slug = slugifyVenture(name);
  const clash = await db.venture.findUnique({ where: { slug } });
  if (clash) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

  const venture = await db.venture.create({
    data: {
      name,
      slug,
      tagline: parsed.tagline?.trim() || null,
      description: parsed.description?.trim() || null,
      category: parsed.category,
      website: website?.url ?? null,
      websiteKey: website?.domain ?? null,
      createdById: actorId,
      source: "USER_SUBMITTED",
    },
  });

  const identities: Array<{ type: string; externalId: string }> = [];
  if (website) {
    await db.ventureIdentity.create({
      data: { ventureId: venture.id, identityType: "WEBSITE", externalId: website.domain, url: website.url, confidence: "SELF_ASSERTED" },
    });
    identities.push({ type: "WEBSITE", externalId: website.domain });
  }
  if (ghOrg) {
    await db.ventureIdentity.create({
      data: { ventureId: venture.id, identityType: "GITHUB_ORG", externalId: ghOrg.owner, url: `https://github.com/${ghOrg.owner}`, confidence: "SELF_ASSERTED" },
    });
    identities.push({ type: "GITHUB_ORG", externalId: ghOrg.owner });
  }
  if (ghRepo) {
    await db.ventureIdentity.create({
      data: { ventureId: venture.id, identityType: "GITHUB_REPO", externalId: `${ghRepo.owner}/${ghRepo.repo}`, url: `https://github.com/${ghRepo.owner}/${ghRepo.repo}`, confidence: "SELF_ASSERTED" },
    });
    identities.push({ type: "GITHUB_REPO", externalId: `${ghRepo.owner}/${ghRepo.repo}` });
  }
  if (parsed.xHandle) {
    await db.ventureIdentity.create({
      data: { ventureId: venture.id, identityType: "X", externalId: parsed.xHandle.replace(/^@/, ""), url: `https://x.com/${parsed.xHandle.replace(/^@/, "")}`, confidence: "SELF_ASSERTED" },
    });
    identities.push({ type: "X", externalId: parsed.xHandle.replace(/^@/, "") });
  }

  // Canonical identity claim (self-asserted at intake, upgraded only by evidence)
  const claimResult = await getOrCreateCanonicalClaim({
    ventureId: venture.id,
    subjectType: "VENTURE",
    subjectId: venture.id,
    statement: `${name} operates the website ${website?.url ?? parsed.websiteUrl ?? "not provided"}`,
    category: "IDENTITY",
    origin: "SELF_ASSERTED",
  });
  const claim = { id: claimResult.id };

  const jobs: string[] = [];

  if (website) {
    jobs.push(
      await enqueue({
        kind: "collect_website",
        idempotencyKey: `collect_website:${venture.id}:${website.domain}:${Date.now()}`,
        payload: { ventureId: venture.id, url: website.url, claimId: claim.id },
      })
    );
  }
  if (ghRepo) {
    jobs.push(
      await enqueue({
        kind: "collect_github_repo",
        idempotencyKey: `collect_gh_repo:${venture.id}:${ghRepo.owner}/${ghRepo.repo}:${Date.now()}`,
        payload: { ventureId: venture.id, owner: ghRepo.owner, repo: ghRepo.repo },
      })
    );
  } else if (ghOrg) {
    jobs.push(
      await enqueue({
        kind: "collect_github_org",
        idempotencyKey: `collect_gh_org:${venture.id}:${ghOrg.owner}:${Date.now()}`,
        payload: { ventureId: venture.id, org: ghOrg.owner, maxRepos: 3 },
      })
    );
  }
  if (parsed.mint) {
    // Mint is globally unique; reassign to this venture if already registered
    await db.tokenAsset.upsert({
      where: { mint: parsed.mint },
      create: { ventureId: venture.id, mint: parsed.mint, association: "CLAIMED" },
      update: { ventureId: venture.id },
    });
    jobs.push(
      await enqueue({
        kind: "collect_solana_mint",
        idempotencyKey: `collect_sol_mint:${venture.id}:${parsed.mint}:${Date.now()}`,
        payload: { ventureId: venture.id, mint: parsed.mint },
      })
    );
    jobs.push(
      await enqueue({
        kind: "collect_market_snapshot",
        idempotencyKey: `market_snap:${venture.id}:${parsed.mint}:${Date.now()}`,
        payload: { ventureId: venture.id, mint: parsed.mint },
      })
    );
  }

  await db.ventureHistoryEvent.create({
    data: { ventureId: venture.id, kind: "CREATED", summary: `Venture registered by researcher intake (${identities.length} identity links queued for collection)` },
  });

  await recordEvidence({
    ventureId: venture.id,
    entityType: "VENTURE",
    entityId: venture.id,
    provider: "USER_SUBMITTED",
    sourceType: "INTAKE",
    title: "Researcher intake submission",
    payload: { name, category: parsed.category, website: website?.url, githubOrg: ghOrg?.owner, githubRepo: ghRepo ? `${ghRepo.owner}/${ghRepo.repo}` : null, x: parsed.xHandle, mint: parsed.mint },
    claimId: claim.id,
    relation: "SUPPORTS",
  });

  await recordAudit({ actorId, action: "VENTURE_CREATE", targetType: "VENTURE", targetId: venture.id, summary: `Registered venture ${name}` });

  return { ventureId: venture.id, slug, jobs, identities, existing: false };
}

export interface ListVenturesParams {
  q?: string;
  category?: string;
  status?: string;
  ecosystem?: string;
  hasToken?: boolean;
  hasRepo?: boolean;
  sort?: "RECENT" | "NAME" | "ACTIVITY";
  cursor?: number;
  limit?: number;
}

export async function listVentures(params: ListVenturesParams) {
  const limit = Math.min(Math.max(params.limit ?? 24, 1), 60);
  const offset = params.cursor ?? 0;

  const where: Record<string, unknown> = { visibility: "PUBLIC" };
  if (params.category && params.category !== "ALL") where.category = params.category;
  if (params.status && params.status !== "ALL") where.status = params.status;
  if (params.ecosystem && params.ecosystem !== "ALL") where.ecosystem = params.ecosystem;
  if (params.q) {
    where.OR = [
      { name: { contains: params.q } },
      { tagline: { contains: params.q } },
      { description: { contains: params.q } },
    ];
  }
  if (params.hasRepo) where.repositories = { some: {} };
  if (params.hasToken) where.tokenAssets = { some: {} };

  const orderBy =
    params.sort === "NAME" ? { name: "asc" as const } :
    params.sort === "ACTIVITY" ? { updatedAt: "desc" as const } :
    { createdAt: "desc" as const };

  const [ventures, total] = await Promise.all([
    db.venture.findMany({
      where,
      orderBy,
      skip: offset,
      take: limit + 1,
      include: {
        _count: { select: { repositories: true, tokenAssets: true, evidence: true, claims: true } },
        identities: { where: { identityType: "WEBSITE" }, take: 1 },
      },
    }),
    db.venture.count({ where }),
  ]);

  const hasMore = ventures.length > limit;
  const page = ventures.slice(0, limit).map((v) => ({
    id: v.id,
    slug: v.slug,
    name: v.name,
    tagline: v.tagline,
    category: v.category,
    ecosystem: v.ecosystem,
    status: v.status,
    source: v.source,
    website: v.website,
    repoCount: v._count.repositories,
    tokenCount: v._count.tokenAssets,
    evidenceCount: v._count.evidence,
    claimCount: v._count.claims,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  }));

  return { items: page, total, nextCursor: hasMore ? offset + limit : undefined };
}

export async function getVentureBySlug(slug: string) {
  return db.venture.findUnique({
    where: { slug },
    include: {
      identities: true,
      founderLinks: { include: { founder: true } },
      repositories: { include: { observations: { orderBy: { collectedAt: "desc" }, take: 1 }, contributors: { orderBy: [{ collectedAt: "desc" }, { contributions: "desc" }] , take: 12 }, releases: { orderBy: { publishedAt: "desc" }, take: 10 }, commitSamples: { orderBy: { committedAt: "desc" }, take: 15 } } },
      products: true,
      tokenAssets: true,
      walletAssoc: true,
      claims: { include: { evidenceLinks: { include: { evidence: true } } } },
      onchainObs: { orderBy: { observationTime: "desc" }, take: 20 },
      marketSnapshots: { orderBy: { asOf: "desc" }, take: 30 },
      historyEvents: { orderBy: { observedAt: "desc" }, take: 50 },
      disputes: true,
    },
  });
}

export async function getVentureEvidence(ventureId: string) {
  return db.evidenceSource.findMany({
    where: { ventureId },
    orderBy: { collectedAt: "desc" },
    take: 100,
    include: { snapshots: { orderBy: { fetchedAt: "desc" }, take: 1 } },
  });
}
