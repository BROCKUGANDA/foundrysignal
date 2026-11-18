// Central SEO / AEO / GEO configuration.
// Every page's metadata and JSON-LD derives from here so canonical URLs,
// geo signals and structured data stay consistent across the site.
//
// Geo targeting note: signals below (geo.* meta, OG locale, Organization
// address) declare the operator's targeting for the United Arab Emirates
// (Dubai). The address block is operator-declared configuration — update it
// when the registered entity details are finalized; it is never inferred.

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://foundrysignal.aiazimara.com"
).replace(/\/+$/, "");

export const SITE = {
  name: "FoundrySignal",
  tagline: "See the builders. Verify the work. Understand the market.",
  description:
    "FoundrySignal is the intelligence layer for onchain venture capital: discover early-stage Solana ventures, investigate founders, trace shipped software, inspect evidence, and understand token structures. Research first — not speculation.",
  locale: "en_AE" as string,
  localeAlternates: ["en_US", "en_GB"] as string[],
  geo: {
    region: "AE-DU", // ISO 3166-2 — Dubai, United Arab Emirates
    placename: "Dubai",
    country: "United Arab Emirates",
    position: "25.2048;55.2708",
    icbm: "25.2048, 55.2708",
  },
  address: {
    // Operator-declared geo targeting (update when entity registration completes)
    locality: "Dubai",
    country: "AE",
  },
  twitter: "@foundrysignal", // placeholder handle — update when the account exists
} as const;

/** Canonical URL for a path. */
export function siteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

interface PageMetaInput {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  noIndex?: boolean;
}

type MetadataLike = {
  title: string;
  description: string;
  keywords?: string[];
  alternates: { canonical: string };
  openGraph: {
    title: string;
    description: string;
    url: string;
    siteName: string;
    type: "website";
    locale: string;
    alternateLocale: string[];
  };
  twitter: { card: "summary_large_image"; title: string; description: string };
  robots: { index: boolean; follow: boolean };
};

/** Uniform per-page metadata: canonical + OG + geo-consistent twitter card. */
export function pageMetadata(input: PageMetaInput): MetadataLike {
  const url = siteUrl(input.path);
  return {
    title: input.title,
    description: input.description,
    ...(input.keywords && input.keywords.length > 0 ? { keywords: input.keywords } : {}),
    alternates: { canonical: url },
    openGraph: {
      title: input.title,
      description: input.description,
      url,
      siteName: SITE.name,
      type: "website" as const,
      locale: SITE.locale,
      alternateLocale: [...SITE.localeAlternates],
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description: input.description,
    },
    robots: input.noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true },
  };
}

// ─── JSON-LD builders ─────────────────────────────────────────────────

/** Organization (with Dubai/UAE entity signals for geo targeting). */
export function organizationLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE.name,
    url: SITE_URL,
    logo: siteUrl("/brand/logo-horizontal.svg"),
    sameAs: ["https://aiazimara.com/"],
    description: SITE.description,
    address: {
      "@type": "PostalAddress",
      addressLocality: SITE.address.locality,
      addressCountry: SITE.address.country,
    },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: "product@foundrysignal.aiazimara.com",
      availableLanguage: ["English"],
    },
  };
}

/** WebSite + SearchAction (site links box / AEO discovery). */
export function websiteLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE.name,
    url: SITE_URL,
    description: SITE.description,
    inLanguage: "en",
    publisher: { "@type": "Organization", name: SITE.name, url: SITE_URL },
  };
}

