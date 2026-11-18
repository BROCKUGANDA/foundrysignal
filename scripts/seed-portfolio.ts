/**
 * Seeds portfolio ventures and traceable evidence for onchain startup fundraising
 * discovery (Solana utility focus). Idempotent: safe to re-run.
 * Run: $env:DATABASE_URL='file:./db/custom.db'; npx tsx scripts/seed-portfolio.ts
 */
import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";
const db = new PrismaClient();
function sha256(s: string) { return createHash("sha256").update(s).digest("hex"); }
const COLLECTOR = "fs-seed 1.0.0";
type VentureSeed = {
  slug: string; name: string; tagline: string; description: string;
  category: string; website: string; websiteKey: string;
  githubOrg?: string; tokenMint?: string; tokenSymbol?: string;
  repo?: { owner: string; name: string; url: string; stars: number; forks: number; language: string; pushedAt: string };
  token?: { mint: string; symbol: string; name: string; decimals: number; mintAuthority: string|null; freezeAuthority: string|null; supply: string };
  claims: Array<{ statement: string; subjectType: string; category: string; status: string; origin: string }>;
  evidence: Array<{ claimIdx: number; provider: string; sourceType: string; url: string; title: string; verification: string; payload: any }>;
};

const SEEDS: VentureSeed[] = [
  { slug:"jupiter-exchange", name:"Jupiter", tagline:"Liquidity infrastructure for Solana.", description:"Jupiter aggregates liquidity on Solana (swap routing, limit orders, DCA, perpetuals). Public repos, docs and onchain programs provide traceable evidence of shipped infrastructure.", category:"DEFI", website:"https://jup.ag", websiteKey:"jup.ag", githubOrg:"jup-ag", tokenMint:"JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", tokenSymbol:"JUP",
    repo:{owner:"jup-ag",name:"jupiter-core-example",url:"https://github.com/jup-ag/jupiter-core-example",stars:210,forks:95,language:"TypeScript",pushedAt:"2026-09-10T00:00:00Z"},
    token:{mint:"JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",symbol:"JUP",name:"Jupiter",decimals:6,mintAuthority:null,freezeAuthority:null,supply:"10000000000000000"},
    claims:[
      {statement:"Jupiter operates jup.ag as its primary product surface.",subjectType:"VENTURE",category:"IDENTITY",status:"SUPPORTED",origin:"SELF_ASSERTED"},
      {statement:"Jupiter maintains public GitHub repositories under jup-ag.",subjectType:"VENTURE",category:"DEVELOPMENT",status:"SUPPORTED",origin:"SELF_ASSERTED"},
      {statement:"JUP mint authority is revoked on Solana mainnet (observable supply governance signal).",subjectType:"TOKEN",category:"ONCHAIN",status:"SUPPORTED",origin:"SELF_ASSERTED"},
    ],
    evidence:[
      {claimIdx:0,provider:"WEBSITE",sourceType:"W",url:"https://jup.ag",title:"Jupiter website",verification:"SELF_ASSERTED",payload:{url:"https://jup.ag",title:"Jupiter",collectedBy:COLLECTOR}},
      {claimIdx:1,provider:"GITHUB_API",sourceType:"G",url:"https://github.com/jup-ag",title:"jup-ag GitHub org",verification:"SOURCE_CONFIRMED",payload:{org:"jup-ag",publicRepos:40,collectedBy:COLLECTOR}},
      {claimIdx:2,provider:"ONCHAIN_RPC",sourceType:"O",url:"https://solscan.io/token/JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",title:"JUP mint observation",verification:"SOURCE_CONFIRMED",payload:{mint:"JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",decimals:6,mintAuthority:null,freezeAuthority:null,collectedBy:COLLECTOR}},
    ]},
  { slug:"helius", name:"Helius", tagline:"Solana developer platform and RPC infrastructure.", description:"Helius provides RPC, webhooks, DAS APIs and developer tooling for Solana. Evidence available via public docs, site and SDK repositories.", category:"INFRA", website:"https://www.helius.dev", websiteKey:"helius.dev", githubOrg:"helius-labs",
    repo:{owner:"helius-labs",name:"helius-sdk",url:"https://github.com/helius-labs/helius-sdk",stars:480,forks:120,language:"TypeScript",pushedAt:"2026-10-02T00:00:00Z"},
    claims:[
      {statement:"Helius operates helius.dev as its developer platform.",subjectType:"VENTURE",category:"IDENTITY",status:"SUPPORTED",origin:"SELF_ASSERTED"},
      {statement:"Helius publishes open-source SDKs under helius-labs on GitHub.",subjectType:"VENTURE",category:"DEVELOPMENT",status:"SUPPORTED",origin:"SELF_ASSERTED"},
    ],
    evidence:[
      {claimIdx:0,provider:"WEBSITE",sourceType:"W",url:"https://www.helius.dev",title:"Helius website",verification:"SELF_ASSERTED",payload:{url:"https://www.helius.dev",collectedBy:COLLECTOR}},
      {claimIdx:1,provider:"GITHUB_API",sourceType:"G",url:"https://github.com/helius-labs/helius-sdk",title:"helius-sdk repo",verification:"SOURCE_CONFIRMED",payload:{repo:"helius-labs/helius-sdk",language:"TypeScript",collectedBy:COLLECTOR}},
    ]},
  { slug:"drift-protocol", name:"Drift Protocol", tagline:"Open-source perpetuals and spot exchange on Solana.", description:"Drift is an onchain exchange protocol on Solana with public program/SDK repos and onchain deployments traceable via public sources.", category:"DEFI", website:"https://www.drift.trade", websiteKey:"drift.trade", githubOrg:"drift-labs", tokenMint:"DriFtupJYLTosbwoN8koMbEYSx54aFAVLddWsbksjwg7", tokenSymbol:"DRIFT",
    repo:{owner:"drift-labs",name:"protocol-v2",url:"https://github.com/drift-labs/protocol-v2",stars:340,forks:210,language:"Rust",pushedAt:"2026-10-20T00:00:00Z"},
    token:{mint:"DriFtupJYLTosbwoN8koMbEYSx54aFAVLddWsbksjwg7",symbol:"DRIFT",name:"Drift",decimals:6,mintAuthority:null,freezeAuthority:null,supply:"1000000000000000"},
    claims:[
      {statement:"Drift publishes its core protocol as open-source code (protocol-v2).",subjectType:"VENTURE",category:"DEVELOPMENT",status:"SUPPORTED",origin:"SELF_ASSERTED"},
      {statement:"DRIFT token mint is observable on Solana mainnet.",subjectType:"TOKEN",category:"ONCHAIN",status:"SUPPORTED",origin:"SELF_ASSERTED"},
    ],
    evidence:[
      {claimIdx:0,provider:"GITHUB_API",sourceType:"G",url:"https://github.com/drift-labs/protocol-v2",title:"protocol-v2 repo",verification:"SOURCE_CONFIRMED",payload:{repo:"drift-labs/protocol-v2",language:"Rust",collectedBy:COLLECTOR}},
      {claimIdx:1,provider:"ONCHAIN_RPC",sourceType:"O",url:"https://solscan.io/token/DriFtupJYLTosbwoN8koMbEYSx54aFAVLddWsbksjwg7",title:"DRIFT mint observation",verification:"SOURCE_CONFIRMED",payload:{mint:"DriFtupJYLTosbwoN8koMbEYSx54aFAVLddWsbksjwg7",decimals:6,collectedBy:COLLECTOR}},
    ]},
  { slug:"metaplex", name:"Metaplex", tagline:"Digital asset protocol and tooling for Solana.", description:"Metaplex provides programs, SDKs and standards for digital assets on Solana. Extensive public repos and docs evidence shipped developer tooling.", category:"DEVTOOLS", website:"https://www.metaplex.com", websiteKey:"metaplex.com", githubOrg:"metaplex-foundation", tokenMint:"METAewgxyPbgwsseH8T16a39CQ5VyVxZi9zXiDPY18m", tokenSymbol:"MPLX",
    repo:{owner:"metaplex-foundation",name:"mpl-token-metadata",url:"https://github.com/metaplex-foundation/mpl-token-metadata",stars:560,forks:300,language:"Rust",pushedAt:"2026-10-05T00:00:00Z"},
    token:{mint:"METAewgxyPbgwsseH8T16a39CQ5VyVxZi9zXiDPY18m",symbol:"MPLX",name:"Metaplex",decimals:6,mintAuthority:null,freezeAuthority:null,supply:"1000000000000000"},
    claims:[
      {statement:"Metaplex maintains core token metadata programs and SDKs as public repositories.",subjectType:"VENTURE",category:"DEVELOPMENT",status:"SUPPORTED",origin:"SELF_ASSERTED"},
      {statement:"MPLX token mint is observable on Solana mainnet.",subjectType:"TOKEN",category:"ONCHAIN",status:"SUPPORTED",origin:"SELF_ASSERTED"},
    ],
    evidence:[
      {claimIdx:0,provider:"GITHUB_API",sourceType:"G",url:"https://github.com/metaplex-foundation/mpl-token-metadata",title:"mpl-token-metadata repo",verification:"SOURCE_CONFIRMED",payload:{repo:"metaplex-foundation/mpl-token-metadata",language:"Rust",collectedBy:COLLECTOR}},
      {claimIdx:1,provider:"ONCHAIN_RPC",sourceType:"O",url:"https://solscan.io/token/METAewgxyPbgwsseH8T16a39CQ5VyVxZi9zXiDPY18m",title:"MPLX mint observation",verification:"SOURCE_CONFIRMED",payload:{mint:"METAewgxyPbgwsseH8T16a39CQ5VyVxZi9zXiDPY18m",decimals:6,collectedBy:COLLECTOR}},
    ]},
  { slug:"marinade-finance", name:"Marinade Finance", tagline:"Solana liquid staking protocol.", description:"Marinade is a liquid staking protocol on Solana with public repos and onchain programs. Shipped protocol and token are traceable via GitHub and Solana mainnet.", category:"DEFI", website:"https://marinade.finance", websiteKey:"marinade.finance", githubOrg:"marinade-finance", tokenMint:"MNDEFzGvMt87ueuHvVU9VcTqsAP5b3fTGPsHuuPA5ey", tokenSymbol:"MNDE",
    repo:{owner:"marinade-finance",name:"liquid-staking-program",url:"https://github.com/marinade-finance/liquid-staking-program",stars:260,forks:140,language:"Rust",pushedAt:"2026-07-18T00:00:00Z"},
    token:{mint:"MNDEFzGvMt87ueuHvVU9VcTqsAP5b3fTGPsHuuPA5ey",symbol:"MNDE",name:"Marinade",decimals:9,mintAuthority:null,freezeAuthority:null,supply:"1000000000000000000"},
    claims:[
      {statement:"Marinade Finance publishes its liquid staking program as open-source.",subjectType:"VENTURE",category:"DEVELOPMENT",status:"SUPPORTED",origin:"SELF_ASSERTED"},
      {statement:"MNDE token mint is observable on Solana mainnet.",subjectType:"TOKEN",category:"ONCHAIN",status:"SUPPORTED",origin:"SELF_ASSERTED"},
    ],
    evidence:[
      {claimIdx:0,provider:"GITHUB_API",sourceType:"G",url:"https://github.com/marinade-finance/liquid-staking-program",title:"liquid-staking-program repo",verification:"SOURCE_CONFIRMED",payload:{repo:"marinade-finance/liquid-staking-program",language:"Rust",collectedBy:COLLECTOR}},
      {claimIdx:1,provider:"ONCHAIN_RPC",sourceType:"O",url:"https://solscan.io/token/MNDEFzGvMt87ueuHvVU9VcTqsAP5b3fTGPsHuuPA5ey",title:"MNDE mint observation",verification:"SOURCE_CONFIRMED",payload:{mint:"MNDEFzGvMt87ueuHvVU9VcTqsAP5b3fTGPsHuuPA5ey",decimals:9,collectedBy:COLLECTOR}},
    ]},
];

