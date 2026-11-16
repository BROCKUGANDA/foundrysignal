"use client";

// Discover — venture directory: real search, filters, sort, saved searches,
// and venture intake that queues real ingestion. Result origin is disclosed
// on every record; nothing here is paid placement.

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Input,
  Select,
  Checkbox,
  Field,
  Dialog,
  DialogContent,
  DialogFooter,
  Badge,
  VentureCard,
  VentureCardSkeleton,
  LoadingState,
  EmptyState,
  ErrorState,
  SectionShell,
  Icon,
  Glyph,
  toast,
  timeAgo,
  cn,
} from "@/components/fs";
import { api, type VentureSummary, type Capabilities, type AccountState } from "@/lib/client/api";
import { useApp } from "@/lib/client/store";

const CATEGORIES = ["ALL", "DEFI", "INFRA", "DEVTOOLS", "PAYMENTS", "CONSUMER", "GAMING", "RWA", "OTHER"] as const;

const CATEGORY_OPTIONS = CATEGORIES.map((c) => ({ value: c, label: c === "ALL" ? "All categories" : c }));

const SORT_OPTIONS = [
  { value: "RECENT", label: "Recently added" },
  { value: "ACTIVITY", label: "Last updated" },
  { value: "NAME", label: "Name A–Z" },
];

interface ListResponse {
  items: VentureSummary[];
  total: number;
  nextCursor?: string;
}

interface SavedSearch {
  id: string;
  name: string;
  query: Record<string, string>;
  createdAt: string;
}

