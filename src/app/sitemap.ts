import type { MetadataRoute } from "next";
import { PUBLIC_ROUTES } from "@/lib/client/routes";
import { SITE_URL } from "@/lib/seo";

// Sitemap for the crawlable public surface. Authenticated platform surfaces
// (discover, dossiers, research, settings, admin) are intentionally excluded —
// they require a session and are disallowed in robots.txt. When public dossier
// pages ship, their slugs belong here with per-venture lastModified.
export default function sitemap(): MetadataRoute.Sitemap {
  const generatedAt = new Date();
  return PUBLIC_ROUTES.map((r) => {
    const weekly = ["/", "/product", "/methodology", "/evidence", "/pricing"];
    const monthly = ["/ecosystem", "/api-docs", "/about", "/contact", "/faq", "/security", "/security-disclosure"];
    return {
      url: `${SITE_URL}${r.path}`,
      lastModified: generatedAt,
      changeFrequency: (weekly.includes(r.path)
        ? "weekly"
        : monthly.includes(r.path)
          ? "monthly"
          : "yearly") as MetadataRoute.Sitemap[number]["changeFrequency"],
      priority: r.priority,
    };
  });
}
