// Merge duplicate claim rows into the canonical (oldest) row per
// (ventureId, subjectType, subjectId, statement, origin). Reassigns
// claim-evidence links and evidence.claimId references, then deletes the
// duplicates. Safe to re-run: exits when no duplicates remain.
//
// Run: bun scripts/dedupe-claims.ts
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const claims = await db.claim.findMany({
    select: { id: true, ventureId: true, subjectType: true, subjectId: true, statement: true, origin: true, createdAt: true, status: true },
    orderBy: { createdAt: "asc" },
  });

  const groups = new Map<string, typeof claims>();
  for (const c of claims) {
    const key = `${c.ventureId ?? "-"}|${c.subjectType}|${c.subjectId ?? "-"}|${c.statement}|${c.origin}`;
    const arr = groups.get(key) ?? [];
    arr.push(c);
    groups.set(key, arr);
  }

  const dupGroups = [...groups.entries()].filter(([, arr]) => arr.length > 1);
  if (dupGroups.length === 0) {
    console.log("No duplicate claims found. Nothing to merge.");
    return;
  }

  let deleted = 0;
  for (const [key, arr] of dupGroups) {
    const [canonical, ...dups] = arr;
    console.log(`Merging ${dups.length} duplicate(s) of: "${canonical.statement.slice(0, 80)}…" (${canonical.status})`);
    await db.$transaction(async (tx) => {
      for (const dup of dups) {
        // Reassign evidence links (unique on claimId+evidenceId+relation: skip canonical collisions)
        const dupLinks = await tx.claimEvidenceLink.findMany({ where: { claimId: dup.id } });
        for (const link of dupLinks) {
          const exists = await tx.claimEvidenceLink.findUnique({
            where: { claimId_evidenceId_relation: { claimId: canonical.id, evidenceId: link.evidenceId, relation: link.relation } },
          });
          if (exists) await tx.claimEvidenceLink.delete({ where: { id: link.id } });
          else await tx.claimEvidenceLink.update({ where: { id: link.id }, data: { claimId: canonical.id } });
        }
        // Reassign evidence rows pointing at the dup claim
        await tx.evidenceSource.updateMany({ where: { claimId: dup.id }, data: { claimId: canonical.id } });
        await tx.claim.delete({ where: { id: dup.id } });
        deleted += 1;
      }
    });
  }

  const remaining = await db.claim.count();
  console.log(`\nDone. Duplicate claims deleted: ${deleted}. Claims remaining: ${remaining}`);
}

main()
  .catch((e) => {
    console.error("Merge failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
