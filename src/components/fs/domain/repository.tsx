"use client";

import { cn } from "@/lib/utils";
import { formatCompact, timeAgo } from "@/lib/fs/utils";
import { Badge } from "@/components/fs/ui/badge";
import { EmptyState } from "@/components/fs/ui/states";
import { Icon } from "@/components/fs/brand/glyphs";

/**
 * RepositoryPanel — GitHub repository intelligence.
 *
 * Collectors record repository metadata, contributors, releases and commits as
 * separate observations with provenance. This panel keeps them visually
 * distinct because they answer different questions:
 *
 *   metadata    is the project real and active?          (stars, forks, push)
 *   contributors who builds it, and are they founders?    (roles are distinct)
 *   releases    what shipped, when
 *   commits     what changed recently
 *
 * Contributor roles are never collapsed into "team": REPO_OWNER,
 * MAINTAINER, CONTRIBUTOR and BOT render as distinct badges. A bot is labelled
 * as a bot rather than silently counted as a person.
 */

export interface RepoMeta {
  stars: number;
  forks: number;
  openIssues: number;
  primaryLanguage?: string | null;
  archived?: boolean;
  pushedAt?: string | null;
  collectedAt?: string | null;
}

export interface RepoContributor {
  login: string;
  contributions: number;
  /** REPO_OWNER | MAINTAINER | CONTRIBUTOR | ... */
  repoRole?: string | null;
  /** HUMAN | BOT | ORGANIZATION */
  accountType?: string | null;
  avatarUrl?: string | null;
}

export interface RepoRelease {
  id?: string;
  tagName: string;
  publishedAt?: string | null;
  prerelease?: boolean;
  url?: string | null;
  name?: string | null;
}

export interface RepoCommit {
  sha: string;
  message: string;
  authorLogin?: string | null;
  committedAt?: string | null;
  url?: string | null;
}

export interface RepositoryPanelData {
  id: string;
  owner: string;
  name: string;
  url: string;
  description?: string | null;
  latest: RepoMeta | null;
  contributors: RepoContributor[];
  releases: RepoRelease[];
  commits: RepoCommit[];
  observationCount?: number;
}

