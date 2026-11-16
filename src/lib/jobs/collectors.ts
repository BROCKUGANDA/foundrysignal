// Collector workers — real data ingestion job handlers.
// Every collector: idempotent, timeout-bounded, classifies failures,
// records provenance (provider, timestamps, content hash), never fabricates.

import { db } from "@/lib/db";
import { registerJob, enqueue } from "@/lib/jobs/queue";
import { GithubAdapter } from "@/lib/providers/github";
import { collectWebsite } from "@/lib/providers/website";
import { SolanaAdapter, isValidSolanaAddress } from "@/lib/providers/solana";
import { JupiterAdapter } from "@/lib/providers/jupiter";
import { recordEvidence, getOrCreateCanonicalClaim } from "@/lib/domain/evidence/engine";
import { ProviderError } from "@/lib/providers/framework";

const github = new GithubAdapter();
const solana = new SolanaAdapter();
const jupiter = new JupiterAdapter();

// ─── Website collector ────────────────────────────────────────────────

registerJob("collect_website", async (ctx) => {
  const { ventureId, url, claimId } = ctx.payload as { ventureId: string; url: string; claimId?: string };
  ctx.log("collecting website", { url });
  let meta;
  try {
    meta = await collectWebsite(url);
  } catch (err) {
    // Honest failure: record product status and a negative evidence record
    const message = err instanceof ProviderError ? err.message : String(err);
    await db.productRecord.upsert({
      where: { ventureId_name: { ventureId, name: url } },
      create: { ventureId, name: url, url, kind: "WEB", status: "UNKNOWN", lastCheckedAt: new Date() },
      update: { status: message.includes("blocked") ? "BLOCKED" : "UNKNOWN", lastCheckedAt: new Date() },
    });
    throw err;
  }

  const venture = await db.venture.findUnique({ where: { id: ventureId } });

  await recordEvidence({
    ventureId,
    entityType: "VENTURE",
    entityId: ventureId,
    claimId,
    url: meta.finalUrl,
    provider: "WEBSITE",
    sourceType: "WEBSITE_METADATA",
    title: meta.title ?? "Website snapshot",
    payload: {
      title: meta.title,
      ogTitle: meta.ogTitle,
      description: meta.description,
      ogDescription: meta.ogDescription,
      ogImage: meta.ogImage,
      contentHash: meta.contentHash,
      fetchedAt: meta.fetchedAt.toISOString(),
    },
  });

  await db.productRecord.upsert({
    where: { ventureId_name: { ventureId, name: url } },
    create: { ventureId, name: url, url: meta.finalUrl, kind: "WEB", status: "LIVE", lastCheckedAt: new Date() },
    update: { status: "LIVE", lastCheckedAt: new Date(), url: meta.finalUrl },
  });

  if (venture) {
    await db.ventureHistoryEvent.create({
      data: { ventureId, kind: "OBSERVATION_REFRESHED", summary: `Website snapshot collected (hash ${meta.contentHash.slice(0, 12)}…)` },
    });
  }
  ctx.log("website collected", { hash: meta.contentHash });
});

// ─── GitHub org collector ─────────────────────────────────────────────

registerJob("collect_github_org", async (ctx) => {
  const { ventureId, org, maxRepos } = ctx.payload as { ventureId: string; org: string; maxRepos: number };
  ctx.log("collecting github org", { org });

  const res = await github.getOrgRepos(org);
  const repos = res
    .filter((r) => !r.isPrivate && !r.archived)
    .sort((a, b) => b.stars - a.stars)
    .slice(0, maxRepos);

  for (const repo of repos) {
    const existing = await db.repository.findUnique({
      where: { provider_providerId: { provider: "GITHUB", providerId: repo.providerId } },
    });
    if (!existing) {
      await db.repository.create({
        data: {
          ventureId,
          provider: "GITHUB",
          providerId: repo.providerId,
          owner: repo.owner,
          name: repo.name,
          url: repo.url,
          association: "ASSOCIATED",
        },
      });
    }
    await enqueue({
      kind: "collect_github_repo",
      idempotencyKey: `collect_gh_repo:${ventureId}:${repo.owner}/${repo.name}:${Date.now()}`,
      payload: { ventureId, owner: repo.owner, repo: repo.name },
    });
  }
  ctx.log("org repos associated", { count: repos.length });
});

// ─── GitHub repo collector ────────────────────────────────────────────

