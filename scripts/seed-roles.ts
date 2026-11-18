/**
 * Seeds the FoundrySignal demo team: three demo users with distinct workspace
 * roles in one shared team workspace, plus realistic member-visible content —
 * a watchlist, alert rules + events, a saved search, onboarding notes, and one
 * sample research run + report per user.
 *
 * Idempotent: re-running upserts by email / natural keys and never duplicates.
 *
 * Run:      bun scripts/seed-roles.ts
 * Requires: DATABASE_URL (loaded from .env).
 *
 * Passwords are read from the environment, never hardcoded:
 *   DEMO_ANALYST_PASSWORD  → demo-analyst@foundrysignal.aiazimara.com (ANALYST)
 *   DEMO_VIEWER_PASSWORD   → demo-viewer@foundrysignal.aiazimara.com  (VIEWER)
 *   DEMO_ADMIN_PASSWORD    → demo-admin@foundrysignal.aiazimara.com   (ADMIN)
 * A missing variable skips that user (with a clear message); the rest still seed.
 * Existing users get their password re-synced to the env value on re-run.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHash } from "crypto";
import { ensurePlans } from "../src/lib/domain/billing/plans";

const db = new PrismaClient();
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const DEMO_WORKSPACE_SLUG = "foundrysignal-demo-team";
const DEMO_WORKSPACE_NAME = "FoundrySignal Demo Team";

// Idempotent demo entitlement: grant the demo workspace a RESEARCHER plan so
// plan-gated features (e.g. report export) work end-to-end for the demo team.
// DEMO ENTITLEMENT — replace with a real paid subscription; not a revenue path.
async function ensureDemoSubscription(workspaceId: string): Promise<void> {
  await ensurePlans();
  const plan = await db.plan.findUnique({ where: { code: "RESEARCHER" } });
  if (!plan) throw new Error("RESEARCHER plan missing after ensurePlans()");
  const currentPeriodEnd = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const existing = await db.subscription.findFirst({ where: { workspaceId }, orderBy: { createdAt: "desc" } });
  if (existing) {
    await db.subscription.update({
      where: { id: existing.id },
      data: { planId: plan.id, status: "ACTIVE", provider: "none", currentPeriodEnd, cancelAtPeriodEnd: false },
    });
    console.log("  ✓ demo subscription updated (RESEARCHER, ACTIVE, currentPeriodEnd +365d)");
  } else {
    await db.subscription.create({
      data: { workspaceId, planId: plan.id, status: "ACTIVE", provider: "none", currentPeriodEnd },
    });
    console.log("  ✓ demo subscription created (RESEARCHER, ACTIVE, currentPeriodEnd +365d)");
  }
}

interface DemoUserSeed {
  email: string;
  name: string;
  role: "ADMIN" | "ANALYST" | "VIEWER";
  userType: string;
  envKey: "DEMO_ANALYST_PASSWORD" | "DEMO_VIEWER_PASSWORD" | "DEMO_ADMIN_PASSWORD";
}

const DEMO_USERS: DemoUserSeed[] = [
  { email: "demo-analyst@foundrysignal.aiazimara.com", name: "Demo Analyst", role: "ANALYST", userType: "RESEARCH_ANALYST", envKey: "DEMO_ANALYST_PASSWORD" },
  { email: "demo-viewer@foundrysignal.aiazimara.com", name: "Demo Viewer", role: "VIEWER", userType: "LIMITED_PARTNER", envKey: "DEMO_VIEWER_PASSWORD" },
  { email: "demo-admin@foundrysignal.aiazimara.com", name: "Demo Admin", role: "ADMIN", userType: "RESEARCH_ANALYST", envKey: "DEMO_ADMIN_PASSWORD" },
];

interface SeedResult {
  workspaceId: string;
  users: Array<{ email: string; role: string; status: "created" | "updated" | "skipped"; detail?: string }>;
}

async function ensureDemoWorkspace(): Promise<string> {
  const ws = await db.workspace.upsert({
    where: { slug: DEMO_WORKSPACE_SLUG },
    create: { slug: DEMO_WORKSPACE_SLUG, name: DEMO_WORKSPACE_NAME, kind: "TEAM" },
    update: { name: DEMO_WORKSPACE_NAME, kind: "TEAM" },
  });
  return ws.id;
}

async function ensureDemoUser(seed: DemoUserSeed, workspaceId: string): Promise<SeedResult["users"][number]> {
  const password = process.env[seed.envKey];
  const normalizedEmail = seed.email.trim().toLowerCase();
  const eHash = sha256(normalizedEmail);

  const existing = await db.user.findUnique({ where: { emailHash: eHash } });
  if (!password) {
    if (existing) {
      // User already exists — keep membership in sync but never touch the password.
      await db.membership.upsert({
        where: { workspaceId_userId: { workspaceId, userId: existing.id } },
        create: { workspaceId, userId: existing.id, role: seed.role },
        update: { role: seed.role },
      });
      return { email: normalizedEmail, role: seed.role, status: "updated", detail: `env ${seed.envKey} missing — password unchanged, membership re-synced` };
    }
    return { email: normalizedEmail, role: seed.role, status: "skipped", detail: `${seed.envKey} not set — user not created` };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await db.user.upsert({
    where: { emailHash: eHash },
    create: {
      email: normalizedEmail,
      emailHash: eHash,
      name: seed.name,
      passwordHash,
      platformRole: "USER",
      userType: seed.userType,
      emailVerifiedAt: new Date(),
    },
    update: {
      name: seed.name,
      passwordHash,
      userType: seed.userType,
    },
  });
  await db.membership.upsert({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
    create: { workspaceId, userId: user.id, role: seed.role },
    update: { role: seed.role },
  });
  return { email: normalizedEmail, role: seed.role, status: existing ? "updated" : "created" };
}

async function ensureWatchlist(workspaceId: string, ventureIds: string[]): Promise<void> {
  const existing = await db.watchlist.findFirst({ where: { workspaceId, name: "Solana infrastructure — demo" } });
  const watchlist = existing
    ? existing
    : await db.watchlist.create({ data: { workspaceId, name: "Solana infrastructure — demo" } });
  for (const ventureId of ventureIds) {
    await db.watchlistItem.upsert({
      where: { watchlistId_ventureId: { watchlistId: watchlist.id, ventureId } },
      create: { watchlistId: watchlist.id, ventureId, note: "Demo coverage — track releases and evidence drift." },
      update: {},
    });
  }
}

async function ensureAlerts(workspaceId: string, jupiterId: string, heliusId: string): Promise<void> {
  const alertSpecs = [
    { ventureId: jupiterId, kind: "RELEASE_PUBLISHED", thresholdJson: JSON.stringify({ minStarsDelta: 10 }) },
    { ventureId: heliusId, kind: "REPO_ACTIVITY", thresholdJson: JSON.stringify({ commitsPerWeek: 5 }) },
  ];
  for (const spec of alertSpecs) {
    let alert = await db.alert.findFirst({ where: { workspaceId, ventureId: spec.ventureId, kind: spec.kind } });
    if (!alert) {
      alert = await db.alert.create({
        data: { workspaceId, ventureId: spec.ventureId, kind: spec.kind, thresholdJson: spec.thresholdJson, channels: "IN_APP", active: true },
      });
    }
    const eventCount = await db.alertEvent.count({ where: { alertId: alert.id } });
    if (eventCount === 0) {
      await db.alertEvent.create({
        data: { alertId: alert.id, summary: "Release v0.x published — review the changelog against tracked claims.", payloadJson: JSON.stringify({ source: "seed-roles" }) },
      });
      await db.alertEvent.create({
        data: { alertId: alert.id, summary: "Weekly repo activity digest: steady commit cadence.", payloadJson: JSON.stringify({ source: "seed-roles" }), readAt: new Date() },
      });
    }
  }
}

async function ensureSavedSearch(workspaceId: string): Promise<void> {
  const name = "High-activity Solana infrastructure";
  const existing = await db.savedSearch.findFirst({ where: { workspaceId, name } });
  if (existing) return;
  await db.savedSearch.create({
    data: {
      workspaceId,
      name,
      queryJson: JSON.stringify({ ecosystem: "SOLANA", category: "INFRA", sort: "releases", limit: 25 }),
    },
  });
}

async function ensureNotes(workspaceId: string, ventureIds: string[]): Promise<void> {
  const notes = [
    { body: "Demo onboarding: start with the Jupiter dossier — check the claims tab against the evidence graph before trusting any single source.", ventureIndex: 0 },
    { body: "Demo onboarding: the alert feed is seeded with one read and one unread event; reconcile the unread one against the release page.", ventureIndex: 0 },
    { body: "Demo onboarding: raise a dispute on a claim if the evidence looks stale — moderators see these in the admin console.", ventureIndex: ventureIds.length > 1 ? 1 : 0 },
  ];
  for (const note of notes) {
    const ventureId = ventureIds[note.ventureIndex];
    if (!ventureId) continue;
    const existing = await db.workspaceNote.findFirst({ where: { workspaceId, ventureId, body: note.body } });
    if (!existing) {
      await db.workspaceNote.create({ data: { workspaceId, ventureId, body: note.body } });
    }
  }
}

async function ensureResearchContent(workspaceId: string, userId: string, userEmail: string, jupiterId: string): Promise<void> {
  const question = "What does the collected evidence say about Jupiter's current release posture?";
  const existing = await db.researchRun.findFirst({ where: { workspaceId, ventureId: jupiterId, userId, question } });
  if (existing) return;

  // Cite real evidence where the portfolio seed provided it; otherwise an
  // explicit insufficient-evidence report with no citations.
  const evidence = await db.evidenceSource.findMany({ where: { ventureId: jupiterId }, take: 3, orderBy: { collectedAt: "desc" } });
  const citations: Record<string, { evidenceId: string; provider: string; url: string | null; collectedAt: string; verification: string }> = {};
  evidence.forEach((ev, i) => {
    citations[`c${i + 1}`] = {
      evidenceId: ev.id,
      provider: ev.provider,
      url: ev.url,
      collectedAt: ev.collectedAt.toISOString(),
      verification: ev.verification,
    };
  });

  const sections = evidence.length > 0
    ? [
        { id: "summary", heading: "Evidence summary", body: `Collected evidence (${evidence.length} record${evidence.length === 1 ? "" : "s"}) shows active development on the tracked repositories with source URLs and verification classes attached. See [c1] for the primary source.` },
        { id: "assessment", heading: "Assessment", body: "Findings are limited to what the collected records demonstrate. This report asserts no claim beyond the cited evidence; anything not covered by these records is explicitly insufficient evidence." },
        { id: "caveats", heading: "Insufficient evidence", body: "On-chain adoption metrics, treasury movements and founder attribution are not covered by the cited records and are reported as unknown rather than inferred." },
      ]
    : [
        { id: "summary", heading: "Evidence summary", body: "Insufficient evidence: no collected records were available for this venture at generation time. Run the collectors first (scripts/seed-portfolio.ts) and re-generate." },
      ];

  const run = await db.researchRun.create({
    data: {
      workspaceId,
      ventureId: jupiterId,
      userId,
      question,
      status: "COMPLETED",
      startedAt: new Date(Date.now() - 120_000),
      finishedAt: new Date(),
      tokensIn: 900,
      tokensOut: 420,
    },
  });
  await db.researchReport.create({
    data: {
      runId: run.id,
      workspaceId,
      ventureId: jupiterId,
      title: `Jupiter — demo research brief (${userEmail.split("@")[0]})`,
      sectionsJson: JSON.stringify(sections),
      citationsJson: JSON.stringify(citations),
      validationStatus: "VALID",
      createdById: userId,
    },
  });
}

async function main() {
  console.log("Seeding FoundrySignal demo team…");
  const workspaceId = await ensureDemoWorkspace();
  console.log(`  ✓ workspace ${DEMO_WORKSPACE_NAME} (${workspaceId})`);

  const result: SeedResult = { workspaceId, users: [] };
  for (const seed of DEMO_USERS) {
    const outcome = await ensureDemoUser(seed, workspaceId);
    result.users.push(outcome);
    const suffix = outcome.detail ? ` — ${outcome.detail}` : "";
    console.log(`  ${outcome.status === "skipped" ? "↷" : "✓"} ${outcome.email} (${outcome.role})${suffix}`);
  }

  await ensureDemoSubscription(workspaceId);

  // Reference ventures for demo content (seeded by scripts/seed-portfolio.ts).
  const [jupiter, helius] = await Promise.all([
    db.venture.findUnique({ where: { slug: "jupiter-exchange" }, select: { id: true } }),
    db.venture.findUnique({ where: { slug: "helius" }, select: { id: true } }),
  ]);
  if (!jupiter) {
    console.warn("  ! venture 'jupiter-exchange' not found — run `bun scripts/seed-portfolio.ts` first; skipping watchlist/alerts/notes/research seeds");
    const missing = result.users.filter((u) => u.status === "skipped");
    if (missing.length === DEMO_USERS.length) {
      console.warn("  ! every demo user was skipped — no demo content created");
      process.exit(0);
    }
    return;
  }
  const heliusId = helius?.id ?? jupiter.id;
  const ventureIds = [jupiter.id, heliusId];

  await ensureWatchlist(workspaceId, ventureIds);
  console.log("  ✓ watchlist seeded");
  await ensureAlerts(workspaceId, jupiter.id, heliusId);
  console.log("  ✓ alert rules + events seeded");
  await ensureSavedSearch(workspaceId);
  console.log("  ✓ saved search seeded");
  await ensureNotes(workspaceId, ventureIds);
  console.log("  ✓ onboarding notes seeded");

  const memberEmails = result.users.filter((u) => u.status !== "skipped").map((u) => u.email);
  for (const email of memberEmails) {
    const user = await db.user.findUnique({ where: { emailHash: sha256(email) }, select: { id: true, email: true } });
    if (user) await ensureResearchContent(workspaceId, user.id, user.email, jupiter.id);
  }
  if (memberEmails.length > 0) {
    console.log("  ✓ sample research run + report seeded per demo user");
  } else {
    console.log("  ↷ no demo users seeded — skipping research content");
  }

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
