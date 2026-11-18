// Website adapter — server-side fetch of venture websites through the
// SSRF-guarded layer. Extracts metadata; content stored with SHA-256 hash.
// Sites that block server-side collectors produce honest PROVIDER_BLOCKED state.

import { guardedFetch, ProviderError } from "./framework";
import { createHash } from "crypto";

export interface WebsiteMetadata {
  finalUrl: string;
  title: string | null;
  description: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  faviconUrl: string | null;
  contentHash: string;
  fetchedAt: Date;
  status: number;
}

function metaContent(html: string, attr: "name" | "property", key: string): string | null {
  const re = new RegExp(
    `<meta[^>]*${attr}=["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*content=["']([^"']*)["']`,
    "i"
  );
  const re2 = new RegExp(
    `<meta[^>]*content=["']([^"']*)["'][^>]*${attr}=["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
    "i"
  );
  const m = html.match(re) ?? html.match(re2);
  return m ? m[1] : null;
}

export async function collectWebsite(url: string): Promise<WebsiteMetadata> {
  let res;
  try {
    res = await guardedFetch(url, { timeoutMs: 12_000, maxBytes: 512 * 1024 });
  } catch (err) {
    if (err instanceof ProviderError) {
      if (err.kind === "PERMANENT") throw new ProviderError("PROVIDER_BLOCKED", `Website blocked collection: ${err.message}`, false);
      throw err;
    }
    throw err;
  }
  const html = res.body;
  const titleMatch = html.match(/<title[^>]*>([^<]{0,300})<\/title>/i);
  const iconMatch = html.match(/<link[^>]*rel=["'][^"']*icon[^"']*["'][^>]*href=["']([^"']+)["']/i);
  let faviconUrl: string | null = null;
  if (iconMatch) {
    try {
      faviconUrl = new URL(iconMatch[1], res.finalUrl).toString();
    } catch {
      faviconUrl = null;
    }
  }

  return {
    finalUrl: res.finalUrl,
    title: titleMatch ? titleMatch[1].trim() : null,
    description: metaContent(html, "name", "description"),
    ogTitle: metaContent(html, "property", "og:title"),
    ogDescription: metaContent(html, "property", "og:description"),
    ogImage: metaContent(html, "property", "og:image"),
    faviconUrl,
    contentHash: createHash("sha256").update(html).digest("hex"),
    fetchedAt: new Date(),
    status: res.status,
  };
}