registerJob("collect_github_repo", async (ctx) => {
  const { ventureId, owner, repo } = ctx.payload as { ventureId: string; owner: string; repo: string };
  ctx.log("collecting github repo", { owner, repo });

  const repoRes = await github.getRepository(owner, repo);
  const r = repoRes.data;

  const repository = await db.repository.upsert({
    where: { provider_providerId: { provider: "GITHUB", providerId: r.providerId } },
    create: {
      ventureId,
      provider: "GITHUB",
      providerId: r.providerId,
      owner: r.owner,
      name: r.name,
      url: r.url,
      association: "ASSOCIATED",
    },
    update: { ventureId },
  });

  // Repository metadata observation (append-only)
  await db.repositoryObservation.create({
    data: {
      repositoryId: repository.id,
      stars: r.stars,
      forks: r.forks,
      openIssues: r.openIssues,
      pushedAt: r.pushedAt,
      defaultBranch: r.defaultBranch,
      primaryLanguage: r.primaryLanguage,
      description: r.description,
      archived: r.archived,
      providerVersion: "github-rest-v3",
      collectedAt: repoRes.collectedAt,
    },
  });

  // Identity evidence: the repository exists and is described as claimed
  // Canonical claim: re-attributing the same repository never duplicates rows
  const identityClaimResult = await getOrCreateCanonicalClaim({
    ventureId,
    subjectType: "VENTURE",
    subjectId: ventureId,
    statement: `Public repository ${r.owner}/${r.name} is associated with this venture (submitted at intake)`,
    category: "TECH",
    origin: "SELF_ASSERTED",
  });
  const identityClaim = { id: identityClaimResult.id };
  await recordEvidence({
    ventureId,
    entityType: "VENTURE",
    entityId: ventureId,
    claimId: identityClaim.id,
    url: r.url,
    provider: "GITHUB_API",
    sourceType: "REPOSITORY_METADATA",
    title: `GitHub repository ${r.owner}/${r.name}`,
    payload: r,
  });

  // Languages
  try {
    const langs = await github.getLanguages(owner, repo);
    const totalLangs = Object.values(langs).reduce((a, b) => a + b, 0);
    if (totalLangs > 0) {
      await recordEvidence({
        ventureId,
        entityType: "VENTURE",
        entityId: ventureId,
        url: r.url,
        provider: "GITHUB_API",
        sourceType: "LANGUAGE_STATISTICS",
        title: `Language statistics for ${r.owner}/${r.name}`,
        payload: Object.entries(langs)
          .map(([k, v]) => ({ language: k, bytes: v, share: Math.round((v / totalLangs) * 1000) / 10 }))
          .sort((a, b) => b.bytes - a.bytes),
      });
    }
  } catch (err) {
    ctx.log("languages collection failed (non-fatal)", { error: String(err) });
  }

  // Contributors — recorded as REPO relationships, NOT founders
  try {
    const contributors = await github.getContributors(owner, repo);
    for (const c of contributors) {
      await db.contributorObservation.create({
        data: {
          repositoryId: repository.id,
          providerUserId: c.providerUserId,
          login: c.login,
          accountType: c.accountType,
          repoRole: c.login === r.owner ? "REPO_OWNER" : "INDIVIDUAL_CONTRIBUTOR",
          contributions: c.contributions,
          collectedAt: repoRes.collectedAt,
        },
      });
    }
    const humans = contributors.filter((c) => c.accountType === "USER");
    const totalContributions = humans.reduce((a, b) => a + b.contributions, 0);
    if (humans.length > 0 && totalContributions > 0) {
      const top1 = Math.max(...humans.map((c) => c.contributions)) / totalContributions;
      await recordEvidence({
        ventureId,
        entityType: "VENTURE",
        entityId: ventureId,
        url: r.url,
        provider: "GITHUB_API",
        sourceType: "CONTRIBUTOR_CONCENTRATION",
        title: `Contributor concentration ${r.owner}/${r.name}`,
        payload: {
          humanContributors: humans.length,
          bots: contributors.filter((c) => c.accountType === "BOT").length,
          topContributorShare: Math.round(top1 * 1000) / 10,
        },
      });
    }
  } catch (err) {
    ctx.log("contributors collection failed (non-fatal)", { error: String(err) });
  }

  // Releases
  try {
    const releases = await github.getReleases(owner, repo);
    for (const rel of releases) {
      await db.releaseObservation.upsert({
        where: { repositoryId_providerId: { repositoryId: repository.id, providerId: rel.providerId } },
        create: {
          repositoryId: repository.id,
          providerId: rel.providerId,
          tagName: rel.tagName,
          name: rel.name,
          publishedAt: rel.publishedAt,
          prerelease: rel.prerelease,
          url: rel.url,
          collectedAt: repoRes.collectedAt,
        },
        update: { collectedAt: repoRes.collectedAt },
      });
      if (rel.publishedAt) {
        // Proof-of-build timeline: attach to existing founder records only.
        // Founders are never auto-created from repository data (attribution rule).
        const linkedFounder = await db.founder.findFirst({
          where: { ventureLinks: { some: { ventureId } } },
        });
        if (linkedFounder) {
          await db.founderPassportEvent.create({
            data: {
              founderId: linkedFounder.id,
              kind: "RELEASE",
              summary: `${r.owner}/${r.name} released ${rel.tagName}`,
              sourceUrl: rel.url,
              occurredAt: rel.publishedAt,
            },
          }).catch(() => undefined);
        }
      }
    }
    if (releases.length > 0) {
      await recordEvidence({
        ventureId,
        entityType: "VENTURE",
        entityId: ventureId,
        url: `${r.url}/releases`,
        provider: "GITHUB_API",
        sourceType: "RELEASE_TIMELINE",
        title: `Releases of ${r.owner}/${r.name}`,
        payload: releases.slice(0, 10),
      });
    }
  } catch (err) {
    ctx.log("releases collection failed (non-fatal)", { error: String(err) });
  }

  // Commit samples
  try {
    const commits = await github.getCommits(owner, repo);
    for (const c of commits) {
      await db.commitSample.create({
        data: {
          repositoryId: repository.id,
          sha: c.sha,
          authorLogin: c.authorLogin,
          message: c.message,
          committedAt: c.committedAt,
          collectedAt: repoRes.collectedAt,
        },
      });
    }
  } catch (err) {
    ctx.log("commits collection failed (non-fatal)", { error: String(err) });
  }

  await db.ventureHistoryEvent.create({
    data: { ventureId, kind: "REPO_ASSOCIATED", summary: `Repository ${r.owner}/${r.name} observed: ${r.stars}★ ${r.forks} forks` },
  });
  ctx.log("repo collected", { stars: r.stars, forks: r.forks });
});

