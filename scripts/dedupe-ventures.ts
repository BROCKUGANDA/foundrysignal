// Merge duplicate venture rows into the canonical row per normalized website.
// One-time data migration for the duplicate Jupiter rows created by repeated
// smoke runs before website-identity dedup existed. Safe to re-run: exits when
// no duplicates remain. Handles unique-constraint conflicts explicitly.
//
// Run: bun scripts/dedupe-ventures.ts
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

interface RelCounts {
  [k: string]: number;
}

async function countRels(ventureId: string): Promise<RelCounts> {
  const v = await db.venture.findUnique({
    where: { id: ventureId },
    select: {
      _count: {
        select: {
          identities: true, founderLinks: true, repositories: true, products: true,
          tokenAssets: true, walletAssoc: true, claims: true, evidence: true,
          watchlistItems: true, onchainObs: true, marketSnapshots: true,
          researchRuns: true, disputes: true, alerts: true, historyEvents: true,
          workspaceNotes: true,
        },
      },
    },
  });
  return (v?._count as unknown as RelCounts) ?? {};
}

function summarize(c: RelCounts): string {
  return Object.entries(c)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k}=${n}`)
    .join(" ");
}

async function main() {
  const ventures = await db.venture.findMany({
    select: { id: true, name: true, slug: true, website: true, websiteKey: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  // Group by normalized website key (fallback: normalized hostname of website)
  const groups = new Map<string, typeof ventures>();
  for (const v of ventures) {
    const key =
      v.websiteKey ??
      (v.website
        ? (() => {
            try {
              return new URL(v.website).hostname.replace(/^www\./, "").toLowerCase();
            } catch {
              return null;
            }
          })()
        : null);
    if (!key) continue;
    const arr = groups.get(key) ?? [];
    arr.push(v);
    groups.set(key, arr);
  }

  const dupGroups = [...groups.entries()].filter(([, arr]) => arr.length > 1);
  if (dupGroups.length === 0) {
    console.log("No duplicate ventures found. Nothing to merge.");
    return;
  }

  for (const [key, arr] of dupGroups) {
    // Canonical = oldest row (holds the accumulated evidence graph)
    const [canonical, ...dups] = arr;
    console.log(`\nMerging group "${key}": canonical=${canonical.slug} (${canonical.id})`);
    for (const d of dups) {
      const before = await countRels(d.id);
      console.log(`  dup ${d.slug} (${d.id}) rels: ${summarize(before) || "(none)"}`);
    }

    await db.$transaction(async (tx) => {
      for (const dup of dups) {
        // ── identity-linked records with venture-scoped uniqueness ──
        // VentureIdentity: skip tuples canonical already has
        const dupIdents = await tx.ventureIdentity.findMany({ where: { ventureId: dup.id } });
        for (const ident of dupIdents) {
          const exists = await tx.ventureIdentity.findUnique({
            where: {
              ventureId_identityType_externalId: {
                ventureId: canonical.id,
                identityType: ident.identityType,
                externalId: ident.externalId,
              },
            },
          });
          if (exists) await tx.ventureIdentity.delete({ where: { id: ident.id } });
          else
            await tx.ventureIdentity.update({
              where: { id: ident.id },
              data: { ventureId: canonical.id },
            });
        }

        // TokenAsset: mint is globally unique — canonical keeps the richer row
        const dupTokens = await tx.tokenAsset.findMany({ where: { ventureId: dup.id } });
        for (const t of dupTokens) {
          const exists = await tx.tokenAsset.findUnique({ where: { mint: t.mint } });
          if (exists && exists.ventureId !== dup.id) {
            await tx.tokenAsset.delete({ where: { id: t.id } });
          } else {
            await tx.tokenAsset.update({ where: { id: t.id }, data: { ventureId: canonical.id } });
          }
        }

        // Repository: provider+providerId globally unique
        const dupRepos = await tx.repository.findMany({ where: { ventureId: dup.id } });
        for (const r of dupRepos) {
          const exists = await tx.repository.findUnique({
            where: { provider_providerId: { provider: r.provider, providerId: r.providerId } },
          });
          if (exists && exists.ventureId !== dup.id) {
            await tx.repository.delete({ where: { id: r.id } });
          } else {
            await tx.repository.update({ where: { id: r.id }, data: { ventureId: canonical.id } });
          }
        }

        // ProductRecord: unique (ventureId, name)
        const dupProducts = await tx.productRecord.findMany({ where: { ventureId: dup.id } });
        for (const p of dupProducts) {
          const exists = await tx.productRecord.findUnique({
            where: { ventureId_name: { ventureId: canonical.id, name: p.name } },
          });
          if (exists) await tx.productRecord.delete({ where: { id: p.id } });
          else await tx.productRecord.update({ where: { id: p.id }, data: { ventureId: canonical.id } });
        }

        // WalletAssociation: unique (ventureId, address, label)
        const dupWallets = await tx.walletAssociation.findMany({ where: { ventureId: dup.id } });
        for (const w of dupWallets) {
          const exists = await tx.walletAssociation.findUnique({
            where: { ventureId_address_label: { ventureId: canonical.id, address: w.address, label: w.label } },
          });
          if (exists) await tx.walletAssociation.delete({ where: { id: w.id } });
          else await tx.walletAssociation.update({ where: { id: w.id }, data: { ventureId: canonical.id } });
        }

        // WatchlistItem: unique (watchlistId, ventureId)
        const dupWatchItems = await tx.watchlistItem.findMany({ where: { ventureId: dup.id } });
        for (const wi of dupWatchItems) {
          const exists = await tx.watchlistItem.findUnique({
            where: { watchlistId_ventureId: { watchlistId: wi.watchlistId, ventureId: canonical.id } },
          });
          if (exists) await tx.watchlistItem.delete({ where: { id: wi.id } });
          else await tx.watchlistItem.update({ where: { id: wi.id }, data: { ventureId: canonical.id } });
        }

        // VentureFounderLink: unique (ventureId, founderId, role)
        const dupFounderLinks = await tx.ventureFounderLink.findMany({ where: { ventureId: dup.id } });
        for (const fl of dupFounderLinks) {
          const exists = await tx.ventureFounderLink.findUnique({
            where: { ventureId_founderId_role: { ventureId: canonical.id, founderId: fl.founderId, role: fl.role } },
          });
          if (exists) await tx.ventureFounderLink.delete({ where: { id: fl.id } });
          else await tx.ventureFounderLink.update({ where: { id: fl.id }, data: { ventureId: canonical.id } });
        }

        // ── plain reassignment (no venture-scoped uniqueness) ──
        await tx.claim.updateMany({
          where: { ventureId: dup.id },
          data: { ventureId: canonical.id },
        });
        // Claims that name the dup venture as their subject now point at canonical
        await tx.claim.updateMany({
          where: { subjectType: "VENTURE", subjectId: dup.id },
          data: { subjectId: canonical.id },
        });
        await tx.evidenceSource.updateMany({
          where: { ventureId: dup.id },
          data: { ventureId: canonical.id },
        });
        await tx.evidenceSource.updateMany({
          where: { entityType: "VENTURE", entityId: dup.id },
          data: { entityId: canonical.id },
        });
        await tx.onchainObservation.updateMany({ where: { ventureId: dup.id }, data: { ventureId: canonical.id } });
        await tx.marketSnapshot.updateMany({ where: { ventureId: dup.id }, data: { ventureId: canonical.id } });
        await tx.researchRun.updateMany({ where: { ventureId: dup.id }, data: { ventureId: canonical.id } });
        await tx.disputeRecord.updateMany({ where: { ventureId: dup.id }, data: { ventureId: canonical.id } });
        await tx.alert.updateMany({ where: { ventureId: dup.id }, data: { ventureId: canonical.id } });
        await tx.ventureHistoryEvent.updateMany({ where: { ventureId: dup.id }, data: { ventureId: canonical.id } });
        await tx.workspaceNote.updateMany({ where: { ventureId: dup.id }, data: { ventureId: canonical.id } });

        // History note on canonical + audit trail, then remove the dup row
        await tx.ventureHistoryEvent.create({
          data: {
            ventureId: canonical.id,
            kind: "MERGED",
            summary: `Duplicate venture row ${dup.slug} merged into this record (same normalized website identity); related evidence reassigned before deletion.`,
          },
        });
        await tx.venture.delete({ where: { id: dup.id } });
      }
    });

    const after = await countRels(canonical.id);
    console.log(`  canonical after merge: ${summarize(after) || "(none)"}`);
    console.log(`  dup rows deleted: ${dups.length}`);
  }

  const remaining = await db.venture.count();
  console.log(`\nDone. Ventures remaining: ${remaining}`);

  // Backfill websiteKey for ventures created before the column existed
  const missing = await db.venture.findMany({ where: { websiteKey: null, website: { not: null } } });
  for (const v of missing) {
    try {
      const domain = new URL(v.website as string).hostname.replace(/^www\./, "").toLowerCase();
      const taken = await db.venture.findUnique({ where: { websiteKey: domain } });
      if (!taken) {
        await db.venture.update({ where: { id: v.id }, data: { websiteKey: domain } });
        console.log(`Backfilled websiteKey=${domain} for ${v.slug}`);
      }
    } catch {
      // unparseable website — leave null (dedup not applicable)
    }
  }
}

main()
  .catch((e) => {
    console.error("Merge failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
