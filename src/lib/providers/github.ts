// GitHub adapter — real REST v3 integration.
// Requires GITHUB_TOKEN for meaningful throughput; without it the adapter
// honestly reports RATE_LIMITED (unauthenticated quota: 60 req/h per IP —
// measured exhausted on this sandbox egress IP on 2026-11-15).

import { createBaseProvider, ProviderError, ProviderHealthState, RateLimitState } from "./framework";

const API_ROOT = "https://api.github.com";

export interface GithubConfig {
  token?: string;
}

function parseRateLimit(headers: Headers): RateLimitState | undefined {
  const limit = headers.get("x-ratelimit-limit");
  const remaining = headers.get("x-ratelimit-remaining");
  const reset = headers.get("x-ratelimit-reset");
  if (limit === null && remaining === null) return undefined;
  return {
    limit: limit !== null ? parseInt(limit, 10) : null,
    remaining: remaining !== null ? parseInt(remaining, 10) : null,
    resetAt: reset !== null ? new Date(parseInt(reset, 10) * 1000) : null,
    source: "HEADER",
  };
}

export class GithubAdapter {
  private provider = createBaseProvider({
    name: "github",
    timeoutMs: 15_000,
    parseRateLimit,
  });
  private token: string | undefined;
  private configured: boolean;

  constructor(config?: GithubConfig) {
    this.token = config?.token ?? process.env.GITHUB_TOKEN;
    this.configured = !!this.token;
  }

  get isConfigured(): boolean {
    return this.configured;
  }

  async getHealth(): Promise<ProviderHealthState> {
    if (!this.configured) return "MISCONFIGURED";
    const rl = await this.getRateLimitState();
    if (rl.remaining !== null && rl.remaining === 0) return "RATE_LIMITED";
    return this.provider.getHealth();
  }

