// Server instrumentation: registers collectors and starts the durable worker
// loop when the server process boots (dev + prod). Also bootstraps governance
// defaults: trading release gates and the admin account (env-declared only).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { registerJob } = await import("@/lib/jobs/queue");
  const { startWorker } = await import("@/lib/jobs/queue");

  // Register all handlers (import side effects) and make sure research/alert
  // handlers exist by referencing the modules.
  await import("@/lib/jobs/collectors");
  await import("@/lib/jobs/handlers");
  void registerJob; // imported for clarity; registration happens in module init
  startWorker();

  // Bootstrap platform governance — never throws past startup.
  try {
    const { ensureTradingGates } = await import("@/lib/domain/trading/gates");
    await ensureTradingGates();

    const adminEmail = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
    if (adminEmail) {
      const { db } = await import("@/lib/db");
      const { emailHash } = await import("@/lib/auth/session");
      const { recordAudit } = await import("@/lib/domain/shared/audit");
      const user = await db.user.findUnique({ where: { emailHash: emailHash(adminEmail) } });
      if (user && user.platformRole !== "PLATFORM_ADMIN") {
        await db.user.update({ where: { id: user.id }, data: { platformRole: "PLATFORM_ADMIN" } });
        await recordAudit({
          actorId: null,
          action: "AUTH_ROLE_BOOTSTRAP",
          targetType: "USER",
          targetId: user.id,
          summary: `PLATFORM_ADMIN granted via ADMIN_BOOTSTRAP_EMAIL at boot`,
        });
        console.log(JSON.stringify({ level: "info", component: "instrumentation", message: "Admin bootstrap applied" }));
      }
    }
  } catch (err) {
    console.error(JSON.stringify({ level: "error", component: "instrumentation", message: `Governance bootstrap deferred: ${String(err)}` }));
  }

  console.log(JSON.stringify({ level: "info", component: "instrumentation", message: "Worker loop registered and started" }));
}
