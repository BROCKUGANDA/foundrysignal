// Server-rendered marketing pages â€” the crawlable public surface.
// Every marketing route renders full HTML on the server (SEO/AEO), injects
// JSON-LD structured data, and stays interactive through small client islands
// (nav, session CTA). Pricing reads the real plan catalog from the database.

import Link from "next/link";
import { MarketingNav } from "./nav";
import {
  MarketingFooter,
  Hero,
  ProofStrip,
  HomeDifferentiator,
  HomeCTA,
  DocSection,
  FaqSection,
} from "./content";
import { JsonLd } from "./json-ld";
import { Badge, Button, Card, EmptyState } from "@/components/fs";
import {
  pageMetadata,
  organizationLd,
  websiteLd,
  contactPageLd,
  faqPageLd,
  webPageLd,
  softwareApplicationLd,
  SITE,
  breadcrumbLd,
  siteUrl,
  FAQS,
} from "@/lib/seo";
import { listActivePlans } from "@/lib/domain/billing/plans";

export type MarketingSection =
  | "home" | "product" | "methodology" | "evidence-explainer" | "ecosystem" | "api"
  | "pricing" | "about" | "contact" | "legal" | "privacy" | "security-disclosure"
  | "faq" | "legal-terms" | "security";

/** URL path for each marketing section (single source of truth for links/canonicals). */
export const MARKETING_SECTION_PATHS: Record<MarketingSection, string> = {
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
  faq: "/faq",
  "legal-terms": "/terms",
  security: "/security",
};

interface SectionMeta {
  title: string;
  description: string;
  keywords?: string[];
}

export const SECTION_META: Record<MarketingSection, SectionMeta> = {
  home: {
    title: "FoundrySignal â€” See the builders. Verify the work. Understand the market.",
    description: SITE.description,
    keywords: ["venture intelligence", "Solana", "evidence graph", "founder research", "onchain analytics", "GitHub diligence", "Dubai", "UAE"],
  },
  product: {
    title: "Product â€” venture dossiers, founder & repository intelligence",
    description: "A research terminal for early-stage onchain ventures: discovery directory, venture dossiers, founder build passports, repository intelligence and a grounded AI analyst.",
    keywords: ["venture dossier", "founder intelligence", "repository intelligence", "Solana research platform"],
  },
  methodology: {
    title: "Methodology â€” how data is collected, verified and aged",
    description: "How FoundrySignal collects providers' data, classifies evidence deterministically, enforces freshness policies and produces change intelligence. Provenance is the product.",
    keywords: ["evidence verification", "data provenance", "research methodology", "claim integrity"],
  },
  "evidence-explainer": {
    title: "How evidence works â€” claims, sources and provenance",
    description: "Claims, immutable source snapshots with SHA-256 hashes, computed verification statuses, disputes and corrections, and AI grounding on the FoundrySignal evidence graph.",
  },
  ecosystem: {
    title: "Ecosystem â€” Solana-native, provider-agnostic",
    description: "Solana reads via @solana/kit, indexed providers, Jupiter market context, GitHub repository intelligence and the conflict-of-interest register.",
  },
  api: {
    title: "Research API â€” the venture intelligence graph",
    description: "Versioned REST API with a uniform envelope, cursor pagination, typed errors, API keys and plan-driven entitlements for institutional research access.",
  },
  pricing: {
    title: "Pricing â€” plans for analysts, teams and institutions",
    description: "FoundrySignal plans: Explorer, Researcher, Professional, Team and Enterprise. Plans are configuration data â€” paid tiers buy capability, never credibility.",
    keywords: ["venture research pricing", "research plans", "Solana analytics pricing"],
  },
  about: {
    title: "About â€” why we build",
    description: "FoundrySignal exists because early-stage onchain diligence is broken: narrative outruns evidence. Based in Dubai, serving a global research audience.",
  },
  contact: {
    title: "Contact â€” research, security and enterprise",
    description: "Contact FoundrySignal for research and product questions, security disclosure, and enterprise API access. Issuer Response Center for founder corrections.",
  },
  legal: {
    title: "Legal â€” status of this deployment",
    description: "Plain-language status: a research and information service â€” not investment advice, broker-dealer, exchange, custodian or launchpad. Review gates before activation.",
  },
  privacy: {
    title: "Privacy â€” what we collect and how it is removed",
    description: "Account data, research data, public founder data and logs: what FoundrySignal collects, why, and how deletion works.",
  },
  "security-disclosure": {
    title: "Security disclosure — coordinated disclosure & posture",
    description: "How to report security issues to FoundrySignal, the controls in this deployment, known boundaries and responsible-scope expectations.",
  },
  faq: {
    title: "FAQ — common questions about FoundrySignal",
    description: "Answers to common questions: what FoundrySignal is, how evidence is verified, which chains it covers, why trading is disabled, and where to get help.",
    keywords: ["FoundrySignal FAQ", "Solana research FAQ", "evidence verification"],
  },
  "legal-terms": {
    title: "Terms of Service — the agreement for using FoundrySignal",
    description: "The terms governing access to and use of FoundrySignal: product scope, lawful use, paid subscriptions (USDC on Solana, 30-day period), acceptable use, no investment advice, liability limits and refunds.",
    keywords: ["terms of service", "terms of use", "FoundrySignal terms"],
  },
  security: {
    title: "Security — model, controls and vulnerability reporting",
    description: "How FoundrySignal is secured: dedicated infrastructure, authentication and session controls, evidence hashing, audit logs, reporting a vulnerability and what to expect.",
    keywords: ["FoundrySignal security", "vulnerability disclosure", "security.txt"],
  },
};