export function DiscoverView({ account }: { account: AccountState }) {
  const navigate = useApp((s) => s.navigate);
  const routeQ = useApp((s) => s.params.q ?? "");
  const [q, setQ] = React.useState(routeQ);
  const [category, setCategory] = React.useState<string>("ALL");
  const [sort, setSort] = React.useState("RECENT");
  const [hasRepo, setHasRepo] = React.useState(false);
  const [hasToken, setHasToken] = React.useState(false);
  const [intakeOpen, setIntakeOpen] = React.useState(false);

  // Keep the input in step with same-page navigation (e.g. header search).
  React.useEffect(() => {
    setQ(routeQ);
  }, [routeQ]);

  const canRegister = account.workspaceRole !== "VIEWER";

  const ventures = useQuery({
    queryKey: ["ventures", { q, category, sort, hasRepo, hasToken }],
    queryFn: () => {
      const sp = new URLSearchParams();
      if (q) sp.set("q", q);
      if (category !== "ALL") sp.set("category", category);
      sp.set("sort", sort);
      if (hasRepo) sp.set("hasRepo", "true");
      if (hasToken) sp.set("hasToken", "true");
      return api.get<ListResponse>(`/api/v1/ventures?${sp.toString()}`);
    },
  });

  const saved = useQuery({
    queryKey: ["saved-searches"],
    queryFn: () => api.get<SavedSearch[]>("/api/v1/saved-searches"),
  });

  const qc = useQueryClient();

  const saveSearch = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>("/api/v1/saved-searches", {
        name: q || `${category} · ${sort}`.trim(),
        query: { q, category, sort },
      }),
    onSuccess: () => {
      toast.success("Search saved");
      qc.invalidateQueries({ queryKey: ["saved-searches"] });
    },
    onError: (e) => toast.apiError("Could not save search", e),
  });

  const deleteSaved = useMutation({
    mutationFn: (id: string) => api.del(`/api/v1/saved-searches?id=${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-searches"] }),
    onError: (e) => toast.apiError("Could not delete saved search", e),
  });

  const applySaved = (s: SavedSearch) => {
    setQ(s.query.q ?? "");
    setCategory(s.query.category ?? "ALL");
    setSort(s.query.sort ?? "RECENT");
  };

  const items = ventures.data?.items ?? [];
  const filtered = Boolean(q) || category !== "ALL" || hasRepo || hasToken;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="fs-brand text-xl font-bold text-ink">Discover</h1>
          <p className="mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-ink-muted">
            <span aria-hidden="true" className="mt-0.5 shrink-0">
              <Icon name="info" size={12} />
            </span>
            Ventures appear because a researcher registered them and collectors verified associations.
            Nothing is paid placement — origin is disclosed on each record.
          </p>
        </div>
        {canRegister ? (
          <Button onClick={() => setIntakeOpen(true)} className="shrink-0">
            <Icon name="plus" size={15} />
            Register venture
          </Button>
        ) : null}
      </header>

      {/* Filters */}
      <form
        // Enter in any text field applies the current filters (the query keys
        // are already reactive, so this just prevents a page reload).
        onSubmit={(event) => event.preventDefault()}
        className="fs-panel flex flex-wrap items-end gap-3 p-4"
        aria-label="Directory filters"
      >
        <div className="min-w-52 flex-1">
          <Field id="disc-q" label="Search">
            {(fieldProps) => (
              <div className="relative">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
                >
                  <Icon name="search" size={13} />
                </span>
                <Input
                  {...fieldProps}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Name, tagline, description…"
                  insetStart={30}
                  type="search"
                />
              </div>
            )}
          </Field>
        </div>

        <div className="w-40">
          <Field id="disc-cat" label="Category">
            {(fieldProps) => (
              <Select
                {...fieldProps}
                value={category}
                onValueChange={setCategory}
                options={CATEGORY_OPTIONS}
              />
            )}
          </Field>
        </div>

        <div className="w-44">
          <Field id="disc-sort" label="Sort">
            {(fieldProps) => (
              <Select {...fieldProps} value={sort} onValueChange={setSort} options={SORT_OPTIONS} />
            )}
          </Field>
        </div>

        <div className="flex flex-col gap-1.5 pb-1">
          <span className="fs-label">Filters</span>
          <div className="flex flex-wrap items-center gap-3">
            <Checkbox label="has repository" checked={hasRepo} onChange={(e) => setHasRepo(e.target.checked)} />
            <Checkbox label="has token" checked={hasToken} onChange={(e) => setHasToken(e.target.checked)} />
          </div>
        </div>

        <div className="flex gap-2 pb-0.5">
          <Button
            variant="outline"
            size="md"
            onClick={() => saveSearch.mutate()}
            loading={saveSearch.isPending}
            loadingLabel="Saving"
          >
            <Icon name="plus" size={13} />
            Save search
          </Button>
        </div>
      </form>

      {/* Saved searches */}
      {saved.data && saved.data.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="fs-label">Saved</span>
          {saved.data.map((s) => (
            <span key={s.id} className="fs-chip fs-chip-neutral gap-1 pr-1">
              <button
                type="button"
                onClick={() => applySaved(s)}
                className="fs-press truncate hover:text-ink"
                title={`Apply saved search: ${s.name}`}
              >
                {s.name}
              </button>
              <button
                type="button"
                onClick={() => deleteSaved.mutate(s.id)}
                aria-label={`Delete saved search ${s.name}`}
                className="fs-press rounded-full p-0.5 text-ink-faint hover:text-[var(--fs-danger-fg)]"
              >
                <Icon name="trash" size={10} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {/* Results */}
      {ventures.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <VentureCardSkeleton key={i} />
          ))}
          <span className="fs-sr-only">Loading directory</span>
        </div>
      ) : null}

      {ventures.isError ? (
        <ErrorState
          title="Directory unavailable"
          message={(ventures.error as Error).message}
          onRetry={() => ventures.refetch()}
        />
      ) : null}

      {ventures.data && items.length === 0 ? (
        filtered ? (
          <EmptyState
            glyph="venture"
            title="No ventures match these filters"
            description="The registry contains real records only. Widen the filters, or register the venture you are looking for."
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setQ("");
                  setCategory("ALL");
                  setHasRepo(false);
                  setHasToken(false);
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            glyph="venture"
            title="The registry is empty"
            description="FoundrySignal never fabricates companies. Register a real venture with its website or GitHub organization, and collectors will populate the dossier from public sources."
            action={
              canRegister ? (
                <Button onClick={() => setIntakeOpen(true)}>
                  <Icon name="plus" size={14} />
                  Register the first venture
                </Button>
              ) : undefined
            }
          />
        )
      ) : null}

      {items.length > 0 ? (
        <>
          <p className="fs-data text-2xs text-ink-faint">
            {ventures.data?.total ?? items.length} venture
            {(ventures.data?.total ?? items.length) === 1 ? "" : "s"} · sorted by{" "}
            {sort.toLowerCase()}
            {ventures.data?.nextCursor ? " · more available" : ""}
          </p>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((v) => (
              <li key={v.id}>
                <VentureCard venture={v} onOpen={(slug) => navigate("dossier", { slug })} />
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {/* Intake dialog */}
      <Dialog open={intakeOpen} onOpenChange={setIntakeOpen}>
        <DialogContent
          title="Register a venture"
          description="Submit real public identifiers. Collectors fetch the website, GitHub organization or repository, and any Solana mint. Only real data is stored — if a provider is unavailable, the dossier says so."
          size="lg"
        >
          <IntakeForm onDone={() => setIntakeOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Intake form ───────────────────────────────────────────────────── */

const INTAKE_CATEGORY_OPTIONS = CATEGORIES.filter((c) => c !== "ALL").map((c) => ({
  value: c,
  label: c,
}));

interface IntakeField {
  key: "name" | "tagline" | "websiteUrl" | "githubOrgUrl" | "githubRepoUrl" | "xHandle" | "mint";
  label: string;
  placeholder: string;
  required?: boolean;
  mono?: boolean;
}

const INTAKE_FIELDS: ReadonlyArray<IntakeField> = [
  { key: "name", label: "Venture name", placeholder: "A real project you are researching", required: true },
  { key: "tagline", label: "Tagline", placeholder: "One-line positioning (optional)" },
  { key: "websiteUrl", label: "Website", placeholder: "https://…" },
  { key: "githubOrgUrl", label: "GitHub organization", placeholder: "https://github.com/<org>" },
  { key: "githubRepoUrl", label: "GitHub repository", placeholder: "https://github.com/<owner>/<repo>" },
  { key: "xHandle", label: "X handle", placeholder: "@handle" },
  { key: "mint", label: "Token mint (Solana)", placeholder: "Base58 mint address", mono: true },
];

type IntakeKey = IntakeField["key"];

function IntakeForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const navigate = useApp((s) => s.navigate);
  const [form, setForm] = React.useState<Record<IntakeKey, string>>({
    name: "",
    tagline: "",
    websiteUrl: "",
    githubOrgUrl: "",
    githubRepoUrl: "",
    xHandle: "",
    mint: "",
  });
  const [category, setCategory] = React.useState("OTHER");

  const caps = useQuery({
    queryKey: ["capabilities"],
    queryFn: () => api.get<Capabilities>("/api/v1/capabilities"),
    staleTime: 60_000,
  });

  const submit = useMutation({
    mutationFn: () =>
      api.post<{ ventureId: string; slug: string; jobs: string[]; existing?: boolean }>(
        "/api/v1/ventures",
        { ...form, category },
      ),
    onSuccess: (res) => {
      toast.success(
        res.existing
          ? `${res.jobs.length} new collection job(s) queued on the existing dossier — matched by website, no duplicate created`
          : `${res.jobs.length} collection job(s) queued — the dossier populates as real data lands`,
      );
      qc.invalidateQueries({ queryKey: ["ventures"] });
      onDone();
      navigate("dossier", { slug: res.slug });
    },
    onError: (e) => toast.apiError("Registration failed", e),
  });

  const githubUnavailable = caps.data ? !caps.data.githubCollection.available : false;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit.mutate();
      }}
    >
      {INTAKE_FIELDS.map((field) => (
        <Field key={field.key} id={`intake-${field.key}`} label={field.label} required={field.required}>
          {(fieldProps) => (
            <Input
              {...fieldProps}
              value={form[field.key]}
              placeholder={field.placeholder}
              mono={field.mono}
              required={field.required}
              onChange={(event) => setForm((prev) => ({ ...prev, [field.key]: event.target.value }))}
            />
          )}
        </Field>
      ))}

      <Field id="intake-category" label="Category">
        {(fieldProps) => (
          <Select
            {...fieldProps}
            value={category}
            onValueChange={setCategory}
            options={INTAKE_CATEGORY_OPTIONS}
          />
        )}
      </Field>

      {githubUnavailable ? (
        <p className="rounded-md border border-dashed border-[var(--fs-warning-border)] bg-surface-2 px-3 py-2.5 text-2xs leading-relaxed text-ink-muted">
          <Icon name="refresh" size={12} className="mr-1.5 inline align-middle" />
          GitHub collection currently reports <span className="fs-data">RATE_LIMITED</span> (no
          GITHUB_TOKEN configured; the unauthenticated quota is exhausted on this egress IP).
          Repository data fills in once a token is configured — intake itself is unaffected.
        </p>
      ) : null}

      <DialogFooter className="-mx-5 -mb-4 mt-1">
        <Button type="button" variant="ghost" onClick={onDone} disabled={submit.isPending}>
          Cancel
        </Button>
        <Button type="submit" loading={submit.isPending} loadingLabel="Queueing collection" disabled={!form.name.trim()}>
          Register &amp; start collection
        </Button>
      </DialogFooter>
    </form>
  );
}