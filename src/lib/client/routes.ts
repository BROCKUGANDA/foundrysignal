// URL <-> section mapping. Every product view lives at a real, shareable,
// refreshable URL. Unknown paths resolve to null and render the branded
// NotFound view instead of the framework 404.

export type Section =
  | "home" | "product" | "methodology" | "evidence-explainer" | "ecosystem" | "api"
  | "pricing" | "about" | "contact" | "legal" | "privacy" | "security-disclosure"
  | "auth"
  | "discover" | "dossier" | "research" | "watchlists" | "markets" | "settings" | "admin"
  | "design-system" | "trade";

export interface RouteMatch {
  section: Section;
  params: Record<string, string>;
}

const MARKETING_PATHS: Record<string, Section> = {
  "": "home",
  product: "product",
  methodology: "methodology",
  evidence: "evidence-explainer",
  ecosystem: "ecosystem",
  "api-docs": "api",
  pricing: "pricing",
  about: "about",
  contact: "contact",
  legal: "legal",
  privacy: "privacy",
  "security-disclosure": "security-disclosure",
  auth: "auth",
  discover: "discover",
  research: "research",
  watchlists: "watchlists",
  markets: "markets",
  settings: "settings",
  admin: "admin",
  "design-system": "design-system",
  "trade": "trade",
};

const SECTION_PATHS: Partial<Record<Section, string>> = {
  home: "/",
  product: "/product",
  methodology: "/methodology",
  "evidence-explainer": "/evidence",
  ecosystem: "/ecosystem",
  api: "/api-docs",
  pricing: "/pricing",
  about: "/about",
  contact: "/contact",
  legal: "/legal",
  privacy: "/privacy",
  "security-disclosure": "/security-disclosure",
  auth: "/auth",
  discover: "/discover",
  research: "/research",
  watchlists: "/watchlists",
  markets: "/markets",
  settings: "/settings",
  admin: "/admin",
  "design-system": "/design-system",
  "trade": "/trade",
};

/** Builds a canonical URL for a section. Missing dossier slugs fall back to /discover. */
export function sectionToPath(section: Section, params: Record<string, string> = {}): string {
  if (section === "dossier") {
    const slug = params.slug?.trim();
    if (!slug) return "/discover";
    return `/ventures/${encodeURIComponent(slug)}`;
  }
  const base = SECTION_PATHS[section] ?? "/";
  if (section === "research") {
    const qs = new URLSearchParams();
    if (params.venture) qs.set("venture", params.venture);
    if (params.run) qs.set("run", params.run);
    const s = qs.toString();
    return s ? `${base}?${s}` : base;
  }
  // Preserve a carried-over search query for the discover view
  if (section === "discover" && params.q) {
    return `${base}?q=${encodeURIComponent(params.q)}`;
  }
  return base;
}

/** Parses a location into a route match; null means "unknown route" (branded 404). */
export function pathToSection(pathname: string, search: string): RouteMatch | null {
  let path = pathname;
  try {
    path = decodeURI(pathname);
  } catch {
    // malformed percent-encoding — fall back to raw pathname
  }
  path = path.replace(/\/+$/, "") || "/";
  const segs = path.split("/").filter(Boolean);

  // /ventures/[slug] → dossier
  if (segs[0] === "ventures") {
    const slug = segs[1];
    if (!slug) return null; // /ventures alone is not a route
    if (segs.length > 2) return null;
    return { section: "dossier", params: { slug } };
  }

  if (segs.length > 1) return null; // all other routes are single-segment

  const section = MARKETING_PATHS[segs[0] ?? ""];
  if (!section) return null;

  const params: Record<string, string> = {};
  if (search) {
    const qs = new URLSearchParams(search);
    if (section === "research") {
      const venture = qs.get("venture");
      const run = qs.get("run");
      if (venture) params.venture = venture;
      if (run) params.run = run;
    }
    if (section === "discover") {
      const q = qs.get("q");
      if (q) params.q = q;
    }
    if (section === "auth") {
      const mode = qs.get("mode");
      if (mode === "login" || mode === "register") params.mode = mode;
    }
  }
  return { section, params };
}

/** Sitemap entries for public marketing routes. */
export const PUBLIC_ROUTES: Array<{ path: string; priority: number }> = [
  { path: "/", priority: 1 },
  { path: "/product", priority: 0.8 },
  { path: "/methodology", priority: 0.8 },
  { path: "/evidence", priority: 0.7 },
  { path: "/ecosystem", priority: 0.6 },
  { path: "/api-docs", priority: 0.6 },
  { path: "/pricing", priority: 0.9 },
  { path: "/about", priority: 0.5 },
  { path: "/contact", priority: 0.5 },
  { path: "/legal", priority: 0.3 },
  { path: "/privacy", priority: 0.3 },
  { path: "/security-disclosure", priority: 0.4 },
];

const SECTION_TITLES: Record<Section, string> = {
  home: "See the builders. Verify the work. Understand the market.",
  product: "Product",
  methodology: "Methodology",
  "evidence-explainer": "Evidence system",
  ecosystem: "Ecosystem",
  api: "API",
  pricing: "Pricing",
  about: "About",
  contact: "Contact",
  legal: "Legal",
  privacy: "Privacy",
  "security-disclosure": "Security disclosure",
  auth: "Sign in",
  discover: "Discover",
  dossier: "Venture dossier",
  research: "AI analyst",
  watchlists: "Watchlists",
  markets: "Markets",
  settings: "Settings",
  admin: "Administration",
  "trade": "Trading",
  "design-system": "Design system",
};

export function titleForSection(section: Section): string {
  return SECTION_TITLES[section] ?? "FoundrySignal";
}
