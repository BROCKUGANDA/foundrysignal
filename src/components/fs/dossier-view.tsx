"use client";

// Venture dossier — the flagship research surface.
//
// Nine tabs, each loading its own query so a failed provider degrades one
// panel instead of the page. Every section renders a state from the shared
// matrix; nothing here invents data to fill space.

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogFooter,
  EmptyState,
  ErrorState,
  EvidenceCard,
  EvidenceGraph,
  Field,
  FounderCard,
  Icon,
  Glyph,
  Input,
  LoadingState,
  SectionShell,
  Select,
  Textarea,
  SignalTimeline,
  Sparkline,
  TabbedPanels,
  RepositoryPanel,
  TokenCard,
  ClaimBadge,
  type GraphEdge,
  type GraphNode,
  type Series,
  cn,
  formatCompact,
  formatUsd,
  shortHash,
  timeAgo,
  toast,
} from "@/components/fs";
import { api, type AccountState, type Dossier, type EvidenceRecord } from "@/lib/client/api";
import { useApp } from "@/lib/client/store";

/* ─── Copy control ──────────────────────────────────────────────────── */

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = React.useState(false);

  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      title={copied ? "Copied" : `Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        } catch {
          toast.error("Clipboard unavailable", { description: "Select the value and copy it manually." });
        }
      }}
      className="fs-press inline-flex items-center rounded p-0.5 text-ink-faint transition-colors duration-fast ease-out hover:text-ink"
    >
      <Icon name={copied ? "check" : "copy"} size={12} />
      <span className="fs-sr-only">{copied ? "Copied" : `Copy ${label}`}</span>
    </button>
  );
}

/* ─── Dossier ───────────────────────────────────────────────────────── */

type TabKey =
  | "overview"
  | "founders"
  | "product"
  | "development"
  | "evidence"
  | "onchain"
  | "markets"
  | "history"
  | "reports";

export function DossierView({ slug }: { slug: string }) {
  const navigate = useApp((s) => s.navigate);
  const qc = useQueryClient();

  const dossier = useQuery({
    queryKey: ["dossier", slug],
    queryFn: () => api.get<Dossier>(`/api/v1/ventures/${slug}`),
  });

  const watchlists = useQuery({
    queryKey: ["watchlists"],
    queryFn: () =>
      api.get<Array<{ id: string; name: string; items: Array<{ ventureId: string }> }>>(
        "/api/v1/watchlists",
      ),
  });

  const refresh = useMutation({
    mutationFn: () => api.post<{ queued: number }>(`/api/v1/ventures/${slug}/refresh`),
    onSuccess: (result) => {
      toast.success(`Re-collection queued`, { description: `${result.queued} job(s) pending` });
      // Collection is asynchronous; poll once after the worker window.
      window.setTimeout(() => qc.invalidateQueries({ queryKey: ["dossier", slug] }), 4000);
    },
    onError: (error) => toast.apiError("Could not queue collection", error),
  });

  const addToWatchlist = useMutation({
    mutationFn: (watchlistId: string) =>
      api.post(`/api/v1/watchlists/${watchlistId}/items`, { ventureId: dossier.data?.venture.id }),
    onSuccess: () => {
      toast.success("Added to watchlist");
      qc.invalidateQueries({ queryKey: ["watchlists"] });
    },
    onError: (error) => toast.apiError("Could not add to watchlist", error),
  });

  if (dossier.isLoading) {
    return (
      <div className="mx-auto max-w-6xl">
        <LoadingState kind="card" rows={4} label="Loading dossier" escalateAfter={8000} />
      </div>
    );
  }

  if (dossier.isError || !dossier.data) {
    return (
      <div className="mx-auto max-w-3xl pt-10">
        <ErrorState
          title="Dossier unavailable"
          message={
            dossier.error instanceof Error ? dossier.error.message : "This venture could not be loaded."
          }
          onRetry={() => dossier.refetch()}
        />
        <div className="mt-4 flex justify-center">
          <Button variant="outline" onClick={() => navigate("discover")}>
            Back to Discover
          </Button>
        </div>
      </div>
    );
  }

  const d = dossier.data;
  const venture = d.venture;

  const graph = buildEvidenceGraph(d);
  const releaseCount = d.repositories.reduce((sum, r) => sum + r.releases.length, 0);
  const contributorCount = d.repositories.reduce((sum, r) => sum + r.contributors.length, 0);

  const tabs: Array<{ value: TabKey; label: string; count?: number }> = [
    { value: "overview", label: "Overview" },
    { value: "founders", label: "Founders", count: d.founders.length },
    { value: "product", label: "Product", count: d.products.length },
    { value: "development", label: "Development", count: d.repositories.length },
    { value: "evidence", label: "Evidence", count: d.evidenceCount },
    { value: "onchain", label: "Onchain", count: d.tokenAssets.length },
    { value: "markets", label: "Markets", count: d.marketSnapshots.length },
    { value: "history", label: "History" },
    { value: "reports", label: "Reports", count: d.research.length },
  ];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="fs-panel fs-sheen p-5">
        <div className="flex flex-wrap items-start gap-4">
          <span
            aria-hidden="true"
            className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-[var(--fs-surface-3)] text-[var(--fs-accent-fg)]"
          >
            <Glyph name="venture" size={28} />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h1 className="fs-brand text-2xl font-bold text-ink">{venture.name}</h1>
              <Badge tone="info" size="sm">
                {venture.category}
              </Badge>
              <Badge tone="neutral" size="sm">
                {venture.ecosystem}
              </Badge>
              {venture.status !== "ACTIVE" ? (
                <Badge tone="warning" size="sm" dot>
                  {venture.status}
                </Badge>
              ) : null}
            </div>

            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-secondary">
              {venture.tagline ?? "No tagline recorded at intake."}
            </p>

            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-muted">
              {venture.website ? (
                <a
                  href={venture.website}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="fs-press inline-flex items-center gap-1 text-[var(--fs-accent-fg)] hover:underline"
                >
                  <Icon name="externalLink" size={11} />
                  {d.identities.find((i) => i.identityType === "WEBSITE")?.externalId ??
                    venture.website}
                </a>
              ) : null}

              {d.identities
                .filter((i) => i.identityType.startsWith("GITHUB"))
                .map((identity) => (
                  <a
                    key={identity.id}
                    href={identity.url ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="fs-press inline-flex items-center gap-1 hover:underline"
                  >
                    <Glyph name="repository" size={11} />
                    {identity.externalId}
                  </a>
                ))}

              {d.tokenAssets[0] ? (
                <span className="fs-data inline-flex items-center gap-1">
                  <Glyph name="token" size={11} />
                  {shortHash(d.tokenAssets[0].mint, 6, 4)}
                  <CopyButton value={d.tokenAssets[0].mint} label="mint address" />
                </span>
              ) : null}

              <span className="fs-data">registered {timeAgo(venture.createdAt)}</span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-2">
              {watchlists.data && watchlists.data.length > 0 ? (
                <Select
                  aria-label="Add to watchlist"
                  placeholder="Add to watchlist…"
                  size="sm"
                  className="w-44"
                  value=""
                  onValueChange={(id) => addToWatchlist.mutate(id)}
                  options={watchlists.data.map((w) => ({
                    value: w.id,
                    label: `${w.name}${w.items.some((i) => i.ventureId === venture.id) ? " ✓" : ""}`,
                  }))}
                />
              ) : null}
              <Button
                variant="outline"
                size="sm"
                onClick={() => refresh.mutate()}
                loading={refresh.isPending}
                loadingLabel="Queuing"
              >
                <Icon name="refresh" size={13} />
                Refresh
              </Button>
            </div>
            <p className="fs-data text-2xs text-ink-faint">
              {formatCompact(d.evidenceCount)} evidence records · updated {timeAgo(venture.updatedAt)}
            </p>
          </div>
        </div>
      </header>

      {/* ── Tabs ───────────────────────────────────────────────────── */}
      <TabbedPanels<TabKey>
        ariaLabel="Dossier sections"
        items={tabs}
        panels={{
          overview: () => (
            <div className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
              <div className="flex flex-col gap-5">
                <SectionShell title="Description" glyph="venture">
                  <p className="text-sm leading-relaxed text-ink-secondary">
                    {venture.description ??
                      "No description was provided at intake. The website snapshot in the Product tab is the current primary description source."}
                  </p>
                </SectionShell>

                <SectionShell
                  title="Canonical claims"
                  glyph="attestation"
                  aside={
                    <span className="fs-data text-2xs text-ink-faint">
                      {d.claims.length} recorded
                    </span>
                  }
                >
                  {d.claims.length === 0 ? (
                    <EmptyState
                      compact
                      glyph="attestation"
                      title="No claims recorded"
                      description="Claims are collected from the venture's own material and from provider observations. None exist yet."
                    />
                  ) : (
                    <ul className="flex flex-col gap-2.5">
                      {d.claims.slice(0, 6).map((claim) => (
                        <li key={claim.id} className="fs-panel-2 flex items-start justify-between gap-3 p-3">
                          <div className="min-w-0">
                            <p className="text-sm leading-snug text-ink">{claim.statement}</p>
                            <p className="mt-1 flex flex-wrap items-center gap-2 text-2xs text-ink-faint">
                              <span className="fs-data">{claim.category}</span>
                              <span>· origin {claim.origin.toLowerCase()}</span>
                              <span>
                                · {claim.evidence.length} evidence link
                                {claim.evidence.length === 1 ? "" : "s"}
                              </span>
                            </p>
                          </div>
                          <ClaimBadge value={claim.status} />
                        </li>
                      ))}
                    </ul>
                  )}
                </SectionShell>
              </div>

              <div className="flex flex-col gap-5">
                <SectionShell title="At a glance" glyph="venture">
                  <dl className="grid grid-cols-2 gap-2.5">
                    {[
                      { label: "Repositories", value: d.repositories.length, glyph: "repository" as const },
                      { label: "Releases", value: releaseCount, glyph: "development" as const },
                      { label: "Contributors", value: contributorCount, glyph: "founder" as const },
                      { label: "Evidence", value: d.evidenceCount, glyph: "evidence" as const },
                      { label: "Tokens", value: d.tokenAssets.length, glyph: "token" as const },
                      { label: "Research runs", value: d.research.length, glyph: "research" as const },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="rounded-lg border border-[var(--fs-border)] bg-surface-2 p-3"
                      >
                        <dt className="flex items-center gap-1.5 text-2xs text-ink-faint">
                          <Glyph name={stat.glyph} size={11} />
                          {stat.label}
                        </dt>
                        <dd className="fs-data fs-num mt-1 text-lg font-semibold text-ink">
                          {formatCompact(stat.value)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </SectionShell>

                <SectionShell
                  title="Evidence graph"
                  glyph="evidence"
                  aside={
                    <span className="fs-data text-2xs text-ink-faint">
                      {graph.nodes.length} nodes · {graph.edges.length} links
                    </span>
                  }
                >
                  <EvidenceGraph
                    nodes={graph.nodes}
                    edges={graph.edges}
                    onSelect={(id) => {
                      // Graph selection is a jump into the evidence tab.
                      const node = graph.nodes.find((n) => n.id === id);
                      if (node) void navigate("dossier", { slug });
                    }}
                  />
                </SectionShell>
              </div>
            </div>
          ),

          founders: () => <FoundersTab dossier={d} slug={slug} />,

          product: () => (
            <SectionShell
              title="Product & deployments"
              glyph="product"
              aside={
                <span className="fs-data text-2xs text-ink-faint">{d.products.length} recorded</span>
              }
            >
              {d.products.length === 0 ? (
                <EmptyState
                  compact
                  glyph="product"
                  title="No deployments recorded"
                  description="Product pages are observed from the venture's own website. Nothing has been collected yet."
                />
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {d.products.map((product) => (
                    <li key={product.id}>
                      <Card className="h-full p-4">
                        <div className="flex items-start justify-between gap-2">
                          <span className="min-w-0 truncate text-sm font-medium text-ink">
                            {product.url ?? product.name}
                          </span>
                          <Badge
                            tone={
                              product.status === "LIVE"
                                ? "success"
                                : product.status === "BLOCKED"
                                  ? "warning"
                                  : "neutral"
                            }
                            size="sm"
                            dot={product.status !== "LIVE"}
                          >
                            {product.status.toLowerCase()}
                          </Badge>
                        </div>
                        {product.url ? (
                          <a
                            href={product.url}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="mt-1.5 inline-flex items-center gap-1 text-xs text-[var(--fs-accent-fg)] hover:underline"
                          >
                            <Icon name="externalLink" size={11} />
                            visit source
                          </a>
                        ) : null}
                        <p className="fs-data mt-1 text-2xs text-ink-faint">
                          last checked {timeAgo(product.lastCheckedAt)}
                        </p>
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </SectionShell>
          ),

          development: () => (
            <div className="flex flex-col gap-5">
              {d.repositories.length === 0 ? (
                <EmptyState
                  glyph="repository"
                  title="No repository collected"
                  description="No repository is associated, or collection has not succeeded yet. With GITHUB_TOKEN configured, metadata, contributors, releases and commits are collected with full provenance."
                />
              ) : (
                d.repositories.map((repository) => (
                  <RepositoryPanel key={repository.id} repository={repository} />
                ))
              )}
            </div>
          ),

          evidence: () => <EvidenceTab slug={slug} claims={d.claims} />,

          onchain: () => <OnchainTab dossier={d} />,

          markets: () => <MarketsTab dossier={d} slug={slug} />,

          history: () => (
            <SectionShell
              title="Change intelligence"
              glyph="development"
              aside={
                <span className="fs-data text-2xs text-ink-faint">
                  {d.history.length} observations
                </span>
              }
            >
              {d.history.length === 0 ? (
                <EmptyState
                  compact
                  glyph="development"
                  title="No recorded changes"
                  description="History records what collectors observed and when. Nothing has changed since the venture was registered."
                />
              ) : (
                <SignalTimeline
                  entries={d.history.map((entry, i) => ({
                    id: `${entry.kind}-${i}`,
                    kind: entry.kind,
                    summary: entry.summary,
                    observedAt: timeAgo(entry.observedAt),
                  }))}
                />
              )}
            </SectionShell>
          ),

          reports: () => <ReportsTab dossier={d} />,
        }}
      />
    </div>
  );
}

/* ─── Graph construction ────────────────────────────────────────────── */

function buildEvidenceGraph(d: Dossier): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [{ id: "v", kind: "VENTURE", label: d.venture.name }];
  const edges: GraphEdge[] = [];

  for (const founder of d.founders.slice(0, 4)) {
    const id = `f-${founder.founder.id}`;
    nodes.push({
      id,
      kind: "FOUNDER",
      label: founder.founder.displayName,
      verification: founder.attribution,
    });
    edges.push({ from: "v", to: id, relation: "ATTRIBUTED" });
  }

  for (const repo of d.repositories.slice(0, 4)) {
    const id = `r-${repo.id}`;
    nodes.push({ id, kind: "REPOSITORY", label: `${repo.owner}/${repo.name}` });
    edges.push({ from: "v", to: id, relation: "ASSOCIATED" });
  }

  for (const claim of d.claims.slice(0, 5)) {
    const id = `c-${claim.id}`;
    nodes.push({ id, kind: "CLAIM", label: claim.statement.slice(0, 24), verification: claim.status });
    // A claim with contradicting evidence is drawn as a contradiction, which
    // is the single most important relationship to see at a glance.
    const contradicted = claim.evidence.some((link) => link.relation === "CONTRADICTS");
    edges.push({ from: "v", to: id, relation: contradicted ? "CONTRADICTS" : "SUPPORTS" });
  }

  const token = d.tokenAssets[0];
  if (token) {
    nodes.push({
      id: "t",
      kind: "TOKEN",
      label: token.symbol ?? shortHash(token.mint, 6, 4),
      verification: token.association,
    });
    edges.push({ from: "v", to: "t", relation: "ISSUES" });
  }

  return { nodes, edges };
}

/* ─── Founders ──────────────────────────────────────────────────────── */

function FoundersTab({ dossier, slug }: { dossier: Dossier; slug: string }) {
  return (
    <div className="flex flex-col gap-4">
      {dossier.founders.length === 0 ? (
        <EmptyState
          glyph="founder"
          title="No founder attribution recorded"
          description="FoundrySignal never infers founders from GitHub commits or wallet activity. Attribution is recorded explicitly and stays self-asserted until independent evidence supports it."
          action={<AttachFounderDialog slug={slug} />}
        />
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <h2 className="fs-label">
              Founder records ({dossier.founders.length})
            </h2>
            <AttachFounderDialog slug={slug} />
          </div>
          <ul className="flex flex-col gap-3">
            {dossier.founders.map((link) => (
              <li key={link.linkId}>
                <FounderCard
                  founder={{
                    displayName: link.founder.displayName,
                    bio: link.founder.bio,
                    role: link.role,
                    attribution: link.attribution,
                    identityLinks: link.founder.identityLinks.map((identity) => ({
                      identityType: identity.identityType,
                      externalId: identity.externalId,
                      confidence: identity.confidence,
                      url: identity.url,
                    })),
                    passportEvents: link.founder.passportEvents.map((event) => ({
                      summary: event.summary,
                      occurredAt: event.occurredAt ? timeAgo(event.occurredAt) : null,
                      sourceUrl: event.sourceUrl,
                    })),
                  }}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function AttachFounderDialog({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    displayName: "",
    role: "FOUNDER",
    claimedGithub: "",
    claimedX: "",
    sourceUrl: "",
  });

  const submit = useMutation({
    mutationFn: () =>
      api.post(`/api/v1/ventures/${slug}/founders`, {
        displayName: form.displayName,
        role: form.role,
        claimedGithub: form.claimedGithub || undefined,
        claimedX: form.claimedX || undefined,
        sourceUrl: form.sourceUrl || undefined,
      }),
    onSuccess: () => {
      toast.success("Founder attribution recorded as SELF_ASSERTED");
      setOpen(false);
      setForm({ displayName: "", role: "FOUNDER", claimedGithub: "", claimedX: "", sourceUrl: "" });
      qc.invalidateQueries({ queryKey: ["dossier", slug] });
    },
    onError: (error) => toast.apiError("Could not record attribution", error),
  });

  const roleOptions = ["FOUNDER", "CO_FOUNDER", "CORE_CONTRIBUTOR", "ADVISOR"].map((role) => ({
    value: role,
    label: role.replace(/_/g, " ").toLowerCase(),
  }));

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Icon name="plus" size={13} />
        Attribute founder
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title="Attribute founder"
          description="Attribution is recorded with an evidence record and stays self-asserted until independent sources corroborate it. Claimed handles are stored as claimed identities — never auto-equated with a person."
          busy={submit.isPending}
        >
          <form
            className="flex flex-col gap-3.5"
            onSubmit={(event) => {
              event.preventDefault();
              submit.mutate();
            }}
          >
            <Field id="af-name" label="Full name" required>
              {(props) => (
                <Input
                  {...props}
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                />
              )}
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="af-role" label="Role">
                {(props) => (
                  <Select
                    {...props}
                    value={form.role}
                    onValueChange={(role) => setForm({ ...form, role })}
                    options={roleOptions}
                  />
                )}
              </Field>

              <Field id="af-gh" label="Claimed GitHub">
                {(props) => (
                  <Input
                    {...props}
                    value={form.claimedGithub}
                    placeholder="username"
                    onChange={(e) => setForm({ ...form, claimedGithub: e.target.value })}
                  />
                )}
              </Field>
            </div>

            <Field id="af-x" label="Claimed X handle">
              {(props) => (
                <Input
                  {...props}
                  value={form.claimedX}
                  placeholder="@handle"
                  onChange={(e) => setForm({ ...form, claimedX: e.target.value })}
                />
              )}
            </Field>

            <Field
              id="af-src"
              label="Source URL for this attribution"
              hint="Where this attribution comes from. Required for anyone reviewing it later."
            >
              {(props) => (
                <Input
                  {...props}
                  type="url"
                  value={form.sourceUrl}
                  placeholder="https://…"
                  onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })}
                />
              )}
            </Field>

            <DialogFooter className="-mx-5 -mb-4">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                loading={submit.isPending}
                loadingLabel="Recording"
                disabled={!form.displayName.trim()}
              >
                Record attribution
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ─── Evidence ──────────────────────────────────────────────────────── */

/** Raise a dispute/correction against a claim. ANALYST+ in the workspace —
 * VIEWERs never see the affordance (the server enforces the same rule). */
function RaiseDisputeCard({ claims }: { claims: Dossier["claims"] }) {
  const account = useQuery({ queryKey: ["account"], queryFn: () => api.get<AccountState>("/api/v1/account") });
  const [claimId, setClaimId] = React.useState(claims[0]?.id ?? "");
  const [kind, setKind] = React.useState("DISPUTE");
  const [detail, setDetail] = React.useState("");

  const raise = useMutation({
    mutationFn: () =>
      api.post(`/api/v1/claims/${claimId}/disputes`, { kind, statement: detail.trim() }),
    onSuccess: () => {
      toast.success("Dispute filed — a moderator will review it.");
      setDetail("");
    },
    onError: (e) => toast.apiError("Dispute not filed", e),
  });

  if (claims.length === 0) return null;
  if (account.data?.workspaceRole === "VIEWER") return null;

  const claimOptions = claims.map((claim) => ({
    value: claim.id,
    label: `${claim.category} · ${claim.statement.length > 72 ? `${claim.statement.slice(0, 72)}…` : claim.statement}`,
  }));

  return (
    <Card className="p-4">
      <form
        className="flex flex-col gap-3"
        aria-label="Raise a dispute or correction"
        onSubmit={(e) => {
          e.preventDefault();
          if (detail.trim().length >= 8 && claimId) raise.mutate();
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="fs-label">Raise a dispute or correction</div>
          <span className="fs-data text-2xs text-ink-faint">ANALYST+ · reviewed by moderators</span>
        </div>
        <Field id="fs-dispute-claim" label="Claim" required>
          {(props) => <Select {...props} options={claimOptions} value={claimId} onValueChange={setClaimId} mono />}
        </Field>
        <Field id="fs-dispute-reason" label="Reason" required>
          {(props) => (
            <Select
              {...props}
              options={[
                { value: "DISPUTE", label: "Dispute — I believe this claim is wrong" },
                { value: "CORRECTION", label: "Correction — it is outdated or incomplete" },
                { value: "FOUNDER_RESPONSE", label: "Founder response" },
              ]}
              value={kind}
              onValueChange={setKind}
            />
          )}
        </Field>
        <Field id="fs-dispute-detail" label="Detail" hint="At least a sentence. Reference the evidence you believe contradicts the claim." required>
          {(props) => (
            <Textarea
              {...props}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              className="min-h-20"
              placeholder="The evidence shows…"
            />
          )}
        </Field>
        <div>
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={detail.trim().length < 8 || !claimId}
            disabledReason={detail.trim().length < 8 ? "Give at least a sentence of detail" : undefined}
            loading={raise.isPending}
            loadingLabel="Filing"
          >
            <Glyph name="risk" size={12} />
            File dispute
          </Button>
        </div>
      </form>
    </Card>
  );
}

function EvidenceTab({ slug, claims }: { slug: string; claims: Dossier["claims"] }) {
  const evidence = useQuery({
    queryKey: ["evidence", slug],
    queryFn: () => api.get<EvidenceRecord[]>(`/api/v1/ventures/${slug}/evidence`),
  });

  if (evidence.isLoading) return <LoadingState kind="table" rows={4} label="Evidence records" />;
  if (evidence.isError) {
    return (
      <ErrorState
        title="Evidence unavailable"
        message={evidence.error instanceof Error ? evidence.error.message : "The provider request failed."}
        onRetry={() => evidence.refetch()}
      />
    );
  }

  const records = evidence.data ?? [];

  if (records.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <RaiseDisputeCard claims={claims} />
        <EmptyState
          glyph="evidence"
          title="No evidence records"
          description="Evidence appears after collection jobs succeed. Every record carries provider, source URL, collection time, content hash and a computed verification class."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <RaiseDisputeCard claims={claims} />
      <div className="flex flex-col gap-2.5">
        <p className="fs-data text-2xs text-ink-faint">
          {records.length} records · append-only observation history · classifications computed by the
          evidence engine
        </p>
        <ul className="flex flex-col gap-2.5">
          {records.map((record) => (
            <li key={record.id}>
              <EvidenceCard
                evidence={{
                  id: record.id,
                  title: record.title,
                  provider: record.provider,
                  sourceType: record.sourceType,
                  verification: record.verification,
                  collectedAt: timeAgo(record.collectedAt),
                  contentHash: record.contentHash,
                  collectorVersion: record.collectorVersion,
                  snapshotSize: record.snapshotSize,
                  url: record.url,
                  payload: record.payload,
                }}
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ─── Onchain ───────────────────────────────────────────────────────── */

function OnchainTab({ dossier }: { dossier: Dossier }) {
  const mint = dossier.tokenAssets[0];

  if (!mint) {
    return (
      <EmptyState
        glyph="token"
        title="No token associated"
        description="Associate a Solana mint to read real mint metadata, authorities and supply. Observations record the slot, data sources and provider limitations."
      />
    );
  }

  const observation = dossier.onchainObservations.find((o) => o.kind === "MINT_METADATA");

  if (!observation) {
    return (
      <EmptyState
        glyph="token"
        title="No mint observation yet"
        description="The mint observation job has not completed. Use Refresh to re-queue collection."
      />
    );
  }

  const payload = observation.payload as Record<string, unknown>;
  const mintAuthority = payload.mintAuthority ? String(payload.mintAuthority) : null;

  return (
    <TokenCard
      structure={{
        mint: String(payload.mint ?? mint.mint),
        symbol: mint.symbol,
        name: mint.name,
        decimals: payload.decimals === undefined ? null : Number(payload.decimals),
        supply: payload.supply ? String(payload.supply) : null,
        program: payload.program ? String(payload.program) : null,
        mintAuthority,
        association: mint.association,
        slot: observation.slot,
        observedAt: observation.observationTime,
        providerLimitations: observation.providerLimitations,
      }}
      market={null}
      priceHistory={[]}
    />
  );
}

/* ─── Markets ───────────────────────────────────────────────────────── */

function MarketsTab({ dossier, slug }: { dossier: Dossier; slug: string }) {
  const qc = useQueryClient();
  const mint = dossier.tokenAssets[0];
  const snapshots = dossier.marketSnapshots;

  const collect = useMutation({
    mutationFn: () => api.post(`/api/v1/ventures/${slug}/token`, { mint: mint?.mint }),
    onSuccess: () => {
      toast.success("Onchain + market collection queued");
      window.setTimeout(() => qc.invalidateQueries({ queryKey: ["dossier", slug] }), 4000);
    },
    onError: (error) => toast.apiError("Could not queue collection", error),
  });

  if (!mint) {
    return (
      <EmptyState
        glyph="market"
        title="No token associated"
        description="Associate a token mint (Onchain tab or intake) to collect real market snapshots with asOf timestamps."
      />
    );
  }

  const latest = snapshots[snapshots.length - 1];
  // Oldest → newest for the chart; the API returns newest-first.
  const chronological = [...snapshots].reverse();
  const series: Series[] = [
    {
      id: "price",
      label: "Price (USD)",
      points: chronological
        .filter((s) => s.priceUsd !== null)
        .map((s) => ({ x: s.asOf, y: s.priceUsd as number })),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-xs leading-relaxed text-ink-muted">
          Market data is collected from Jupiter and kept structurally separate from venture evidence.
          Every snapshot carries its asOf timestamp and provider.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => collect.mutate()}
          loading={collect.isPending}
          loadingLabel="Collecting"
        >
          <Icon name="refresh" size={13} />
          Collect snapshot
        </Button>
      </div>

      {snapshots.length === 0 ? (
        <EmptyState
          glyph="market"
          title="No market snapshots"
          description="Use Collect snapshot — quotes are fetched live and stored with asOf timestamps. Nothing is backfilled or estimated."
        />
      ) : (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="fs-label">Price history</h2>
            <span className="fs-data text-2xs text-ink-faint">
              {snapshots.length} snapshot{snapshots.length === 1 ? "" : "s"} · latest{" "}
              {timeAgo(latest.asOf)}
            </span>
          </div>

          <div className="mt-3">
            {series[0].points.length >= 2 ? (
              <Sparkline
                points={series[0].points.map((p) => p.y)}
                ariaLabel="Token price snapshots"
                width={520}
                height={96}
              />
            ) : (
              <p className="text-xs text-ink-faint">
                {series[0].points.length} priced snapshot(s) — collect at least two to plot a trend.
              </p>
            )}
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <dt className="fs-label">Latest price</dt>
              <dd className="fs-data fs-num mt-1 text-sm font-semibold text-ink">
                {formatUsd(latest.priceUsd)}
              </dd>
            </div>
            <div>
              <dt className="fs-label">Liquidity</dt>
              <dd className="fs-data fs-num mt-1 text-sm font-semibold text-ink">
                {latest.liquidityUsd === null ? "—" : `$${formatCompact(latest.liquidityUsd)}`}
              </dd>
            </div>
            <div>
              <dt className="fs-label">24h change</dt>
              <dd
                className={cn(
                  "fs-data fs-num mt-1 text-sm font-semibold",
                  (latest.priceChange24h ?? 0) >= 0
                    ? "text-[var(--fs-positive-fg)]"
                    : "text-[var(--fs-danger-fg)]",
                )}
              >
                {latest.priceChange24h === null
                  ? "—"
                  : `${latest.priceChange24h > 0 ? "+" : ""}${latest.priceChange24h.toFixed(2)}%`}
              </dd>
            </div>
          </dl>
        </Card>
      )}

      {snapshots.length > 0 ? (
        <Card className="p-5">
          <h2 className="fs-label">Snapshot log</h2>
          <div className="fs-scroll mt-3 max-h-56 overflow-y-auto pr-1">
            <ul className="flex flex-col gap-1.5">
              {[...snapshots].reverse().map((snapshot) => (
                <li key={snapshot.id} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="fs-data fs-num text-ink-secondary">
                    {formatUsd(snapshot.priceUsd)}
                  </span>
                  <span className="fs-data text-2xs text-ink-faint">
                    {snapshot.provider} · {timeAgo(snapshot.asOf)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-3 text-2xs leading-relaxed text-ink-faint">
            Prices are reference data from a market provider, not investment guidance. Trading
            execution remains gated.
          </p>
        </Card>
      ) : null}
    </div>
  );
}

/* ─── Reports ───────────────────────────────────────────────────────── */

function ReportsTab({ dossier }: { dossier: Dossier }) {
  const navigate = useApp((s) => s.navigate);

  // Export downloads the markdown the API streams (Content-Disposition keeps
  // the server-chosen filename). Raw fetch because the client helper speaks
  // JSON envelopes only — the export endpoint returns markdown, not JSON.
  const exportReport = useMutation({
    mutationFn: async (reportId: string) => {
      const res = await fetch(`/api/v1/reports/${reportId}/export`, { credentials: "same-origin" });
      if (!res.ok) {
        let message = "Export failed.";
        try {
          const body = (await res.json()) as { error?: { message?: string } };
          message = body?.error?.message ?? message;
        } catch {
          // non-JSON error body — keep the generic message
        }
        throw new Error(message);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `foundrysignal-report-${reportId}.md`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => toast.success("Report exported"),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Export failed."),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="fs-label">Research reports ({dossier.research.length})</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate("research", { venture: dossier.venture.id })}
        >
          <Glyph name="research" size={13} />
          Ask the analyst
        </Button>
      </div>

      {dossier.research.length === 0 ? (
        <EmptyState
          glyph="research"
          title="No research runs yet"
          description="Generate a source-grounded report from collected evidence. Every factual statement cites a retrieved evidence record; missing evidence yields explicit unknowns."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {dossier.research.map((run) => {
            const valid = run.report?.validationStatus === "VALID";
            return (
              <li key={run.id} className="flex items-stretch gap-2">
                <button
                  type="button"
                  onClick={() => navigate("research", { venture: dossier.venture.id, run: run.id })}
                  className={cn(
                    "fs-panel fs-press flex flex-1 items-center justify-between gap-3 p-4 text-left",
                    "transition-colors duration-fast ease-out hover:bg-surface-2",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">
                      {run.question}
                    </span>
                    <span className="fs-data mt-1 block text-2xs text-ink-faint">
                      {run.status.toLowerCase()} · {timeAgo(run.createdAt)}
                      {run.report ? ` · citations ${run.report.validationStatus.toLowerCase()}` : ""}
                    </span>
                  </span>
                  <Badge
                    tone={
                      run.status === "FAILED"
                        ? "danger"
                        : run.status === "COMPLETED"
                          ? valid
                            ? "success"
                            : "warning"
                          : "info"
                    }
                    size="sm"
                    dot={run.status !== "COMPLETED" || !valid}
                  >
                    {run.status.toLowerCase()}
                  </Badge>
                </button>
                {run.report && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="self-center"
                    aria-label={`Export report for “${run.question}”`}
                    loading={exportReport.isPending && exportReport.variables === run.report.id}
                    loadingLabel="Exporting"
                    onClick={() => exportReport.mutate(run.report!.id)}
                  >
                    <Icon name="externalLink" size={12} />
                    Export
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export { CopyButton, buildEvidenceGraph };