export function marketingMetadata(section: MarketingSection) {
  const meta = SECTION_META[section];
  return pageMetadata({ ...meta, path: MARKETING_SECTION_PATHS[section] });
}

/** Date the legal-adjacent copy below was last revised. Rendered on the pages. */
export const LEGAL_LAST_UPDATED = "2026-11-17";

/** Public contact for refunds, billing and data-deletion requests. */
export const SUPPORT_EMAIL = "support@foundrysignal.aiazimara.com";

type DocBlock = { h: string; p: string };

const DOC_BLOCKS: Record<string, DocBlock[]> = {
  product: [
    { h: "Discovery", p: "The venture directory lists registered ventures with category and ecosystem filters, full-text search, sorting and saved searches. Result origin is disclosed: ventures appear because a researcher registered them and collectors verified associations â€” never because someone paid for placement." },
    { h: "Venture dossier", p: "The flagship research surface. Nine independently loading tabs â€” Overview, Founders, Product, Development, Evidence, Onchain, Markets, History, Reports. A failed provider request degrades one tab; it never removes founder profiles or deletes evidence." },
    { h: "Founder intelligence", p: "Public founder profiles with attributed histories, project relationships and public repository contributions. Identities, aliases and accounts are separated records with explicit attribution confidence. A GitHub account, wallet or social username is never automatically equated to a person." },
    { h: "Repository intelligence", p: "GitHub organizations, contributors, commit activity, releases, languages and historical snapshots are collected through the authorized REST API with rate-limit discipline. Contributors, bots, maintainers and founders are different relationships and are displayed as such." },
    { h: "AI research analyst", p: "Ask a question; the analyst retrieves evidence, compares it, detects contradictions and returns an eleven-section report where every factual statement cites a collected evidence record. Missing evidence yields explicit 'insufficient evidence' statements â€” never invention." },
    { h: "Markets & trading surface", p: "Token structures, market snapshots with asOf timestamps, and quote previews through Jupiter's API. Execution is implemented behind a release gate that is held OFF pending product, jurisdiction, provider and security review." },
  ],
  methodology: [
    { h: "Collection", p: "Every external datum is collected server-side through a provider adapter that records the provider, collection time, observation time, content hash (SHA-256), collector version and transformation version. GitHub via the authorized REST API with rate-limit header compliance; Solana via @solana/kit read calls recording slot and data sources; websites via an SSRF-guarded fetcher; market data via Jupiter's Price API V3 with asOf timestamps." },
    { h: "Verification classification", p: "Evidence is classified only by a deterministic engine: INDEPENDENTLY_CORROBORATED (two or more independent source types agree), SOURCE_CONFIRMED (one authoritative provider observation), SELF_ASSERTED (the venture's own material), FOUNDER_PROVIDED (issuer workflow), DISPUTED (contradicting evidence exists), STALE (past its freshness policy) or UNKNOWN. No human may fabricate a verification state; corrections create new auditable records." },
    { h: "Freshness policies", p: "Starting policies: repository metadata daily or on webhook; releases near real time; product website daily; token metadata revalidated on change; market prices licensed-dependent; historical evidence immutable. Data past policy is marked STALE, never silently refreshed or deleted." },
    { h: "Change intelligence", p: "Snapshots are immutable. Diffing two observations produces change records â€” a new release, a changed token authority, a removed repository â€” which drive alerts and the venture History tab." },
    { h: "What we do not do", p: "We do not sell classifications or placement, merge providers as if equivalent, treat holders as verified users, treat onchain activity as company revenue, generate investment advice, or fabricate data when a provider fails. Unavailable providers produce honest unavailable states." },
  ],
  "evidence-explainer": [
    { h: "Claims and sources", p: "A claim is a canonical, disputable statement â€” 'Alice is the founder', 'the mint authority is revoked'. A source is an immutable provenance record pointing at the original material. Claimâ€“evidence links carry a relation: SUPPORTS, CONTRADICTS or NEUTRAL. Claim status is computed from its links." },
    { h: "Snapshots and hashing", p: "When a collector fetches a source it stores an immutable snapshot with a SHA-256 content hash. Two snapshots of the same source can be diffed to produce change intelligence. You can always inspect the original payload and open the source URL." },
    { h: "Statuses you will see", p: "CORROBORATED (independently supported) Â· CONFIRMED (authoritative provider) Â· SELF-ASSERTED (venture's own claim) Â· FOUNDER (issuer-provided) Â· DISPUTED (contradicted) Â· STALE (past freshness policy) Â· UNKNOWN (no linked evidence). These are computed, not asserted." },
    { h: "Disputes and corrections", p: "Anyone can raise a dispute or a correction. Administrators cannot silently modify original observations â€” a correction creates a new auditable record referencing the original, and disputed material is visibly labeled." },
    { h: "AI grounding", p: "The research analyst can only cite evidence that was actually retrieved for your tenant, and its citations are validated server-side before publication. If evidence cannot establish a point, the report says so explicitly. External content is treated as untrusted data, with injection filtering applied." },
  ],
  ecosystem: [
    { h: "Solana", p: "Onchain reads run through @solana/kit against a dedicated RPC endpoint, with the public mainnet RPC as default. Mint identification, token metadata, authorities, token accounts and bounded transaction history are read-only in this release. Wallet connectivity follows the Wallet Standard; signing always happens in the user's own wallet." },
    { h: "Indexed providers", p: "Helius (or an equivalent indexed provider) extends throughput and enhanced APIs. Where credentials are absent, the integration is reported as MISCONFIGURED â€” the adapter contract exists and the UI shows an honest unavailable state instead of synthetic data." },
    { h: "Market infrastructure", p: "Market snapshots and quote previews use Jupiter's current APIs. The managed order-and-execute flow (/order â†’ wallet signing â†’ /execute) is implemented behind the trading release gate, disabled by default." },
    { h: "Repository intelligence", p: "GitHub REST API v3 with webhook reconciliation and strict rate-limit discipline. Webhooks are signature-verified; reconciliation covers missed events." },
    { h: "Conflict-of-interest register", p: "This deployment carries no paid listings, issuer relationships or promotional arrangements. Any future commercial relationship with a covered venture will be disclosed here, and research conclusions will remain separated from commercial data by construction." },
  ],
  api: [
    { h: "Contract", p: "Versioned REST under /api/v1 with a uniform envelope: every response carries success, data, typed error codes (code, message, retryable, requestId, details) and metadata (requestId, timestamp, version, nextCursor). Cursor pagination for large datasets; idempotency keys on write operations where retries could duplicate." },
    { h: "Modules", p: "Authentication Â· Ventures Â· Founders Â· Repositories Â· Evidence Â· Research Â· Markets Â· Watchlists Â· Alerts Â· Reports Â· Workspace Â· Billing Â· Administration. Each module owns its business rules and validation; the frontend never constructs provider requests directly." },
    { h: "Access & metering", p: "API keys are hashed at rest with scoped access and per-endpoint metering. Entitlements are plan-driven configuration â€” prices and limits are data, never hardcoded." },
    { h: "Availability", p: "The API is operational in this deployment for authenticated access. Commercial API distribution is gated behind billing configuration and legal review." },
  ],
  about: [
    { h: "Why we build", p: "Capital formation onchain moves faster than verification. Founders are judged by follower counts; projects are priced before their repositories show a second contributor. A research layer that shows what was actually built, by whom, with which evidence, is prerequisite infrastructure for honest markets." },
    { h: "Principles", p: "Evidence over narrative. Provenance over aggregation. Attribution confidence over false certainty. Research credibility over token speculation. Explicit unknowns over confident invention." },
    { h: "Where we operate", p: "FoundrySignal operates from Dubai, United Arab Emirates, and serves a global research audience. Geo-targeting signals across this site declare the UAE as the primary market region." },
    { h: "Working name", p: "FoundrySignal is a working name pending professional name and trademark clearance." },
    { h: "Status", p: "This deployment is a real, operating research platform with live provider integrations. Trading execution is deliberately gated. Commercial features require legal review gates before activation. We do not present the platform as legally compliant or investment-ready without appropriate professional assessment." },
  ],
  legal: [
    { h: "What this platform is", p: "A research and information service. It aggregates public data (websites, public repositories, public onchain records, licensed market data) into research dossiers with provenance." },
    { h: "What it is not", p: "It is not investment advice, not a broker-dealer or exchange, not a custodian, and not a token launchpad. Nothing here is a recommendation to buy or sell any asset. Trading execution is disabled pending legal and security review gates." },
    { h: "Review gates", p: "Paid research services, investment-related features, issuer services, custody, trading and geographic availability each require an independent professional legal review before activation. No claim of legal compliance is made anywhere in this product." },
    { h: "Data rights", p: "Public data is processed for research purposes with source attribution. Founder-facing privacy, correction, dispute, retention and deletion processes are documented and operational." },
    { h: "Related documents", p: "The binding agreement for paid access, including the onchain USDC payment flow, no auto-renewal and refunds, is the Terms of Service at /terms. What we collect and how it is removed is on /privacy. The controls in place and how to report a vulnerability are on /security and /security-disclosure." },
  ],
  privacy: [
    { h: "Account data", p: `Email (hashed for lookup), display name, bcrypt password hash, session records and audit events of your own actions. Sessions are opaque tokens stored hashed; the session cookie is HttpOnly and SameSite=Lax. One preference cookie (fs-theme) remembers your light/dark choice; it is not used for profiling.` },
    { h: "Research data", p: "Ventures you register, watchlists, saved searches, notes, research runs and reports belong to your workspace and are never retrieved for another tenant. Deletion of your account soft-deletes the account and revokes sessions; workspace objects follow the documented retention policy." },
    { h: "Public founder data", p: "Founder profiles contain only publicly attributable information with source links. We do not expose private contact data, and we never equate an account to a person without evidence-backed attribution." },
    { h: "Logs", p: "Structured logs exclude access tokens, private keys, wallet secrets and sensitive personal notes. Provider rate-limit and health telemetry contains no user content." },
    { h: "Payment data", p: "Payment is onchain in USDC on Solana. What we store is the checkout intent — plan, exact amount, the operator's destination wallet, the memo that binds the transfer to that one intent — and, once confirmed, the transaction signature and the resulting subscription period. We do not store a separate payer-wallet field and never ask for card details. Solana transactions are public, so a payment signature can be linked to the paying address by anyone who looks it up, including us." },
    { h: "No third-party analytics or tracking", p: "This deployment loads no analytics, advertising or social tracking scripts and sets no tracking cookies. The only cookies are the session cookie described above and the fs-theme preference cookie; CSRF protection uses SameSite cookies plus origin verification and server-side session tokens, not an additional tracking cookie." },
    { h: "Retention and deletion", p: `Account and workspace records are retained while the workspace exists. Deleting your account soft-deletes it immediately and revokes all sessions; that action does not by itself erase your workspace research objects, and immutable evidence snapshots and audit records are kept as the audit trail behind published findings. Anything not already removed is handled under the documented retention policy. To have specific personal data erased — including after deleting your account — write to ${SUPPORT_EMAIL}.` },
    { h: "Your requests and this page's siblings", p: `To access, correct or delete your data, or to ask a question about this policy, write to ${SUPPORT_EMAIL}. Related documents: the Terms of Service (/terms) govern the service, the Security page (/security) describes the controls in place, and the Security disclosure page (/security-disclosure) is where to report a vulnerability.` },
  ],
  "security-disclosure": [
    { h: "How to report", p: "Email security@foundrysignal.aiazimara.com with reproduction steps and what an attacker could achieve. Include the affected URL or API route and, where possible, a minimal proof of concept. Do not include other users' personal data in your report." },
    { h: "Response commitments", p: "These are good-faith commitments in this deployment, not a contractual service level. We acknowledge a report within two business days and provide a triage judgement, with a severity assessment, within five business days. After triage we keep you informed at each remediation milestone and, with your permission, credit you publicly. Ask before publishing anything so we can agree a disclosure date; we will not pursue action against good-faith research that respects user data, and we treat these commitments as binding on us in that respect." },
    { h: "Controls in this deployment", p: "bcrypt password hashing · opaque hashed sessions with server-side revocation · RBAC with workspace tenancy enforced at the service layer · zod validation at every API boundary · SSRF-guarded fetching with private-range and metadata-endpoint denial · CSP, nosniff and referrer policies · CSRF defense via SameSite + origin verification · append-only audit log · webhook signature verification (HMAC, timing-safe) for billing providers." },
    { h: "Known boundaries", p: "Authentication capabilities (email delivery via Resend, OAuth provider credentials, and an MFA encryption key) are environment-configured for this deployment where indicated by the capability registry; interactive enablement may still require provider-side callback/domain registration and user enrollment. Secrets live in environment configuration; no signing material exists anywhere in the application because execution is gated." },
    { h: "Scope", p: "In scope: the platform web application and the /api/v1 surface — authentication and session handling, workspace tenancy isolation, the SSRF-guarded fetcher, billing webhooks and our own infrastructure configuration. Out of scope: third-party providers' infrastructure beyond their published policies, social engineering of staff or users, physical attacks, volumetric denial of service, and reports without a reproducible proof of concept." },
    { h: "What is not claimed", p: "No SOC 2, ISO 27001 or other certification is held, and none is claimed. Security here is a published set of controls and a best-effort posture, not a guarantee or an audit opinion. The machine-readable policy is at /.well-known/security.txt, and the fuller controls description is on /security." },
  ],
  "legal-terms": [
    { h: "Scope of these terms", p: "These Terms of Service govern access to and use of FoundrySignal at foundrysignal.aiazimara.com. By creating an account or using the service you agree to these terms. FoundrySignal is a research and information service for early-stage Solana ventures: it aggregates public data into evidence-graded dossiers. It is not investment, legal, accounting or tax advice, not a broker-dealer, exchange, custodian or launchpad, and nothing on the platform is a recommendation to buy or sell any asset. Trading execution is deliberately disabled." },
    { h: "Accounts and lawful use", p: "You must be able to form a binding contract and provide accurate registration information. Keep your credentials confidential — you are responsible for all activity under your account. Use the service only for your own internal research, in compliance with applicable law, including the sanctions and export-control laws that apply to you. You may not create false identities, impersonate other persons or entities, or misrepresent FoundrySignal output as audited fact or investment advice." },
    { h: "Price and plan data", p: "The published self-serve plans are Explorer (free), Researcher ($39 per 30-day period), Professional ($99 per 30-day period) and Team ($299 per 30-day period), with Enterprise quoted by written agreement. Amounts are charged in USDC, whose base units are treated 1:1 with US dollars by this platform; they are configuration data read from the plan catalog, so the checkout screen is authoritative at the moment you pay." },
    { h: "How payment works", p: "Checkout is onchain and self-custodied. At checkout the platform creates a payment intent and shows you three things: the destination wallet, the exact USDC amount for your plan, and a memo that binds the transfer to that one intent. You send that exact amount of USDC on Solana from a wallet you control, including the memo. Nothing is granted until our server reads the chain, finds a transfer to the destination whose memo matches and whose amount is at least the plan price, and confirms the token movement. Entitlement is then recorded once, idempotently, and runs for 30 days from confirmation. Payment intents expire after 30 minutes; if you send after that, verification reports the intent as expired and no entitlement is granted. Fees charged by your wallet, the Solana network or any intermediary are yours." },
    { h: "No automatic renewal", p: "Nothing on this platform auto-bills, auto-debits or re-charges you. There is no stored payment method to charge and no recurring mandate. When a 30-day period ends, the paid entitlement simply expires and your workspace returns to the free Explorer plan; the platform will never take a further payment without you starting a new checkout and sending a new transfer yourself. As a courtesy the platform may email workspace owners a renewal reminder in the final week of a paid period — the reminder is informational only and starts no payment." },
    { h: "Cancelling future periods", p: "Because no payment auto-renews, cancelling a future period requires no action and no notice: there is nothing to stop. If you do not create a new checkout intent, no further amount is due or taken. You may also stop using the paid plan at any time and your access continues until the period you already paid for ends." },
    { h: "Price changes", p: "Prices and plan entitlements may change. A change never affects a period you have already paid for; it applies only to a checkout you start after the new price is published. The plan catalog is configuration data, and the price shown at checkout governs that payment." },
    { h: "Taxes", p: "Prices are stated in US dollars and paid in USDC. You are responsible for any taxes, duties, levies or withholdings that apply to your purchase or use of the service in your jurisdiction. The operator does not collect, withhold or remit tax on your behalf, and no tax invoice is issued by the platform today; ask at support@foundrysignal.aiazimara.com if you need a transaction record for accounting." },
    { h: "Refunds", p: "No self-service refund process exists. What actually happens today: paid fees are non-refundable by default, and a refund is granted only by the operator's discretion. To ask, email support@foundrysignal.aiazimara.com with your account email and the Solana transaction signature within 14 days of the payment. If the operator approves, the same USDC amount is sent back onchain to the wallet address that made the payment, and the corresponding entitlement may be ended. Because the transfer is irreversible once sent, a refund cannot be reversed again." },
    { h: "Terminating your account", p: "You can terminate at any time from Settings → Danger zone → Delete account. That soft-deletes your account, revokes all sessions immediately and starts workspace data cleanup under the retention policy described on /privacy. For data-deletion requests, or if you cannot reach the setting, email support@foundrysignal.aiazimara.com. Deleting your account does not refund a period already paid." },
    { h: "Availability", p: "The self-serve plans carry no uptime, latency or support-response SLA. The service is provided on a best-effort basis; collection depends on third-party providers that may be slow, rate-limited or unavailable, and maintenance, provider failures or security events may interrupt access. Any uptime commitment would have to be agreed in writing for an Enterprise order and is not offered by these terms." },
    { h: "Classifications are never for sale", p: "Paid plans buy research capability — dossier access, research runs, export and API metering. They never buy evidence verification states, rankings, editorial coverage or placement. Verification status is computed by a deterministic engine from collected evidence, and no plan, payment or commercial relationship can change it." },
    { h: "Acceptable use", p: "The following are prohibited: bypassing access controls, rate limits or entitlements; sharing, selling or reselling accounts or API keys; scraping the service in violation of these terms; interfering with the platform or other tenants' workspaces; reverse engineering beyond what applicable law permits; injecting content designed to manipulate the AI analyst into fabricating output; using the service to violate securities, sanctions or anti-fraud laws; and presenting FoundrySignal output as certified verification or a price target." },
    { h: "No investment advice", p: "Evidence classifications are computed research signals, not ratings, recommendations or price targets. Nothing on FoundrySignal is a solicitation to buy or sell any security or digital asset. You are solely responsible for your own investment decisions, and you should consult licensed professionals before acting on any information published here." },
    { h: "Intellectual property", p: "The platform, software, design, brand, evidence-classification methodology and aggregated dossier content are owned by the operator and protected by applicable law. You retain rights in your own workspace inputs, such as watchlists, saved searches and notes. We grant you a limited, non-exclusive, non-transferable license to access and view outputs for your internal research; you may not redistribute dossiers at scale or use the service to build a competing dataset." },
    { h: "Disclaimer of warranties", p: "The service is provided \"as is\" and \"as available\". Public data may be incomplete, stale or wrong; providers may fail; computed verification statuses may change as evidence changes. To the fullest extent permitted by law, no express or implied warranty is made, including merchantability, fitness for a particular purpose or non-infringement." },
    { h: "Limitation of liability", p: "To the maximum extent permitted by law, the operator's aggregate liability for all claims arising out of or relating to these terms is capped at the fees you paid in the twelve months preceding the event giving rise to the claim. Neither party is liable for indirect, incidental, special, consequential or lost-profit damages. Nothing limits liability that cannot be limited by law, including fraud, gross negligence or willful misconduct." },
    { h: "Termination by the operator", p: "The operator may suspend or terminate access for breach of these terms, non-payment, or conduct that risks the platform or other users, with notice where practicable. Upon termination your access ends and your data is handled per /privacy, including soft deletion and the documented retention policy." },
    { h: "Governing law", p: "These terms are governed by the laws of the United Arab Emirates as applied in the Emirate of Dubai, without regard to conflict-of-law principles. Disputes are subject to the exclusive jurisdiction of the courts of Dubai, except where mandatory local consumer-protection law provides otherwise." },
    { h: "Contact and related documents", p: `Questions about these terms, refunds or data deletion: ${SUPPORT_EMAIL}. Security issues: security@foundrysignal.aiazimara.com (see /security and /security-disclosure). What we collect and how it is removed is on /privacy. Material changes to these terms will be posted on this page with a revised "Last updated" date before they take effect.` },
  ],
  security: [
    { h: "Security model", p: "FoundrySignal runs on dedicated infrastructure with environment-configured secrets — no signing material exists in the application because execution is gated. Controls: bcrypt password hashing; opaque, hashed session tokens with server-side revocation; RBAC with workspace tenancy enforced at the service layer; zod validation at every API boundary; SSRF-guarded fetching with private-range and metadata-endpoint denial; CSP, nosniff and referrer policies; CSRF defense via SameSite cookies and origin verification; an append-only audit log; and HMAC, timing-safe webhook signature verification for billing providers." },
    { h: "Payments and custody", p: "The platform holds no customer funds and never custodies assets. Subscriptions are paid in USDC on Solana to the operator's payout wallet, and entitlement is granted only after the server verifies the onchain transfer — destination, memo and amount — against the payment intent. There is no auto-renewal and no stored payment credential, so there is no recurring charge to protect." },
    { h: "What we do not hold", p: "The operator holds no SOC 2, ISO 27001 or equivalent certification, and this page does not claim one. Security here is a published set of controls plus best-effort operational practice; it is not an audit opinion and not a warranty that the service is free of vulnerabilities. We report the controls we actually run and describe their known boundaries below." },
    { h: "Evidence integrity", p: "Every collected source snapshot is stored immutably with a SHA-256 content hash, and every observation carries its provider, collection time and observation time. Administrative and analyst actions are written to an append-only audit log. Webhooks are verified before processing. This is what makes the evidence graph auditable after the fact rather than merely asserted." },
    { h: "Reporting a vulnerability", p: "Email security@foundrysignal.aiazimara.com with reproduction steps and the potential impact. No PGP key is published at this time (PGP: n/a) — use the mailbox for initial contact and we will arrange an encrypted channel if one is needed. A machine-readable security.txt is available at /.well-known/security.txt." },
    { h: "Response commitments", p: "These are commitments about how we behave, not a service-level agreement: we acknowledge a vulnerability report within two business days and provide triage with a severity assessment within five business days. Valid findings are remediated according to severity, and we keep reporters informed at each milestone. With your permission we credit reporters; we ask for coordinated disclosure and reasonable time to remediate before any public announcement. Good-faith research that respects user data and third-party systems will not be met with legal action." },
    { h: "Scope", p: "In scope: the platform app and its API — the web application, the /api/v1 surface, authentication and session handling, workspace tenancy isolation, the SSRF-guarded fetcher, billing webhooks, and our own infrastructure configuration. Out of scope: third-party providers and their infrastructure beyond their published policies, social engineering of staff or users, physical attacks, volumetric denial of service, and reports without a reproducible proof of concept. The full disclosure policy is on /security-disclosure." },
    { h: "Where to read more", p: "What we collect and how it is removed: /privacy. The agreement governing paid access, including no auto-renewal and refunds: /terms. Coordinated disclosure and known boundaries: /security-disclosure." },
  ],
};

