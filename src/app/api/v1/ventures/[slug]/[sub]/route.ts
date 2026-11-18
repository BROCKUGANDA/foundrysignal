import { NextRequest } from "next/server";
import { handler, ok, ApiHttpError } from "@/lib/contracts/http";
import { requireAuth, requireWorkspaceRole } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { getVentureEvidence } from "@/lib/domain/ventures/service";
import { enqueue } from "@/lib/jobs/queue";
import { isValidSolanaAddress } from "@/lib/providers/solana";
import { slugifyFounder } from "@/lib/domain/shared/slug";
import { recordEvidence, getOrCreateCanonicalClaim } from "@/lib/domain/evidence/engine";
import { recordAudit } from "@/lib/domain/shared/audit";
import { z } from "zod";

const AttachFounderSchema = z.object({
  displayName: z.string().min(2).max(120),
  role: z.enum(["FOUNDER", "CO_FOUNDER", "CORE_CONTRIBUTOR", "ADVISOR"]).default("FOUNDER"),
  bio: z.string().max(1000).optional(),
  claimedGithub: z.string().max(80).optional(),
  claimedX: z.string().max(80).optional(),
  sourceUrl: z.string().url().max(500).optional().or(z.literal("")),
});

export const GET = handler(async ({ req, requestId }) => {
  await requireAuth();
  const parts = req.nextUrl.pathname.split("/"); // /api/v1/ventures/{slug}/{sub}
  const slug = parts[4];
  const sub = parts[5];
  const venture = await db.venture.findUnique({ where: { slug } });
  if (!venture) throw new ApiHttpError("NOT_FOUND", "Venture not found.", false);

  if (sub === "evidence") {
    const rows = await getVentureEvidence(venture.id);
    return {
      payload: ok(
        rows.map((e) => ({
          id: e.id,
          provider: e.provider,
          sourceType: e.sourceType,
          url: e.url,
          title: e.title,
          verification: e.verification,
          collectedAt: e.collectedAt.toISOString(),
          observationTime: e.observationTime?.toISOString() ?? null,
          contentHash: e.contentHash,
          collectorVersion: e.collectorVersion,
          transformationVersion: e.transformationVersion,
          snapshotSize: e.snapshots[0]?.sizeBytes ?? null,
          payload: e.snapshots[0] ? safeParse(e.snapshots[0].payload) : null,
        })),
        requestId
      ),
    };
  }

  if (sub === "watchlists") {
    // Return workspace watchlists containing this venture
    const ctx = await requireAuth();
    const items = await db.watchlistItem.findMany({
      where: { ventureId: venture.id, watchlist: { workspaceId: ctx.workspaceId } },
      include: { watchlist: true },
    });
    return { payload: ok(items.map((i) => ({ watchlistId: i.watchlist.id, watchlistName: i.watchlist.name, addedAt: i.createdAt.toISOString() })), requestId) };
  }

  throw new ApiHttpError("NOT_FOUND", "Unknown venture sub-resource.", false);
});

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export const POST = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();
  requireWorkspaceRole(ctx, "ANALYST"); // write actions need ANALYST+
  const parts = req.nextUrl.pathname.split("/");
  const slug = parts[4];
  const sub = parts[5];
  const venture = await db.venture.findUnique({ where: { slug } });
  if (!venture) throw new ApiHttpError("NOT_FOUND", "Venture not found.", false);
  const body = await req.json().catch(() => ({}));

  if (sub === "founders") {
    // Founder attribution is explicitly recorded, never inferred.
    const parsed = AttachFounderSchema.parse(body);
    let founder = parsed.claimedGithub
      ? await db.founder.findFirst({ where: { identityLinks: { some: { identityType: "GITHUB", externalId: parsed.claimedGithub } } } })
      : null;
    if (!founder) {
      founder = await db.founder.create({
        data: {
          displayName: parsed.displayName,
          slug: `${slugifyFounder(parsed.displayName)}-${Date.now().toString(36).slice(-5)}`,
          bio: parsed.bio,
        },
      });
    }
    if (parsed.claimedGithub) {
      await db.identityLink.upsert({
        where: { founderId_identityType_externalId: { founderId: founder.id, identityType: "GITHUB", externalId: parsed.claimedGithub } },
        create: { founderId: founder.id, identityType: "GITHUB", externalId: parsed.claimedGithub, url: `https://github.com/${parsed.claimedGithub}`, claimedBy: "USER_SUBMITTED", confidence: "SELF_ASSERTED" },
        update: { claimedBy: "USER_SUBMITTED" },
      });
    }
    if (parsed.claimedX) {
      await db.identityLink.upsert({
        where: { founderId_identityType_externalId: { founderId: founder.id, identityType: "X", externalId: parsed.claimedX } },
        create: { founderId: founder.id, identityType: "X", externalId: parsed.claimedX, url: `https://x.com/${parsed.claimedX}`, claimedBy: "USER_SUBMITTED", confidence: "SELF_ASSERTED" },
        update: {},
      });
    }
    const link = await db.ventureFounderLink.upsert({
      where: { ventureId_founderId_role: { ventureId: venture.id, founderId: founder.id, role: parsed.role } },
      create: { ventureId: venture.id, founderId: founder.id, role: parsed.role, attribution: "SELF_ASSERTED" },
      update: {},
    });

    // Canonical claim: re-attributing the same founder + role reuses the row
    const claimResult = await getOrCreateCanonicalClaim({
      ventureId: venture.id,
      subjectType: "FOUNDER",
      subjectId: founder.id,
      statement: `${parsed.displayName} is recorded as ${parsed.role.replace("_", " ").toLowerCase()} (researcher attribution, unverified)`,
      category: "IDENTITY",
      origin: "SELF_ASSERTED",
    });
    const claim = { id: claimResult.id };
    await recordEvidence({
      ventureId: venture.id,
      entityType: "VENTURE",
      entityId: venture.id,
      claimId: claim.id,
      url: parsed.sourceUrl || null,
      provider: "USER_SUBMITTED",
      sourceType: "FOUNDER_ATTRIBUTION",
      title: `Researcher attribution: ${parsed.displayName} as ${parsed.role}`,
      payload: { displayName: parsed.displayName, role: parsed.role, claimedGithub: parsed.claimedGithub ?? null, claimedX: parsed.claimedX ?? null, sourceUrl: parsed.sourceUrl || null },
    });
    await db.ventureHistoryEvent.create({
      data: { ventureId: venture.id, kind: "IDENTITY_LINKED", summary: `${parsed.displayName} attributed as ${parsed.role} (SELF_ASSERTED)` },
    });
    await recordAudit({ actorId: ctx.userId, action: "FOUNDER_ATTRIBUTE", targetType: "VENTURE", targetId: venture.id, summary: `${parsed.displayName} as ${parsed.role}` });
    return { payload: ok({ founderId: founder.id, linkId: link.id, attribution: "SELF_ASSERTED" }, requestId), status: 201 };
  }

  if (sub === "token") {
    const parsed = z.object({ mint: z.string().min(32).max(64) }).parse(body);
    if (!isValidSolanaAddress(parsed.mint)) {
      throw new ApiHttpError("BAD_REQUEST", "Not a valid Solana address.", false);
    }
    const tokenAsset = await db.tokenAsset.upsert({
      where: { mint: parsed.mint },
      create: { ventureId: venture.id, mint: parsed.mint, association: "CLAIMED" },
      update: { ventureId: venture.id },
    });
    const jobs: string[] = [];
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
    await db.ventureHistoryEvent.create({ data: { ventureId: venture.id, kind: "TOKEN_ASSOCIATED", summary: `Token ${parsed.mint} associated (claimed)` } });
    return { payload: ok({ tokenAssetId: tokenAsset.id, jobs }, requestId), status: 202 };
  }

  if (sub === "refresh") {
    // Re-collection: website + repos + mint + market
    const jobs: string[] = [];
    if (venture.website) {
      jobs.push(
        await enqueue({
          kind: "collect_website",
          idempotencyKey: `collect_website:${venture.id}:${Date.now()}`,
          payload: { ventureId: venture.id, url: venture.website },
        })
      );
    }
    const repos = await db.repository.findMany({ where: { ventureId: venture.id } });
    for (const r of repos) {
      jobs.push(
        await enqueue({
          kind: "collect_github_repo",
          idempotencyKey: `collect_gh_repo:${venture.id}:${r.owner}/${r.name}:${Date.now()}`,
          payload: { ventureId: venture.id, owner: r.owner, repo: r.name },
        })
      );
    }
    const tokens = await db.tokenAsset.findMany({ where: { ventureId: venture.id } });
    for (const t of tokens) {
      jobs.push(
        await enqueue({
          kind: "collect_solana_mint",
          idempotencyKey: `collect_sol_mint:${venture.id}:${t.mint}:${Date.now()}`,
          payload: { ventureId: venture.id, mint: t.mint },
        })
      );
      jobs.push(
        await enqueue({
          kind: "collect_market_snapshot",
          idempotencyKey: `market_snap:${venture.id}:${t.mint}:${Date.now()}`,
          payload: { ventureId: venture.id, mint: t.mint },
        })
      );
    }
    jobs.push(
      await enqueue({
        kind: "evaluate_alerts",
        idempotencyKey: `alerts:${venture.id}:${Date.now()}`,
        payload: { ventureId: venture.id },
      })
    );
    return { payload: ok({ queued: jobs.length, jobs }, requestId), status: 202 };
  }

  throw new ApiHttpError("NOT_FOUND", "Unknown venture action.", false);
});

export const DELETE = handler(async ({ req, requestId }) => {
  const ctx = await requireAuth();
  const parts = req.nextUrl.pathname.split("/");
  const slug = parts[4];
  const sub = parts[5];
  if (sub === "watchlists") {
    requireWorkspaceRole(ctx, "ANALYST");
    const venture = await db.venture.findUnique({ where: { slug } });
    if (!venture) throw new ApiHttpError("NOT_FOUND", "Venture not found.", false);
    const body = await req.json().catch(() => ({}));
    const watchlistId = String((body as Record<string, unknown>).watchlistId ?? "");
    // Tenant guard: the watchlist MUST belong to the caller's workspace —
    // cross-tenant deletion is rejected even when the id is guessed.
    const watchlist = await db.watchlist.findFirst({
      where: { id: watchlistId, workspaceId: ctx.workspaceId },
    });
    if (!watchlist) throw new ApiHttpError("NOT_FOUND", "Watchlist not found in this workspace.", false);
    await db.watchlistItem.deleteMany({ where: { watchlistId: watchlist.id, ventureId: venture.id } });
    return { payload: ok({ removed: true }, requestId) };
  }
  throw new ApiHttpError("NOT_FOUND", "Unknown delete action.", false);
});