/** WebPage with speakable content (voice assistants / answer engines). */
export function webPageLd(input: {
  path: string;
  name: string;
  description: string;
  speakableCss?: string[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: input.name,
    description: input.description,
    url: siteUrl(input.path),
    isPartOf: { "@type": "WebSite", name: SITE.name, url: SITE_URL },
    inLanguage: "en",
    ...(input.speakableCss && input.speakableCss.length > 0
      ? {
          speakable: {
            "@type": "SpeakableSpecification",
            cssSelector: input.speakableCss,
          },
        }
      : {}),
  };
}

/** FAQPage — the core AEO primitive: question/answer pairs answer engines can lift verbatim. */
export function faqPageLd(faqs: Array<{ q: string; a: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

/** BreadcrumbList for nested pages. */
export function breadcrumbLd(items: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: siteUrl(it.path),
    })),
  };
}

/** ContactPage for /contact. */
export function contactPageLd() {
  return {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    name: "Contact FoundrySignal",
    description:
      "Research and product questions, security disclosure, enterprise API access and the Issuer Response Center.",
    url: siteUrl("/contact"),
    isPartOf: { "@type": "WebSite", name: SITE.name, url: SITE_URL },
    inLanguage: "en",
  };
}


/** SoftwareApplication for the product page. */
export function softwareApplicationLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE.name,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: siteUrl("/product"),
    description:
      "A research terminal for early-stage onchain ventures — venture dossiers, founder intelligence, repository intelligence and an evidence-graded AI analyst.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      url: siteUrl("/pricing"),
    },
    publisher: { "@type": "Organization", name: SITE.name, url: SITE_URL },
  };
}

// ─── AEO FAQ corpus ───────────────────────────────────────────────────
// Single source of truth: rendered on /faq (visible content + FAQPage
// JSON-LD) and mirrored into public/llms.txt for AI answer engines.
export const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "What is FoundrySignal?",
    a: "FoundrySignal is a research and intelligence platform for early-stage Solana ventures. It builds a venture dossier per company — founders, shipped software, evidence, token structure and market context — where every claim carries provenance back to its original source.",
  },
  {
    q: "Is FoundrySignal investment advice?",
    a: "No. FoundrySignal is research information only. It aggregates public data into evidence-graded dossiers and never issues recommendations to buy or sell any asset.",
  },
  {
    q: "How is evidence verified on FoundrySignal?",
    a: "Evidence is classified only by a deterministic engine: INDEPENDENTLY_CORROBORATED when two or more independent source types agree, SOURCE_CONFIRMED for one authoritative provider observation, SELF_ASSERTED for the venture's own material, FOUNDER_PROVIDED for issuer workflow input, DISPUTED when contradicting evidence exists, STALE past freshness policy, or UNKNOWN. No human can fabricate a verification state.",
  },
  {
    q: "Which blockchain does FoundrySignal cover?",
    a: "Solana is the primary ecosystem. Onchain reads run through @solana/kit with slot-level provenance — mint metadata, authorities, token accounts and bounded transaction history. Wallet connectivity follows the Wallet Standard; signing always happens in the user's own wallet.",
  },
  {
    q: "Can I trade tokens on FoundrySignal?",
    a: "Trading execution is deliberately disabled. A complete Jupiter Swap API V2 pipeline exists behind a release governance system that requires four independent review gates — product, legal/jurisdiction, provider integration and security — plus an execution kill switch to be cleared before any execution path activates.",
  },
  {
    q: "Where is FoundrySignal based?",
    a: "FoundrySignal operates from Dubai, United Arab Emirates, and serves a global research audience. The platform targets the UAE market as its primary region.",
  },
  {
    q: "How does the AI analyst avoid making things up?",
    a: "The research analyst can only cite evidence records that were actually collected for your workspace, and citations are validated server-side before publication. When evidence cannot establish a point, the report states 'insufficient evidence' explicitly instead of inventing an answer.",
  },
  {
    q: "Where does FoundrySignal get its data?",
    a: "Public data only, collected server-side through provider adapters: GitHub via the authorized REST API, Solana via @solana/kit RPC reads, websites via an SSRF-guarded fetcher, and market context via Jupiter's public APIs. Every observation is stored with provider, timestamps and a SHA-256 content hash.",
  },
];