/** Sibling legal documents, rendered as real links under each legal page body. */
const LEGAL_SIBLINGS: Record<string, Array<{ label: string; href: string }>> = {
  "legal-terms": [{ label: "Privacy", href: "/privacy" }, { label: "Security", href: "/security" }, { label: "Security disclosure", href: "/security-disclosure" }],
  privacy: [{ label: "Terms of Service", href: "/terms" }, { label: "Security", href: "/security" }, { label: "Security disclosure", href: "/security-disclosure" }],
  security: [{ label: "Security disclosure", href: "/security-disclosure" }, { label: "Terms of Service", href: "/terms" }, { label: "Privacy", href: "/privacy" }],
  "security-disclosure": [{ label: "Security", href: "/security" }, { label: "Terms of Service", href: "/terms" }, { label: "Privacy", href: "/privacy" }],
  legal: [{ label: "Terms of Service", href: "/terms" }, { label: "Privacy", href: "/privacy" }, { label: "Security", href: "/security" }, { label: "Security disclosure", href: "/security-disclosure" }],
};

function LegalSiblings({ section }: { section: string }) {
  const items = LEGAL_SIBLINGS[section];
  if (!items) return null;
  return (
    <nav aria-label="Related legal documents" className="mx-auto max-w-3xl px-4 pb-14 sm:px-6">
      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="text-[var(--fs-accent-fg)] hover:underline">
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const CONTACT_CHANNELS: Array<[string, string]> = [
  ["Research & product", "product@foundrysignal.aiazimara.com"],
  ["Security disclosure", "security@foundrysignal.aiazimara.com"],
  ["Enterprise & API", "enterprise@foundrysignal.aiazimara.com"],
];

// â”€â”€â”€ Pricing (server-rendered from the real catalog) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const PLAN_COPY: Record<string, { note: string; features: string[] }> = {
  EXPLORER: { note: "Get oriented in the ecosystem.", features: ["Discovery directory", "Public dossiers", "Saved ventures (limited)", "Community evidence view"] },
  RESEARCHER: { note: "For independent analysts.", features: ["Full dossier access", "AI research runs (metered)", "Watchlists & alerts", "Report export"] },
  PROFESSIONAL: { note: "For active diligence.", features: ["Everything in Researcher", "Comparative research", "Saved searches", "Priority collection queue"] },
  TEAM: { note: "For research groups.", features: ["Research rooms (shared workspaces)", "Analyst roles & permissions", "API access (metered)", "Audit exports"] },
  ENTERPRISE: { note: "For institutions.", features: ["Research API at scale", "SSO / SCIM roadmap", "Custom collection scopes", "Dedicated support"] },
};

function formatPlanPrice(p: { monthlyPriceMicros: number; enterprise: boolean }): string {
  if (p.enterprise) return "Custom";
  if (p.monthlyPriceMicros === 0) return "$0";
  return `$${Math.round(p.monthlyPriceMicros / 1_000_000)}/mo`;
}

/** Micros (USD) → plain dollar string for schema.org offers, e.g. 39000000 → "39". */
function microsToUsd(micros: number): string {
  return String(parseFloat((micros / 1_000_000).toFixed(2)));
}

async function PricingSSR() {
  let plans: Awaited<ReturnType<typeof listActivePlans>> | null = null;
  let unavailable: string | null = null;
  try {
    plans = await listActivePlans();
  } catch (err) {
    unavailable = err instanceof Error ? err.message : "catalog unavailable";
  }

  const featuredIndex = plans?.findIndex((p) => p.code === "PROFESSIONAL") ?? -1;

  // Offer/AggregateOffer structured data derived from the live plan catalog.
  // Enterprise (custom pricing) is excluded; Explorer ships as price 0.
  const offerable = (plans ?? []).filter((p) => !p.enterprise && p.monthlyPriceMicros >= 0);
  const pricingLd =
    offerable.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "AggregateOffer",
          name: "FoundrySignal plans",
          description: "FoundrySignal subscription plans. Paid tiers buy capability, never credibility.",
          priceCurrency: "USD",
          lowPrice: microsToUsd(Math.min(...offerable.map((p) => p.monthlyPriceMicros))),
          highPrice: microsToUsd(Math.max(...offerable.map((p) => p.monthlyPriceMicros))),
          offerCount: offerable.length,
          url: siteUrl("/pricing"),
          offers: offerable.map((p) => ({
            "@type": "Offer",
            name: p.name,
            price: microsToUsd(p.monthlyPriceMicros),
            priceCurrency: p.currency || "USD",
            url: siteUrl("/pricing"),
          })),
        }
      : null;

  return (
    <>
      {pricingLd ? <JsonLd data={pricingLd} /> : null}
    <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <h1 className="fs-brand text-2xl font-bold text-ink">Pricing</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
        Plans are configuration data, not hardcoded entitlements. Trust classifications are never for
        sale â€” paid tiers buy capability, not credibility.
      </p>

      {unavailable ? (
        <p role="alert" className="mt-3 text-xs leading-relaxed text-[var(--fs-warning-fg)]">
          Plan catalog temporarily unavailable ({unavailable}). Reload this page to retry â€” prices
          are never shown from a stale cache.
        </p>
      ) : null}

      {plans && plans.length === 0 ? (
        <EmptyState
          className="mt-8"
          glyph="product"
          title="No plans are published"
          description="The plan catalog is empty. Pricing is configuration data, so nothing is inferred or defaulted here."
        />
      ) : null}

      <ul className="mt-8 grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        {(plans ?? []).map((plan, index) => {
          const copy = PLAN_COPY[plan.code] ?? { note: "", features: [] };
          const featured = index === featuredIndex;
          return (
            <li key={plan.code}>
              <Card
                variant={featured ? "accent" : "default"}
                className="flex h-full flex-col p-5"
                aria-current={featured ? "true" : undefined}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="fs-label">{plan.name}</span>
                  {featured ? (
                    <Badge tone="accent" size="sm">
                      most chosen
                    </Badge>
                  ) : null}
                </div>
                <div className="fs-data mt-2 text-xl font-semibold text-ink">
                  {formatPlanPrice(plan)}
                </div>
                <p className="mt-1 text-2xs leading-snug text-ink-muted">{copy.note}</p>
                <ul className="mt-4 flex flex-1 flex-col gap-2">
                  {copy.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-xs text-ink-secondary">
                      <span
                        aria-hidden="true"
                        className="mt-1.5 size-1 shrink-0 rounded-full bg-[var(--fs-accent)]"
                      />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button
                  asChild
                  variant={featured ? "primary" : "outline"}
                  size="sm"
                  className="mt-4 w-full"
                >
                  <Link href={plan.enterprise ? "/contact" : `/settings?checkout=${plan.code}`}>
                    {plan.enterprise ? "Contact us" : `Start with ${plan.name}`}
                  </Link>
                </Button>
              </Card>
            </li>
          );
        })}
      </ul>

      <p className="mt-6 text-2xs leading-relaxed text-ink-faint">
        Checkout availability depends on billing-provider configuration; it surfaces a
        configuration-required state rather than simulating payments. Paid research services, issuer
        services and trading features additionally require independent legal review gates before
        activation.
      </p>
    </section>
    </>
  );
}