  async getRateLimitState(): Promise<RateLimitState> {
    return this.provider.getRateLimitState();
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "FoundrySignal-Collector/1.0",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  private async getJson<T>(path: string, parse: (raw: unknown) => T): Promise<{ data: T; collectedAt: Date; rateLimit?: RateLimitState }> {
    const result = await this.provider.fetch(
      { url: `${API_ROOT}${path}`, init: { headers: this.headers() } },
      parse
    );
    return { data: result.data, collectedAt: result.collectedAt, rateLimit: result.rateLimit };
  }

  // ── Parses (schema-validated before persistence upstream) ────────────

  static parseRepository(raw: unknown) {
    const r = raw as Record<string, unknown>;
    return {
      providerId: String(r.node_id ?? r.id),
      owner: String((r.owner as Record<string, unknown>)?.login ?? ""),
      name: String(r.name),
      url: String(r.html_url),
      description: (r.description as string | null) ?? null,
      stars: Number(r.stargazers_count ?? 0),
      forks: Number(r.forks_count ?? 0),
      openIssues: Number(r.open_issues_count ?? 0),
      archived: Boolean(r.archived ?? false),
      isPrivate: Boolean(r.private ?? false),
      pushedAt: r.pushed_at ? new Date(String(r.pushed_at)) : null,
      createdAt: r.created_at ? new Date(String(r.created_at)) : null,
      defaultBranch: (r.default_branch as string | null) ?? null,
      primaryLanguage: (r.language as string | null) ?? null,
    };
  }

  static parseRelease(raw: unknown) {
    const r = raw as Record<string, unknown>;
    return {
      providerId: String(r.node_id ?? r.id),
      tagName: String(r.tag_name ?? ""),
      name: (r.name as string | null) ?? null,
      publishedAt: r.published_at ? new Date(String(r.published_at)) : null,
      prerelease: Boolean(r.prerelease ?? false),
      url: (r.html_url as string | null) ?? null,
    };
  }

  static parseContributor(raw: unknown) {
    const c = raw as Record<string, unknown>;
    const login = String(c.login ?? "");
    const type = String(c.type ?? "User");
    const isBot = type === "Bot" || login.endsWith("[bot]");
    return {
      providerUserId: String(c.node_id ?? c.id ?? login),
      login,
      accountType: isBot ? "BOT" : "USER",
      contributions: Number(c.contributions ?? 0),
    };
  }

  static parseCommit(raw: unknown) {
    const c = raw as Record<string, unknown>;
    const commit = (c.commit ?? {}) as Record<string, unknown>;
    const author = (c.author ?? null) as Record<string, unknown> | null;
    return {
      sha: String(c.sha ?? ""),
      authorLogin: author ? String(author.login) : null,
      message: String(commit.message ?? "").slice(0, 280),
      committedAt: commit.committer && (commit.committer as Record<string, unknown>).date
        ? new Date(String((commit.committer as Record<string, unknown>).date))
        : null,
    };
  }

  // ── Endpoints ─────────────────────────────────────────────────────────

  async getRepository(owner: string, repo: string) {
    return this.getJson(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, GithubAdapter.parseRepository);
  }

  async getRepositoryById(id: string) {
    return this.getJson(`/repositories/${encodeURIComponent(id)}`, GithubAdapter.parseRepository);
  }

  async getReleases(owner: string, repo: string, maxPages = 1) {
    const out: Array<ReturnType<typeof GithubAdapter.parseRelease>> = [];
    for (let page = 1; page <= maxPages; page++) {
      const res = await this.getJson(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases?per_page=30&page=${page}`,
        (raw) => (Array.isArray(raw) ? raw.map(GithubAdapter.parseRelease) : [])
      );
      out.push(...res.data);
      if (res.data.length < 30) break;
    }
    return out;
  }

  async getContributors(owner: string, repo: string, maxPages = 2) {
    const out: Array<ReturnType<typeof GithubAdapter.parseContributor>> = [];
    for (let page = 1; page <= maxPages; page++) {
      const res = await this.getJson(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contributors?per_page=100&anon=false&page=${page}`,
        (raw) => (Array.isArray(raw) ? raw.map(GithubAdapter.parseContributor) : [])
      );
      out.push(...res.data);
      if (res.data.length < 100) break;
    }
    return out;
  }

  async getCommits(owner: string, repo: string, perPage = 30) {
    const res = await this.getJson(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?per_page=${perPage}`,
      (raw) => (Array.isArray(raw) ? raw.map(GithubAdapter.parseCommit) : [])
    );
    return res.data;
  }

  async getLanguages(owner: string, repo: string): Promise<Record<string, number>> {
    const res = await this.getJson(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/languages`, (raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("expected object");
      return raw as Record<string, number>;
    });
    return res.data;
  }

  async getRateLimitProbe(): Promise<{ core: { limit: number; remaining: number; reset: number } } | null> {
    try {
      const res = await this.getJson("/rate_limit", (raw) => {
        const r = raw as Record<string, unknown>;
        const core = (r.resources as Record<string, Record<string, number>> | undefined)?.core;
        if (!core) throw new Error("missing core rate limit");
        return { core: { limit: core.limit, remaining: core.remaining, reset: core.reset } };
      });
      return res.data;
    } catch {
      return null;
    }
  }

  /** Organization (or user) repository listing — top repos for venture association. */
  async getOrgRepos(org: string): Promise<Array<ReturnType<typeof GithubAdapter.parseRepository>>> {
    // Try /orgs/{org}/repos then fall back to /users/{org}/repos (user accounts)
    for (const path of [
      `/orgs/${encodeURIComponent(org)}/repos?per_page=30&sort=pushed`,
      `/users/${encodeURIComponent(org)}/repos?per_page=30&sort=pushed`,
    ]) {
      try {
        const res = await this.getJson(path, (raw) =>
          Array.isArray(raw) ? raw.map(GithubAdapter.parseRepository) : []
        );
        if (res.data.length > 0) return res.data;
      } catch (err) {
        if (path.includes("/users/")) throw err;
        // else try the users endpoint
      }
    }
    return [];
  }
}

export function githubErrorKind(err: unknown): string {
  if (err instanceof ProviderError) return err.kind;
  return "UNKNOWN";
}