/** Contributor share bars — who does the work. */
export function ContributorShare({ contributors }: { contributors: RepoContributor[] }) {
  const total = contributors.reduce((sum, c) => sum + c.contributions, 0);
  if (contributors.length === 0 || total === 0) return null;

  const COLORS = [
    "var(--fs-chart-1)",
    "var(--fs-chart-2)",
    "var(--fs-chart-3)",
    "var(--fs-chart-4)",
    "var(--fs-chart-5)",
    "var(--fs-chart-6)",
  ];

  const top = contributors.slice(0, 6);

  return (
    <div data-slot="contributor-share">
      <div
        role="img"
        aria-label={`Contribution share: ${top
          .map((c) => `${c.login} ${Math.round((c.contributions / total) * 100)}%`)
          .join(", ")}`}
        className="flex h-2 w-full overflow-hidden rounded-full bg-[var(--fs-surface-3)]"
      >
        {top.map((c, i) => (
          <span
            key={c.login}
            style={{
              width: `${(c.contributions / total) * 100}%`,
              backgroundColor: COLORS[i % COLORS.length],
            }}
          />
        ))}
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {top.map((c, i) => (
          <li key={c.login} className="fs-data flex items-center gap-1.5 text-2xs text-ink-muted">
            <span
              aria-hidden="true"
              className="inline-block size-1.5 rounded-full"
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
            />
            {c.login}
            <span className="text-ink-faint">{Math.round((c.contributions / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RoleBadge({ role, accountType }: { role?: string | null; accountType?: string | null }) {
  if (accountType === "BOT") {
    return (
      <Badge tone="warning" size="sm">
        bot
      </Badge>
    );
  }
  if (role === "REPO_OWNER") {
    return (
      <Badge tone="accent" size="sm">
        owner
      </Badge>
    );
  }
  if (role === "MAINTAINER") {
    return (
      <Badge tone="info" size="sm">
        maintainer
      </Badge>
    );
  }
  return null;
}

export function RepositoryPanel({
  repository,
  className,
  maxCommits = 8,
  maxReleases = 5,
}: {
  repository: RepositoryPanelData;
  className?: string;
  maxCommits?: number;
  maxReleases?: number;
}) {
  const { latest } = repository;

  return (
    <div className={cn("fs-panel flex flex-col gap-4 p-5", className)} data-slot="repository-panel">
      {/* Identity + metadata */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <a
            href={repository.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="fs-press fs-data inline-flex items-center gap-2 text-sm font-semibold text-ink hover:underline"
          >
            <Icon name="externalLink" size={13} className="text-[var(--fs-accent-fg)]" />
            {repository.owner}/{repository.name}
          </a>
          {repository.description ? (
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-ink-muted">
              {repository.description}
            </p>
          ) : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-2xs text-ink-muted">
            <span className="fs-data">{formatCompact(latest?.stars ?? 0)} stars</span>
            <span className="fs-data">{formatCompact(latest?.forks ?? 0)} forks</span>
            <span className="fs-data">{formatCompact(latest?.openIssues ?? 0)} open issues</span>
            {latest?.primaryLanguage ? (
              <Badge tone="neutral" size="sm">
                {latest.primaryLanguage}
              </Badge>
            ) : null}
            {latest?.archived ? (
              <Badge tone="warning" size="sm" dot>
                archived
              </Badge>
            ) : null}
            {latest?.pushedAt ? <span>pushed {timeAgo(latest.pushedAt)}</span> : null}
          </div>
        </div>
        {typeof repository.observationCount === "number" ? (
          <span className="fs-data shrink-0 text-2xs text-ink-faint">
            {repository.observationCount} observation(s)
          </span>
        ) : null}
      </header>

      {/* Contributors */}
      <section aria-label="Contributors" className="flex flex-col gap-2">
        <h4 className="fs-label flex items-center gap-1.5">
          <Icon name="plus" size={12} aria-hidden />
          Contributors — distinct from founder attribution
        </h4>
        {repository.contributors.length === 0 ? (
          <p className="text-xs text-ink-faint">No contributors observed yet.</p>
        ) : (
          <>
            <ul className="flex flex-wrap gap-1.5">
              {repository.contributors.map((c) => (
                <li
                  key={c.login}
                  className="fs-chip fs-chip-neutral gap-1.5"
                  title={`${c.repoRole ?? "contributor"} · ${c.accountType ?? "unknown"} · ${c.contributions} contributions`}
                >
                  <span>{c.login}</span>
                  <span className="fs-data text-ink-faint">{formatCompact(c.contributions)}</span>
                  <RoleBadge role={c.repoRole} accountType={c.accountType} />
                </li>
              ))}
            </ul>
            <div className="max-w-md">
              <ContributorShare contributors={repository.contributors} />
            </div>
          </>
        )}
      </section>

      {/* Releases */}
      {repository.releases.length > 0 ? (
        <section aria-label="Releases" className="flex flex-col gap-2">
          <h4 className="fs-label">Release timeline</h4>
          <ol className="flex flex-col gap-1.5 border-l border-[var(--fs-border)] pl-3">
            {repository.releases.slice(0, maxReleases).map((rel, i) => (
              <li key={rel.id ?? `${rel.tagName}-${i}`} className="relative text-xs">
                <span
                  aria-hidden="true"
                  className="absolute -left-[17px] top-1.5 size-1.5 rounded-full bg-[var(--fs-chart-3)]"
                />
                <span className="fs-data font-medium text-ink">{rel.tagName}</span>
                {rel.prerelease ? (
                  <Badge tone="warning" size="sm" className="ml-1.5">
                    pre
                  </Badge>
                ) : null}
                <span className="fs-data ml-2 text-2xs text-ink-faint">
                  {rel.publishedAt ? timeAgo(rel.publishedAt) : "unpublished"}
                </span>
                {rel.url ? (
                  <a
                    href={rel.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    aria-label={`Open release ${rel.tagName}`}
                    className="ml-2 inline-flex align-middle text-[var(--fs-accent-fg)]"
                  >
                    <Icon name="externalLink" size={11} />
                  </a>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* Commits */}
      {repository.commits.length > 0 ? (
        <section aria-label="Recent commits" className="flex flex-col gap-2">
          <h4 className="fs-label">Recent commits</h4>
          <div className="fs-scroll max-h-44 overflow-y-auto pr-1">
            <ul className="flex flex-col gap-1">
              {repository.commits.slice(0, maxCommits).map((commit) => (
                <li key={commit.sha} className="flex items-baseline gap-2 text-xs">
                  <span className="fs-data shrink-0 text-[var(--fs-accent-2)]">
                    {commit.sha.slice(0, 7)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-ink-secondary">
                    {commit.message.split("\n")[0]}
                  </span>
                  <span className="fs-data shrink-0 text-2xs text-ink-faint">
                    {commit.authorLogin ?? "unknown"} · {timeAgo(commit.committedAt ?? null)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  );
}

/**
 * RepositoryPanel skeleton. Mirrors the panel's block structure so swapping in
 * real data does not shift the layout.
 */
export function RepositoryPanelSkeleton() {
  return (
    <div className="fs-panel flex flex-col gap-4 p-5" aria-hidden="true">
      <div className="flex flex-col gap-2">
        <div className="h-3.5 w-56 max-w-full rounded-sm bg-[var(--fs-shimmer-base)]" />
        <div className="h-3 w-40 rounded-sm bg-[var(--fs-shimmer-base)]" />
      </div>
      <div className="h-2 w-full rounded-full bg-[var(--fs-surface-3)]" />
      <div className="flex gap-1.5">
        <div className="h-5 w-16 rounded-full bg-[var(--fs-surface-3)]" />
        <div className="h-5 w-20 rounded-full bg-[var(--fs-surface-3)]" />
      </div>
    </div>
  );
}

export { EmptyState };