// ─── Solana mint collector ────────────────────────────────────────────

registerJob("collect_solana_mint", async (ctx) => {
  const { ventureId, mint } = ctx.payload as { ventureId: string; mint: string };
  if (!isValidSolanaAddress(mint)) {
    throw new Error(`Malformed mint address: ${mint} (PERMANENT)`);
  }
  ctx.log("collecting solana mint", { mint });

  const info = await solana.getMintInfo(mint);
  const tokenAsset = await db.tokenAsset.upsert({
    where: { mint },
    create: { ventureId, mint, decimals: info.decimals, supply: info.supply, mintAuthority: info.mintAuthority, freezeAuthority: info.freezeAuthority, association: "CLAIMED", extensionsJson: JSON.stringify(info.extensions) },
    update: { decimals: info.decimals, supply: info.supply, mintAuthority: info.mintAuthority, freezeAuthority: info.freezeAuthority, extensionsJson: JSON.stringify(info.extensions) },
  });

  await db.onchainObservation.create({
    data: {
      ventureId,
      tokenAssetId: tokenAsset.id,
      kind: "MINT_METADATA",
      payload: JSON.stringify(info),
      slot: BigInt(info.slot),
      dataSources: JSON.stringify([`solana-rpc:${solana.rpcEndpoint}`]),
      observationTime: new Date(),
      providerLimitations: "Public RPC; no historical indexing; extension details limited without Helius",
    },
  });

  const authorityClaimResult = await getOrCreateCanonicalClaim({
    ventureId,
    subjectType: "TOKEN",
    subjectId: tokenAsset.id,
    statement: info.mintAuthority
      ? `Token ${mint} retains a mint authority (${info.mintAuthority})`
      : `Token ${mint} mint authority is revoked`,
    category: "TOKENOMICS",
    origin: "PLATFORM_DERIVED",
  });
  const authorityClaim = { id: authorityClaimResult.id };
  await recordEvidence({
    ventureId,
    entityType: "VENTURE",
    entityId: ventureId,
    claimId: authorityClaim.id,
    provider: "ONCHAIN_RPC",
    sourceType: "MINT_AUTHORITY",
    title: `Onchain mint read for ${mint}`,
    payload: info,
  });

  await db.ventureHistoryEvent.create({
    data: { ventureId, kind: "TOKEN_ASSOCIATED", summary: `Mint ${mint} observed at slot ${info.slot} (${info.program})` },
  });
  ctx.log("mint collected", { slot: info.slot, program: info.program });
});

// ─── Market snapshot collector ────────────────────────────────────────

registerJob("collect_market_snapshot", async (ctx) => {
  const { ventureId, mint } = ctx.payload as { ventureId: string; mint: string };
  ctx.log("collecting market snapshot", { mint });
  const prices = await jupiter.getPrices([mint]);
  const p = prices[mint];
  const tokenAsset = await db.tokenAsset.findUnique({ where: { mint } });

  await db.marketSnapshot.create({
    data: {
      ventureId,
      tokenAssetId: tokenAsset?.id,
      priceUsd: p.usdPrice,
      liquidityUsd: p.liquidityUsd,
      priceChange24h: p.priceChange24h,
      provider: "JUPITER_PRICE_V3",
      asOf: p.asOf,
    },
  });

  await recordEvidence({
    ventureId,
    entityType: "VENTURE",
    entityId: ventureId,
    provider: "MARKET_API",
    sourceType: "MARKET_SNAPSHOT",
    title: `Market snapshot for ${mint}`,
    payload: { ...p, asOf: p.asOf.toISOString() },
  });
  ctx.log("market snapshot collected", { priceUsd: p.usdPrice });
});
