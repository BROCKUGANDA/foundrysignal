import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

// Crawler policy.
// - Search engines: full access to the public marketing/methodology surface;
//   authenticated platform surfaces stay out of the index.
// - AI answer engines (AEO): explicit allowances for the major AI crawlers so
//   answers can cite FoundrySignal methodology and public pages.
// - Aggressive scrapers that ignore robots.txt are handled at the edge, not here.
export default function robots(): MetadataRoute.Robots {
  const platformDisallows = [
    "/api/",
    "/discover",
    "/ventures/",
    "/research",
    "/watchlists",
    "/markets",
    "/trade",
    "/settings",
    "/admin",
    "/auth",
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
      {
        // Never index or crawl authenticated admin surfaces, for anyone.
        userAgent: "*",
        disallow: ["/admin", "/settings", "/api/v1/admin", "/api/v1/trading"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
