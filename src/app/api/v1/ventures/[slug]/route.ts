import { handler, ok, ApiHttpError } from "@/lib/contracts/http";
import { requireAuth } from "@/lib/auth/context";
import { db } from "@/lib/db";

export const GET = handler(async ({ requestId, req }) => {
  await requireAuth();
  const slug = req.nextUrl.pathname.split("/")[4]; // /api/v1/ventures/{slug}
  const venture = await db.venture.findFirst({
    where: { slug, visibility: "PUBLIC" },
    include: {
      identities: true,
      founderLinks: { include: { founder: { include: { identityLinks: true, passportEvents: { orderBy: { occurredAt: "desc" }, take: 30 } } } } },
      repositories: {
        include: {
          observations: { orderBy: { collectedAt: "desc" }, take: 5 },
          contributors: { orderBy: [{ collectedAt: "desc" }, { contributions: "desc" }], take: 12 },
          releases: { orderBy: { publishedAt: "desc" }, take: 10 },
          commitSamples: { orderBy: { committedAt: "desc" }, take: 15 },
        },
      },
      products: true,
      tokenAssets: true,
      walletAssoc: true,
      claims: { include: { evidenceLinks: { include: { evidence: true } } } },
      onchainObs: { orderBy: { observationTime: "desc" }, take: 20 },
      marketSnapshots: { orderBy: { asOf: "desc" }, take: 30 },
      historyEvents: { orderBy: { observedAt: "desc" }, take: 60 },
      disputes: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!venture) throw new ApiHttpError("NOT_FOUND", "Venture not found.", false);

  const evidenceCount = await db.evidenceSource.count({ where: { ventureId: venture.id } });
  const researchRuns = await db.researchRun.findMany({
    where: { ventureId: venture.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { report: true },
  });

  return {
    payload: ok(
      {
        venture: {
          id: venture.id,
          slug: venture.slug,
          name: venture.name,
          tagline: venture.tagline,
          description: venture.description,
          category: venture.category,
          ecosystem: venture.ecosystem,
          status: venture.status,
          website: venture.website,
          createdAt: venture.createdAt.toISOString(),
          updatedAt: venture.updatedAt.toISOString(),
        },
        identities: venture.identities,
        founders: venture.founderLinks.map((fl) => ({
          linkId: fl.id,
          role: fl.role,
          attribution: fl.attribution,
          founder: {
            id: fl.founder.id,
            displayName: fl.founder.displayName,
            bio: fl.founder.bio,
            identityLinks: fl.founder.identityLinks,
            passportEvents: fl.founder.passportEvents.map((pe) => ({ ...pe, occurredAt: pe.occurredAt?.toISOString() ?? null, createdAt: pe.createdAt.toISOString() })),
          },
        })),
        repositories: venture.repositories.map((r) => ({
          id: r.id,
          owner: r.owner,
          name: r.name,
          url: r.url,
          association: r.association,
          latest: r.observations[0]
            ? {
                stars: r.observations[0].stars,
                forks: r.observations[0].forks,
                openIssues: r.observations[0].openIssues,
                pushedAt: r.observations[0].pushedAt?.toISOString() ?? null,
                primaryLanguage: r.observations[0].primaryLanguage,
                description: r.observations[0].description,
                archived: r.observations[0].archived,
                collectedAt: r.observations[0].collectedAt.toISOString(),
              }
            : null,
          observationCount: r.observations.length,
          contributors: r.contributors.slice(0, 10).map((c) => ({
            login: c.login,
            accountType: c.accountType,
            repoRole: c.repoRole,
            contributions: c.contributions,
          })),
          releases: r.releases.map((rel) => ({
            tagName: rel.tagName,
            name: rel.name,
            publishedAt: rel.publishedAt?.toISOString() ?? null,
            prerelease: rel.prerelease,
            url: rel.url,
          })),
          commits: r.commitSamples.map((c) => ({
            sha: c.sha.slice(0, 7),
            authorLogin: c.authorLogin,
            message: c.message,
            committedAt: c.committedAt?.toISOString() ?? null,
          })),
        })),
        products: venture.products,
        claims: venture.claims.map((c) => ({
          id: c.id,
          statement: c.statement,
          category: c.category,
          status: c.status,
          origin: c.origin,
          evidence: c.evidenceLinks.map((l) => ({
            id: l.evidence.id,
            relation: l.relation,
            provider: l.evidence.provider,
            sourceType: l.evidence.sourceType,
            url: l.evidence.url,
            verification: l.evidence.verification,
            collectedAt: l.evidence.collectedAt.toISOString(),
          })),
        })),
        tokenAssets: venture.tokenAssets,
        walletAssoc: venture.walletAssoc,
        onchainObservations: venture.onchainObs.map((o) => ({
          id: o.id,
          kind: o.kind,
          payload: JSON.parse(String(o.payload)),
          slot: o.slot?.toString() ?? null,
          dataSources: JSON.parse(String(o.dataSources)),
          observationTime: o.observationTime.toISOString(),
          providerLimitations: o.providerLimitations,
        })),
        marketSnapshots: venture.marketSnapshots.map((m) => ({
          id: m.id,
          priceUsd: m.priceUsd,
          liquidityUsd: m.liquidityUsd,
          priceChange24h: m.priceChange24h,
          provider: m.provider,
          asOf: m.asOf.toISOString(),
        })),
        history: venture.historyEvents.map((h) => ({ kind: h.kind, summary: h.summary, observedAt: h.observedAt.toISOString() })),
        disputes: venture.disputes,
        evidenceCount,
        research: researchRuns.map((rr) => ({
          id: rr.id,
          question: rr.question,
          status: rr.status,
          createdAt: rr.createdAt.toISOString(),
          report: rr.report
            ? {
                id: rr.report.id,
                title: rr.report.title,
                validationStatus: rr.report.validationStatus,
                createdAt: rr.report.createdAt.toISOString(),
              }
            : null,
        })),
      },
      requestId
    ),
  };
});
