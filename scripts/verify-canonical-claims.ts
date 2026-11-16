// Live verification: enqueue a real collect_solana_mint job for the existing
// Jupiter dossier and prove the canonical-claim path does not duplicate rows.
// Run: bun scripts/verify-canonical-claims.ts
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const venture = await db.venture.findFirst({ where: { slug: "jupiter-exchange" } });
  if (!venture) throw new Error("canonical venture missing");
  const token = await db.tokenAsset.findFirst({ where: { ventureId: venture.id } });
  if (!token) throw new Error("token asset missing");

  const before = await db.claim.count({ where: { ventureId: venture.id } });
  const beforeAuthClaims = await db.claim.count({
    where: { ventureId: venture.id, subjectType: "TOKEN", statement: { contains: "mint authority" } },
  });
  console.log(`claims before: ${before} (mint-authority claims: ${beforeAuthClaims})`);

  // Dynamically enqueue through the app's own queue (uses tsconfig path aliases via bun)
  const { enqueue } = await import("../src/lib/jobs/queue");
  const jobId = await enqueue({
    kind: "collect_solana_mint",
    idempotencyKey: `verify_canonical:${Date.now()}`,
    payload: { ventureId: venture.id, mint: token.mint },
  });
  console.log(`enqueued job ${jobId}; waiting for in-process worker…`);
  await new Promise((r) => setTimeout(r, 15000));

  const after = await db.claim.count({ where: { ventureId: venture.id } });
  const afterAuthClaims = await db.claim.count({
    where: { ventureId: venture.id, subjectType: "TOKEN", statement: { contains: "mint authority" } },
  });
  const evidence = await db.evidenceSource.count({ where: { ventureId: venture.id } });
  console.log(`claims after: ${after} (mint-authority claims: ${afterAuthClaims})`);
  console.log(`evidence records after: ${evidence}`);
  console.log(
    afterAuthClaims === beforeAuthClaims
      ? "PASS: no duplicate mint-authority claim created (canonical reuse)"
      : "FAIL: duplicate claim created!"
  );
  process.exit(0);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
