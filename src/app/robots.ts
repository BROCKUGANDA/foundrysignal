import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

// Crawler policy.
// - Search engines: full access to the public marketing/methodology surface;
//   authenticated platform surfaces stay out of the index.
// - AI answer engines (AEO): explicit allowances for the major AI crawlers so
//   answers can cite FoundrySignal methodology and public pages.
// - Aggressive scrapers that ignore robots.txt are handled at the edge, not here.
// - Application API routes are session-authenticated; /api/v1/pricing and
//   /api/v1/capabilities are public configuration endpoints and stay crawlable.
//   Only the administrative/trading API surfaces are explicitly disallowed.
export default function robots(): MetadataRoute.Robots {
  const platformDisallows = [
    "/discover",
    "/ventures/",
    "/research",
    "/watchlists",
    "/markets",
    "/settings",
    "/admin",
    "/auth",
    "/api/v1/admin",
    "/api/v1/trading",
  ];

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Platform surfaces require an authenticated session — keep crawlers out.
        disallow: platformDisallows,
      },
      {
        // AI training/answer crawlers — allowed on public pages only.
        userAgent: ["GPTBot", "OAI-SearchBot", "ChatGPT-User"],
        allow: "/",
        disallow: platformDisallows,
      },
      {
        userAgent: ["ClaudeBot", "Claude-SearchBot", "Claude-User", "anthropic-ai"],
        allow: "/",
        disallow: platformDisallows,
      },
      {
        userAgent: ["PerplexityBot", "Perplexity-User"],
        allow: "/",
        disallow: platformDisallows,
      },
      {
        userAgent: ["Google-Extended", "Applebot-Extended", "meta-externalagent", "Amazonbot", "Bytespider"],
        allow: "/",
        disallow: platformDisallows,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
