import { handler, ok } from "@/lib/contracts/http";
import { getTradingReadiness } from "@/lib/domain/trading/gates";
import { getCheckoutConfig } from "@/lib/domain/billing/crypto";
import { db } from "@/lib/db";
import { resolveSession } from "@/lib/auth/session";

/** Capability registry — explicit feature-availability flags (Execution Rule 12). */
export const GET = handler(async ({ requestId }) => {
  const session = await resolveSession();
  const user = session ? await db.user.findUnique({ where: { id: session.userId } }) : null;
  // Detailed capability data (env var names, provider config, trading review
  // gates) is platform-administrator-only. Everyone else gets the public
  // availability flags that the shell footer needs — nothing that reads as an
  // owner/admin control surface.
  const isPlatformAdmin =
    !!user && (user.platformRole === "PLATFORM_ADMIN" || user.platformRole === "MODERATOR");
  // Trading availability is computed from the release-gate system, not a
  // hardcoded constant: all review gates APPROVED + kill switch CLEAR +
  // TRADING_ENABLED=true. Until then it reports GATED with the real reason.
  const trading = await getTradingReadiness();
  const capabilities = {
    githubCollection: {
      available: !!process.env.GITHUB_TOKEN,
      level: process.env.GITHUB_TOKEN ? "AUTHENTICATED" : "UNAUTHENTICATED_RATE_LIMITED",
      requiredEnv: process.env.GITHUB_TOKEN ? [] : ["GITHUB_TOKEN"],
    },
    solanaOnchain: { available: true, level: "PUBLIC_RPC", requiredEnv: [], upgrade: "SOLANA_RPC_URL / HELIUS_API_KEY" },
    marketData: { available: true, level: "JUPITER_LITE", requiredEnv: [] },
    tradingExecution: {
      available: trading.executionAllowed,
      level: trading.executionAllowed ? "ENABLED" : "GATED",
      reason: trading.executionAllowed
        ? "All review gates approved, kill switch clear, execution env flag set."
        : `Execution disabled pending release gates — ${trading.blockReason}.`,
      requiredEnv: trading.executionAllowed ? [] : ["TRADING_ENABLED=true"],
      reviewGatesComplete: trading.conditions.allReviewsApproved,
      killSwitchClear: trading.conditions.killSwitchClear,
    },
    billing: (() => {
      const config = getCheckoutConfig();
      return {
        available: config.configured,
        level: config.configured ? "CONFIGURED_USDC" : "NOT_CONFIGURED",
        provider: config.provider,
        checkoutReady: config.checkoutReady,
        requiredEnv: config.missingEnv,
        mint: config.mint,
        destination: config.destination,
        reason: config.configured
          ? "USDC checkout configured — Solana settlement verified onchain before entitlement."
          : "USDC checkout not configured — checkout surfaces an explicit configuration-required state; no payments are simulated.",
      };
    })(),
    email: (() => {
      const resend = !!process.env.RESEND_API_KEY;
      const smtp = !!process.env.SMTP_URL;
      return {
        available: resend || smtp,
        level: resend ? "CONFIGURED_RESEND" : smtp ? "CONFIGURED_SMTP" : "NOT_CONFIGURED",
        requiredEnv: resend || smtp ? [] : ["RESEND_API_KEY"],
        from: process.env.EMAIL_FROM ?? null,
      };
    })(),
    aiResearch: { available: true, level: "REAL_LLM", requiredEnv: [] },
    heliusIndexed: { available: !!process.env.HELIUS_API_KEY, level: process.env.HELIUS_API_KEY ? "CONFIGURED" : "NOT_CONFIGURED", requiredEnv: process.env.HELIUS_API_KEY ? [] : ["HELIUS_API_KEY"] },
    oauth: (() => {
      const github = !!(process.env.GITHUB_OAUTH_CLIENT_ID && process.env.GITHUB_OAUTH_CLIENT_SECRET);
      const google = !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
      const providers = [github ? "GITHUB" : null, google ? "GOOGLE" : null].filter(Boolean);
      const available = providers.length > 0;
      return {
        available,
        level: available ? "CREDENTIALS_CONFIGURED" : "NOT_CONFIGURED",
        providers,
        requiredEnv: available ? [] : ["GITHUB_OAUTH_CLIENT_ID/GITHUB_OAUTH_CLIENT_SECRET", "GOOGLE_OAUTH_CLIENT_ID/GOOGLE_OAUTH_CLIENT_SECRET"],
        note: available
          ? "OAuth client credentials present; interactive sign-in requires provider callback registration and route enablement in this deployment."
          : "No OAuth provider credentials configured.",
      };
    })(),
    mfa: (() => {
      const available = !!(process.env.MFA_ENCRYPTION_KEY || process.env.MFA_PROVIDER_KEY);
      return {
        available,
        level: available ? "CONFIGURED" : "NOT_CONFIGURED",
        requiredEnv: available ? [] : ["MFA_ENCRYPTION_KEY"],
        note: available
          ? "MFA encryption key configured; TOTP enrollment/verification depends on user-level setup."
          : "No MFA key configured.",
      };
    })(),
  };
  if (!isPlatformAdmin) {
    return {
      payload: ok(
        {
          public: true,
          tradingExecution: { available: capabilities.tradingExecution.available },
          billing: { available: capabilities.billing.available },
          githubCollection: { available: capabilities.githubCollection.available },
          solanaOnchain: { available: capabilities.solanaOnchain.available },
          marketData: { available: capabilities.marketData.available },
          email: { available: capabilities.email.available },
        },
        requestId
      ),
    };
  }
  return { payload: ok(capabilities, requestId) };
});