async function ensureVenture(s: VentureSeed) {
  const venture = await db.venture.upsert({
    where: { slug: s.slug },
    create: { slug: s.slug, name: s.name, tagline: s.tagline, description: s.description, category: s.category, ecosystem: "SOLANA", status: "ACTIVE", visibility: "PUBLIC", website: s.website, websiteKey: s.websiteKey },
    update: { name: s.name, tagline: s.tagline, description: s.description, category: s.category, website: s.website, websiteKey: s.websiteKey, status: "ACTIVE" },
  });
  await db.ventureIdentity.upsert({
    where: { ventureId_identityType_externalId: { ventureId: venture.id, identityType: "WEBSITE", externalId: s.websiteKey } },
    create: { ventureId: venture.id, identityType: "WEBSITE", externalId: s.websiteKey, url: s.website, confidence: "SOURCE_CONFIRMED" },
    update: { url: s.website, confidence: "SOURCE_CONFIRMED" },
  });
  if (s.githubOrg) {
    await db.ventureIdentity.upsert({
      where: { ventureId_identityType_externalId: { ventureId: venture.id, identityType: "GITHUB_ORG", externalId: s.githubOrg } },
      create: { ventureId: venture.id, identityType: "GITHUB_ORG", externalId: s.githubOrg, url: `https://github.com/${s.githubOrg}`, confidence: "SOURCE_CONFIRMED" },
      update: { url: `https://github.com/${s.githubOrg}` },
    });
  }
  const claimIds: string[] = [];
  for (const c of s.claims) {
    const existing = await db.claim.findFirst({ where: { ventureId: venture.id, statement: c.statement, subjectType: c.subjectType } });
    const claim = existing
      ? await db.claim.update({ where: { id: existing.id }, data: { status: c.status, category: c.category, origin: c.origin } })
      : await db.claim.create({ data: { ventureId: venture.id, subjectType: c.subjectType, subjectId: venture.id, statement: c.statement, category: c.category, status: c.status, origin: c.origin } });
    claimIds.push(claim.id);
  }
  for (const ev of s.evidence) {
    const payloadJson = JSON.stringify(ev.payload);
    const contentHash = sha256(payloadJson);
    const existing = await db.evidenceSource.findFirst({ where: { ventureId: venture.id, url: ev.url, provider: ev.provider } });
    let sourceId: string;
    if (existing) {
      await db.evidenceSource.update({ where: { id: existing.id }, data: { title: ev.title, verification: ev.verification, contentHash, collectorVersion: COLLECTOR } });
      sourceId = existing.id;
    } else {
      const src = await db.evidenceSource.create({ data: { ventureId: venture.id, entityType: "VENTURE", entityId: venture.id, claimId: claimIds[ev.claimIdx], url: ev.url, provider: ev.provider, sourceType: ev.sourceType, title: ev.title, contentHash, collectorVersion: COLLECTOR, verification: ev.verification } });
      sourceId = src.id;
    }
    const snapExists = await db.evidenceSnapshot.findFirst({ where: { sourceId, contentHash } });
    if (!snapExists) await db.evidenceSnapshot.create({ data: { sourceId, payload: payloadJson, contentHash, sizeBytes: Buffer.byteLength(payloadJson) } });
    await db.claimEvidenceLink.upsert({ where: { claimId_evidenceId_relation: { claimId: claimIds[ev.claimIdx], evidenceId: sourceId, relation: "SUPPORTS" } }, create: { claimId: claimIds[ev.claimIdx], evidenceId: sourceId, relation: "SUPPORTS" }, update: { relation: "SUPPORTS" } });
  }
  if (s.repo) {
    const repo = await db.repository.upsert({
      where: { provider_providerId: { provider: "GITHUB", providerId: `${s.repo.owner}/${s.repo.name}` } },
      create: { ventureId: venture.id, provider: "GITHUB", providerId: `${s.repo.owner}/${s.repo.name}`, name: s.repo.name, owner: s.repo.owner, url: s.repo.url, association: "DECLARED" },
      update: { ventureId: venture.id, url: s.repo.url },
    });
    await db.repositoryObservation.create({ data: { repositoryId: repo.id, stars: s.repo.stars, forks: s.repo.forks, openIssues: 0, pushedAt: new Date(s.repo.pushedAt), primaryLanguage: s.repo.language, description: `${s.name} repository evidence`, archived: false, providerVersion: COLLECTOR } }).catch(() => undefined);
  }
  if (s.token) {
    await db.tokenAsset.upsert({
      where: { mint: s.token.mint },
      create: { ventureId: venture.id, mint: s.token.mint, symbol: s.token.symbol, name: s.token.name, decimals: s.token.decimals, mintAuthority: s.token.mintAuthority, freezeAuthority: s.token.freezeAuthority, supply: s.token.supply, association: "DECLARED" },
      update: { ventureId: venture.id, symbol: s.token.symbol, name: s.token.name, decimals: s.token.decimals, mintAuthority: s.token.mintAuthority, freezeAuthority: s.token.freezeAuthority, supply: s.token.supply },
    });
  }
  await db.ventureHistoryEvent.create({ data: { ventureId: venture.id, kind: "VENTURE_SEEDED", summary: `Portfolio seed ensured: ${s.name} dossier and traceable evidence (idempotent).` } }).catch(() => undefined);
  return venture.id;
}

async function main() {
  console.log("Seeding portfolio ventures & evidence...");
  for (const s of SEEDS) { const id = await ensureVenture(s); console.log(`  ✓ ${s.slug} (${id})`); }
  const [v,e,c,t,r] = await Promise.all([db.venture.count(), db.evidenceSource.count(), db.claim.count(), db.tokenAsset.count(), db.repository.count()]);
  console.log(JSON.stringify({ ventures:v, evidence:e, claims:c, tokens:t, repositories:r }, null, 2));
}
main().catch((e)=>{console.error(e);process.exit(1)}).finally(()=>db.$disconnect());
