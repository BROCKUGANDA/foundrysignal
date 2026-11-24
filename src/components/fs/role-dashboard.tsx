"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, ErrorState, LoadingState } from "@/components/fs";
import { api, type AccountState } from "@/lib/client/api";
import { getRoleWorkspace } from "@/lib/client/role-workspace";
import { titleForSection } from "@/lib/client/routes";
import { useApp } from "@/lib/client/store";

type Watchlist = { id: string; name: string; items: Array<{ ventureId: string; name: string; slug: string }> };
type Run = { id: string; question: string; status: string; venture: { name: string; slug: string }; report: { title: string; validationStatus: string } | null };

export function RoleDashboard({ account }: { account: AccountState }) {
  const navigate = useApp((s) => s.navigate);
  const workspace = getRoleWorkspace(account);
  const active = account.workspaces.find((w) => w.id === account.activeWorkspaceId);
  const lists = useQuery({
    queryKey: ["role-dashboard", account.activeWorkspaceId, "watchlists"],
    queryFn: () => api.get<Watchlist[]>("/api/v1/watchlists"),
  });
  const runs = useQuery({
    queryKey: ["role-dashboard", account.activeWorkspaceId, "research"],
    queryFn: () => api.get<Run[]>("/api/v1/research/runs"),
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="space-y-3">
        <p className="text-sm text-ink-muted">{active?.name ?? "Active workspace"} · {account.workspaceRole}</p>
        <h1 className="text-3xl font-semibold">{workspace.title}</h1>
        <p className="max-w-3xl text-ink-muted">{workspace.description}</p>
        <p className="text-sm text-ink-muted">Your profile personalizes this page; permissions come from workspace membership. Plan limits and server checks still apply.</p>
      </header>

      <nav aria-label="Workspace priorities" className="flex flex-wrap gap-2">
        {workspace.priorities.map((section) => (
          <Button key={section} variant="secondary" onClick={() => navigate(section)}>{titleForSection(section)}</Button>
        ))}
      </nav>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Tracked ventures</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {lists.isPending ? <LoadingState rows={2} label="Loading workspace watchlists" /> : lists.isError ? (
              <ErrorState title="Watchlists unavailable" message="Workspace watchlists could not be loaded." onRetry={() => lists.refetch()} />
            ) : (
              <>
                <p>{lists.data.length} watchlists · {new Set(lists.data.flatMap((list) => list.items.map((item) => item.ventureId))).size} unique tracked ventures</p>
                {lists.data.length === 0 && <p className="text-ink-muted">No ventures tracked in this workspace yet. Start with Discover.</p>}
                {lists.data.slice(0, 3).map((list) => (
                  <div key={list.id} className="space-y-1">
                    <h2 className="font-medium">{list.name}</h2>
                    {list.items.slice(0, 3).map((item) => (
                      <Button key={item.ventureId} variant="secondary" onClick={() => navigate("dossier", { slug: item.slug })}>{item.name}</Button>
                    ))}
                  </div>
                ))}
              </>
            )}
            <Button variant="secondary" onClick={() => navigate("watchlists")}>Read watchlists</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Recent workspace research</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {runs.isPending ? <LoadingState rows={2} label="Loading workspace research" /> : runs.isError ? (
              <ErrorState title="Research unavailable" message="Recent workspace research could not be loaded." onRetry={() => runs.refetch()} />
            ) : runs.data.length === 0 ? <p className="text-ink-muted">No research runs in this workspace yet. Explore a venture to begin a review.</p> : (
              <>
                <p className="text-sm text-ink-muted">Showing {Math.min(5, runs.data.length)} of the latest {runs.data.length} runs (up to 30 returned).</p>
                {runs.data.slice(0, 5).map((run) => (
                  <div key={run.id} className="space-y-1">
                    <p className="text-sm text-ink-muted">{run.venture.name} · {run.status}</p>
                    <Button variant="secondary" onClick={() => navigate("research", { run: run.id })}>{run.report?.title ?? run.question}</Button>
                    {run.report && <Badge>{run.report.validationStatus}</Badge>}
                  </div>
                ))}
              </>
            )}
            <Button variant="secondary" onClick={() => navigate("research")}>Open research</Button>
          </CardContent>
        </Card>
      </div>

      <section aria-label="Authorized workspace actions" className="flex flex-wrap gap-3">
        {workspace.canEditWorkspace && <Button variant="secondary" onClick={() => navigate("watchlists")}>Manage watchlists and alerts</Button>}
        {workspace.canManageWorkspace && <Button variant="secondary" onClick={() => navigate("settings")}>Manage workspace and members</Button>}
        {workspace.canModerate && <Button variant="secondary" onClick={() => navigate("admin")}>Open administration</Button>}
        {!workspace.canEditWorkspace && <p className="text-sm text-ink-muted">Watchlist and alert changes require an analyst, admin, or owner workspace role. Research remains readable.</p>}
      </section>
    </div>
  );
}