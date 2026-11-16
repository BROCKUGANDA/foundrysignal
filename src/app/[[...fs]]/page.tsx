import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { FoundrySignalApp } from "@/components/fs/app";
import { MarketingPage, marketingMetadata, MARKETING_SECTION_PATHS, type MarketingSection } from "@/components/fs/marketing/page";
import { pathToSection } from "@/lib/client/routes";

/**
 * Optional catch-all: every page URL resolves here.
 *
 * Rendering strategy (SSR/CSR split):
 *  - Marketing + legal sections → server-rendered RSC page (full HTML for
 *    crawlers/answer engines, JSON-LD included, small client islands for nav).
 *  - Platform sections (auth, discover, dossier, research, watchlists, markets,
 *    settings, admin) → client app shell (session-gated, realtime queries).
 *  - Unknown paths call notFound() → real HTTP 404 with the branded page.
 */
export const dynamicParams = true;

/** Pricing reads the live plan catalog; ISR keeps it fresh without hammering the DB. */
export const revalidate = 300;

// Section keys, not URL slugs: "/" resolves to `home`, "/evidence" to
// `evidence-explainer` and "/api-docs" to `api`. Classifying by the raw URL
// segment silently marks those public pages noindex.
const MARKETING_SECTION_SET = new Set<string>(Object.keys(MARKETING_SECTION_PATHS));

export function generateStaticParams() {
  return [
    { fs: [] },
    { fs: ["product"] },
    { fs: ["methodology"] },
    { fs: ["evidence"] },
    { fs: ["ecosystem"] },
    { fs: ["api-docs"] },
    { fs: ["pricing"] },
    { fs: ["about"] },
    { fs: ["contact"] },
    { fs: ["legal"] },
    { fs: ["privacy"] },
    { fs: ["security-disclosure"] },
    { fs: ["auth"] },
    { fs: ["discover"] },
    { fs: ["research"] },
    { fs: ["watchlists"] },
    { fs: ["markets"] },
    { fs: ["settings"] },
    { fs: ["admin"] },
    { fs: ["design-system"] },
    { fs: ["trade"] },
  ];
}

export async function generateMetadata({ params }: { params: Promise<{ fs?: string[] }> }): Promise<Metadata> {
  const { fs } = await params;
  const pathname = "/" + (fs ?? []).join("/");

  // Classify by resolved section, not the raw URL slug. URL slugs differ from
  // section keys on / (home), /evidence (evidence-explainer) and /api-docs
  // (api), and a mismatch here silently deindexes public marketing pages.
  const match = pathToSection(pathname, "");
  if (!match) return { title: "Page not found", robots: { index: false, follow: false } };

  if (MARKETING_SECTION_SET.has(match.section)) {
    return marketingMetadata(match.section as MarketingSection);
  }

  // App surfaces: noindex (session-gated), descriptive title only.
  const title = match.section === "dossier" ? "Venture dossier" : undefined;
  return {
    ...(title ? { title } : {}),
    robots: { index: false, follow: false },
  };
}

export default async function CatchAllPage({ params }: { params: Promise<{ fs?: string[] }> }) {
  const { fs } = await params;
  const pathname = "/" + (fs ?? []).join("/");
  const match = pathToSection(pathname, "");
  if (!match) notFound();

  if (MARKETING_SECTION_SET.has(match.section)) {
    return <MarketingPage section={match.section as MarketingSection} />;
  }
  return <FoundrySignalApp />;
}