function ContactSection() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
      <h1 className="fs-brand text-2xl font-bold text-ink">Contact</h1>

      <ul className="mt-6 grid gap-4 sm:grid-cols-3">
        {CONTACT_CHANNELS.map(([title, address]) => (
          <li key={title}>
            <Card className="h-full p-5">
              <div className="fs-label">{title}</div>
              <a
                href={`mailto:${address}`}
                className="fs-data mt-2 block break-all text-xs text-[var(--fs-accent-fg)] hover:underline"
              >
                {address}
              </a>
            </Card>
          </li>
        ))}
      </ul>

      <Card className="mt-4 p-5">
        <h2 className="fs-label">Issuer Response Center</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
          Founders can submit corrections, link official accounts, provide additional evidence and
          respond to disputed claims â€” without purchasing favorable classifications. Founder-provided
          material is always labeled FOUNDER_PROVIDED and never upgrades trust classification by
          itself.
        </p>
      </Card>
    </section>
  );
}

// â”€â”€â”€ Page composition â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function MarketingPage({ section }: { section: MarketingSection }) {
  const path = MARKETING_SECTION_PATHS[section];
  const meta = SECTION_META[section];

  const breadcrumb = (name: string) =>
    breadcrumbLd([{ name: "FoundrySignal", path: "/" }, { name, path }]);

  return (
    <div className="flex min-h-dvh flex-col">
      <JsonLd
        data={[
          organizationLd(),
          websiteLd(),
          ...(section === "home" ? [] : [breadcrumb(meta.title.split("â€”")[0].trim())]),
        ]}
      />
      <MarketingNav />
      <main id="fs-main" className="flex-1">
        {section === "home" && (
          <>
            <Hero />
            <ProofStrip />
            <HomeDifferentiator />
            <HomeCTA />
          </>
        )}

        {section === "product" && (
          <>
            <JsonLd data={softwareApplicationLd()} />
            <DocSection title="Product" lede="A research terminal for early-stage onchain ventures â€” built around the venture dossier and the evidence graph." blocks={DOC_BLOCKS.product} />
          </>
        )}

        {section === "methodology" && (
          <>
            <JsonLd
              data={webPageLd({ path, name: meta.title, description: meta.description, speakableCss: ["h1", ".fs-panel h2"] })}
            />
            <DocSection title="Methodology" lede="How data enters FoundrySignal, how it is validated, and how it ages. Provenance is not a feature — it is the product." blocks={DOC_BLOCKS.methodology} />
            <section className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
              <Link href="/faq" className="text-sm text-[var(--fs-accent-fg)] hover:underline">
                Common questions →
              </Link>
            </section>
          </>
        )}

        {section === "evidence-explainer" && (
          <DocSection title="How evidence works" lede="Every research surface in FoundrySignal is a view over the same evidence graph." blocks={DOC_BLOCKS["evidence-explainer"]} />
        )}

        {section === "ecosystem" && (
          <DocSection title="Ecosystem" lede="Solana-first, provider-agnostic by construction." blocks={DOC_BLOCKS.ecosystem} />
        )}

        {section === "api" && (
          <DocSection title="Research API" lede="The venture intelligence graph, available to institutional customers and authorized applications." blocks={DOC_BLOCKS.api} />
        )}

        {section === "pricing" && <PricingSSR />}

        {section === "about" && (
          <DocSection title="About" lede="FoundrySignal exists because early-stage onchain diligence is broken: narrative outruns evidence." blocks={DOC_BLOCKS.about} />
        )}

        {section === "contact" && (
          <>
            <JsonLd data={contactPageLd()} />
            <ContactSection />
          </>
        )}

        {section === "legal" && (
          <>
            <DocSection title="Legal" lede="Plain-language status of this deployment. This is not legal advice and not a substitute for professional assessment." blocks={DOC_BLOCKS.legal} updated={LEGAL_LAST_UPDATED} />
            <LegalSiblings section={section} />
          </>
        )}

        {section === "privacy" && (
          <>
            <DocSection title="Privacy" lede="What we collect, why, and how it is removed." blocks={DOC_BLOCKS.privacy} updated={LEGAL_LAST_UPDATED} />
            <LegalSiblings section={section} />
          </>
        )}

        {section === "security-disclosure" && (
          <>
            <DocSection title="Security disclosure" lede="Coordinated disclosure policy and current security posture." blocks={DOC_BLOCKS["security-disclosure"]} updated={LEGAL_LAST_UPDATED} />
            <LegalSiblings section={section} />
          </>
        )}

        {section === "faq" && (
          <>
            <JsonLd
              data={[
                webPageLd({ path, name: meta.title, description: meta.description, speakableCss: ["h1"] }),
                faqPageLd(FAQS),
              ]}
            />
            <section className="mx-auto max-w-3xl px-4 pt-14 sm:px-6">
              <h1 className="fs-brand text-2xl font-bold text-ink">Frequently asked questions</h1>
              <p className="mt-2 text-md leading-relaxed text-ink-secondary">
                Straight answers about what FoundrySignal is, how evidence is verified, and what the
                platform deliberately does not do.
              </p>
            </section>
            <FaqSection />
          </>
        )}

        {section === "legal-terms" && (
          <>
            <JsonLd
              data={webPageLd({ path, name: meta.title, description: meta.description, speakableCss: ["h1", ".fs-panel h2"] })}
            />
            <DocSection title="Terms of Service" lede="The agreement that governs access to and use of FoundrySignal. This is not legal advice and not a substitute for professional counsel." blocks={DOC_BLOCKS["legal-terms"]} updated={LEGAL_LAST_UPDATED} />
            <LegalSiblings section={section} />
          </>
        )}

        {section === "security" && (
          <>
            <JsonLd
              data={webPageLd({ path, name: meta.title, description: meta.description, speakableCss: ["h1", ".fs-panel h2"] })}
            />
            <DocSection title="Security" lede="How the platform is secured, and how to reach us when something is not right." blocks={DOC_BLOCKS.security} updated={LEGAL_LAST_UPDATED} />
            <section className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
              <Button asChild variant="outline" size="sm">
                <a href="mailto:security@foundrysignal.aiazimara.com">
                  Email security@foundrysignal.aiazimara.com
                </a>
              </Button>
            </section>
            <LegalSiblings section={section} />
          </>
        )}
      </main>
      <MarketingFooter />
    </div>
  );
}

