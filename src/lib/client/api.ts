"use client";

// Typed API client — consumes the ApiResponse envelope, surfaces error codes.
import type { ApiResponse } from "@/lib/contracts/api";

export class ApiClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryable: boolean,
    public status: number,
    public details?: Record<string, unknown>
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      credentials: "same-origin",
    });
  } catch {
    throw new ApiClientError("NETWORK", "Network unreachable. Check your connection.", true, 0);
  }
  let body: ApiResponse<T>;
  try {
    body = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new ApiClientError("INVALID_RESPONSE", "Malformed server response.", false, res.status);
  }
  if (!body.success || body.error) {
    const e = body.error;
    // Session expiry: broadcast so the app shell can reset to an honest
    // re-auth flow instead of leaving views stuck in error states.
    if (res.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("fs:unauthorized"));
    }
    throw new ApiClientError(e?.code ?? "INTERNAL", e?.message ?? "Request failed.", e?.retryable ?? false, res.status, e?.details);
  }
  return body.data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "POST", body: data !== undefined ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(data) }),
  del: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "DELETE", body: data !== undefined ? JSON.stringify(data) : undefined }),
};

export type SessionState = {
  authenticated: boolean;
  userId: string | null;
  expiresAt: string | null;
};

export type AccountState = {
  email: string;
  name: string | null;
  platformRole: string;
  userType: string;
  emailVerified: boolean;
  workspaceRole: string;
  activeWorkspaceId: string;
  workspaces: Array<{ id: string; name: string; role: string; kind: string }>;
};

export type Capabilities = {
  githubCollection: { available: boolean; level: string; requiredEnv: string[] };
  solanaOnchain: { available: boolean; level: string; requiredEnv: string[]; upgrade?: string };
  marketData: { available: boolean; level: string; requiredEnv: string[] };
  tradingExecution: { available: boolean; level: string; reason?: string; requiredEnv: string[] };
  billing: {
    available: boolean;
    level: string;
    requiredEnv: string[];
    provider?: string;
    checkoutReady?: boolean;
    webhookReady?: boolean;
    configuredPlans?: string[];
    mint?: string;
    destination?: string | null;
    plans?: Array<{ code: string; name: string; monthlyPriceMicros: number; currency: string }>;
    reason?: string;
  };
  email: { available: boolean; level: string; requiredEnv: string[] };
  aiResearch: { available: boolean; level: string; requiredEnv: string[] };
  heliusIndexed: { available: boolean; level: string; requiredEnv: string[] };
  oauth: { available: boolean; level: string; requiredEnv: string[]; providers?: string[] };
  mfa: { available: boolean; level: string; requiredEnv: string[] };
};

export type VentureSummary = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  category: string;
  ecosystem: string;
  status: string;
  website: string | null;
  repoCount: number;
  tokenCount: number;
  evidenceCount: number;
  claimCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ListResponse = {
  items: VentureSummary[];
  total: number;
  nextCursor?: string;
};

export type Dossier = {
  venture: {
    id: string; slug: string; name: string; tagline: string | null; description: string | null;
    category: string; ecosystem: string; status: string; website: string | null; createdAt: string; updatedAt: string;
  };
  identities: Array<{ id: string; identityType: string; externalId: string; url: string | null; confidence: string }>;
  founders: Array<{
    linkId: string; role: string; attribution: string;
    founder: {
      id: string; displayName: string; bio: string | null;
      identityLinks: Array<{ identityType: string; externalId: string; url: string | null; confidence: string; claimedBy: string }>;
      passportEvents: Array<{ kind: string; summary: string; sourceUrl: string | null; occurredAt: string | null }>;
    };
  }>;
  repositories: Array<{
    id: string; owner: string; name: string; url: string; association: string;
    latest: { stars: number; forks: number; openIssues: number; pushedAt: string | null; primaryLanguage: string | null; description: string | null; archived: boolean; collectedAt: string } | null;
    observationCount: number;
    contributors: Array<{ login: string; accountType: string; repoRole: string; contributions: number }>;
    releases: Array<{ tagName: string; name: string | null; publishedAt: string | null; prerelease: boolean; url: string | null }>;
    commits: Array<{ sha: string; authorLogin: string | null; message: string; committedAt: string | null }>;
  }>;
  products: Array<{ id: string; name: string; url: string | null; kind: string; status: string; lastCheckedAt: string | null }>;
  claims: Array<{
    id: string; statement: string; category: string; status: string; origin: string;
    evidence: Array<{ id: string; relation: string; provider: string; sourceType: string; url: string | null; verification: string; collectedAt: string }>;
  }>;
  tokenAssets: Array<{ id: string; mint: string; symbol: string | null; name: string | null; decimals: number | null; mintAuthority: string | null; freezeAuthority: string | null; supply: string | null; association: string }>;
  walletAssoc: Array<{ id: string; address: string; label: string; confidence: string }>;
  onchainObservations: Array<{ id: string; kind: string; payload: Record<string, unknown>; slot: string | null; dataSources: string[]; observationTime: string; providerLimitations: string | null }>;
  marketSnapshots: Array<{ id: string; priceUsd: number | null; liquidityUsd: number | null; priceChange24h: number | null; provider: string; asOf: string }>;
  history: Array<{ kind: string; summary: string; observedAt: string }>;
  disputes: Array<{ id: string; kind: string; statement: string; resolution: string; createdAt: string }>;
  evidenceCount: number;
  research: Array<{ id: string; question: string; status: string; createdAt: string; report: { id: string; title: string; validationStatus: string } | null }>;
};

export type EvidenceRecord = {
  id: string;
  provider: string;
  sourceType: string;
  url: string | null;
  title: string | null;
  verification: string;
  collectedAt: string;
  observationTime: string | null;
  contentHash: string | null;
  collectorVersion: string;
  transformationVersion: string;
  snapshotSize: number | null;
  payload: unknown;
};

export type ReportData = {
  id: string;
  title: string;
  validationStatus: string;
  validationIssues: string[];
  sections: Array<{ id: string; heading: string; body: string }>;
  citations: Record<string, { evidenceId: string; provider: string; url: string | null; collectedAt: string; verification: string }>;
  createdAt: string;
};
