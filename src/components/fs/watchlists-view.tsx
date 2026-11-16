"use client";

// Watchlists & alerts — persistent watchlists, saved searches, alert rules,
// alert events. All workspace-scoped.

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  Icon,
  Input,
  LoadingState,
  SectionShell,
  Select,
  toast,
} from "@/components/fs";
import { api } from "@/lib/client/api";
import { useApp } from "@/lib/client/store";

interface Watchlist {
  id: string;
  name: string;
  items: Array<{ ventureId: string; slug: string; name: string; category: string; note: string | null; addedAt: string }>;
}
interface AlertRow {
  id: string;
  kind: string;
  active: boolean;
  venture: { name: string; slug: string };
  lastEvaluatedAt: string | null;
  events: Array<{ id: string; summary: string; createdAt: string; read: boolean }>;
}
interface AlertEvent {
  id: string;
  kind: string;
  venture: { name: string; slug: string };
  summary: string;
  createdAt: string;
  read: boolean;
}

const ALERT_KINDS = [
  ["RELEASE_PUBLISHED", "New release published"],
  ["AUTHORITY_CHANGED", "Token authority changed"],
  ["EVIDENCE_CONTRADICTED", "Claim contradicted"],
  ["REPO_ACTIVITY", "Repository activity"],
  ["MARKET_MOVE", "Market move (24h ≥ threshold)"],
] as const;

const ALERT_KIND_OPTIONS = ALERT_KINDS.map(([value, label]) => ({ value, label }));

export function WatchlistsView() {
  const navigate = useApp((s) => s.navigate);
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [alertVenture, setAlertVenture] = useState("");
  const [alertKind, setAlertKind] = useState("RELEASE_PUBLISHED");

  const watchlists = useQuery({ queryKey: ["watchlists"], queryFn: () => api.get<Watchlist[]>("/api/v1/watchlists") });
  const alerts = useQuery({ queryKey: ["alerts"], queryFn: () => api.get<AlertRow[]>("/api/v1/alerts") });
  const events = useQuery({ queryKey: ["alert-events"], queryFn: () => api.get<AlertEvent[]>("/api/v1/alerts/events"), refetchInterval: 15000 });
  const ventures = useQuery({ queryKey: ["ventures", "all"], queryFn: () => api.get<{ items: Array<{ id: string; name: string }> }>("/api/v1/ventures?limit=60") });

  const createList = useMutation({
    mutationFn: () => api.post("/api/v1/watchlists", { name: newName }),
    onSuccess: () => {
      setNewName("");
      qc.invalidateQueries({ queryKey: ["watchlists"] });
      toast.success("Watchlist created");
    },
    onError: (e) => toast.apiError("Watchlist not created", e),
  });

  const removeItem = useMutation({
    mutationFn: (p: { watchlistId: string; ventureId: string }) => api.del(`/api/v1/watchlists/${p.watchlistId}/items?ventureId=${p.ventureId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlists"] }),
    onError: (e) => toast.apiError("Item not removed", e),
  });

  const createAlert = useMutation({
    mutationFn: () => api.post("/api/v1/alerts", { ventureId: alertVenture, kind: alertKind }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alerts"] });
      toast.success("Alert rule created");
    },
    onError: (e) => toast.apiError("Alert rule not created", e),
  });

  const toggleAlert = useMutation({
    mutationFn: (p: { id: string; active: boolean }) => api.patch("/api/v1/alerts", p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
    onError: (e) => toast.apiError("Alert rule not updated", e),
  });

  const deleteAlert = useMutation({
    mutationFn: (id: string) => api.del(`/api/v1/alerts?id=${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
    onError: (e) => toast.apiError("Alert rule not deleted", e),
  });

  const ventureOptions = (ventures.data?.items ?? []).map((v) => ({ value: v.id, label: v.name }));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header>
        <h1 className="fs-brand text-xl font-bold text-ink">Watchlists &amp; alerts</h1>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">
          Persistent, workspace-scoped monitoring. Alerts evaluate on collection deltas — a new release, an authority change, a
          contradicted claim.
        </p>
      </header>

      <SectionShell title="Watchlists" glyph="evidence" id="fs-watchlists">
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-48">
            <label htmlFor="wl-name" className="fs-sr-only">
              New watchlist name
            </label>
            <Input
              id="wl-name"
              size="sm"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New watchlist name"
            />
          </div>
          <Button
            size="sm"
            onClick={() => createList.mutate()}
            disabled={!newName.trim() || createList.isPending}
            loading={createList.isPending}
            loadingLabel="Creating watchlist"
          >
            <Icon name="plus" size={13} />
            Create
          </Button>
        </div>

        {watchlists.isLoading && <LoadingState kind="card" rows={2} label="Watchlists loading" />}
        {watchlists.isError && (
          <ErrorState
            title="Watchlists unavailable"
            message={(watchlists.error as Error).message}
            onRetry={() => watchlists.refetch()}
          />
        )}
        {watchlists.data?.length === 0 && (
          <EmptyState
            glyph="watchlist"
            title="No watchlists yet"
            description="Create a watchlist and add ventures from any dossier to monitor changes over time."
          />
        )}

        <div className="grid gap-3 md:grid-cols-2">
          {(watchlists.data ?? []).map((w) => (
            <Card key={w.id}>
              <CardHeader>
                <CardTitle className="text-sm">{w.name}</CardTitle>
                <Badge tone="neutral" size="sm">
                  {w.items.length} {w.items.length === 1 ? "venture" : "ventures"}
                </Badge>
              </CardHeader>
              <CardContent>
                {w.items.length === 0 ? (
                  <p className="text-xs text-ink-muted">Empty — add ventures from a dossier.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5" aria-label={`${w.name} ventures`}>
                    {w.items.map((i) => (
                      <li key={i.ventureId} className="flex items-center justify-between gap-2 text-xs">
                        <Button
                          variant="link"
                          size="sm"
                          className="min-w-0 truncate px-0 text-xs"
                          onClick={() => navigate("dossier", { slug: i.slug })}
                        >
                          {i.name}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${i.name} from ${w.name}`}
                          onClick={() => removeItem.mutate({ watchlistId: w.id, ventureId: i.ventureId })}
                        >
                          <Icon name="trash" size={13} />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </SectionShell>

      <SectionShell title="Alert rules" glyph="attestation" id="fs-alert-rules">
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-44">
            <label htmlFor="alert-venture" className="fs-sr-only">
              Alert venture
            </label>
            <Select
              id="alert-venture"
              size="sm"
              value={alertVenture}
              onValueChange={setAlertVenture}
              options={ventureOptions}
              placeholder="Venture…"
            />
          </div>
          <div className="w-52">
            <label htmlFor="alert-kind" className="fs-sr-only">
              Alert kind
            </label>
            <Select id="alert-kind" size="sm" value={alertKind} onValueChange={setAlertKind} options={ALERT_KIND_OPTIONS} />
          </div>
          <Button
            size="sm"
            onClick={() => createAlert.mutate()}
            disabled={!alertVenture || createAlert.isPending}
            loading={createAlert.isPending}
            loadingLabel="Creating alert"
            disabledReason={!alertVenture ? "Select a venture first" : undefined}
          >
            <Icon name="bell" size={13} />
            Create alert
          </Button>
        </div>

        {alerts.isLoading && <LoadingState rows={2} label="Alert rules loading" />}
        {alerts.isError && (
          <ErrorState title="Alert rules unavailable" message={(alerts.error as Error).message} onRetry={() => alerts.refetch()} />
        )}
        {alerts.data?.length === 0 && (
          <EmptyState
            glyph="attestation"
            title="No alert rules"
            description="Alerts fire on real observation deltas — never on simulated data."
          />
        )}

        <ul className="flex flex-col gap-2">
          {(alerts.data ?? []).map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--fs-border)] bg-surface px-3.5 py-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Button variant="link" size="sm" className="px-0 text-sm" onClick={() => navigate("dossier", { slug: a.venture.slug })}>
                    {a.venture.name}
                  </Button>
                  <Badge tone="neutral">{a.kind.replace(/_/g, " ")}</Badge>
                  {!a.active && <Badge tone="warning">Paused</Badge>}
                </div>
                <div className="fs-data mt-1 text-2xs text-ink-faint">
                  last evaluated {a.lastEvaluatedAt ? new Date(a.lastEvaluatedAt).toLocaleString() : "never"} · {a.events.length} event(s)
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`${a.active ? "Pause" : "Resume"} alert rule for ${a.venture.name}`}
                  onClick={() => toggleAlert.mutate({ id: a.id, active: !a.active })}
                >
                  <Icon name="bell" size={12} />
                  {a.active ? "Pause" : "Resume"}
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Delete alert rule for ${a.venture.name}`} onClick={() => deleteAlert.mutate(a.id)}>
                  <Icon name="trash" size={13} />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </SectionShell>

      <SectionShell title="Alert events" id="fs-alert-events">
        {events.isLoading && <LoadingState rows={2} label="Alert events loading" />}
        {events.isError && (
          <ErrorState title="Alert events unavailable" message={(events.error as Error).message} onRetry={() => events.refetch()} />
        )}
        {events.data?.length === 0 && <p className="text-xs text-ink-muted">No events fired yet.</p>}
        <ul className="flex flex-col gap-1.5">
          {(events.data ?? []).map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap items-center gap-3 rounded-md border border-[var(--fs-border)] bg-surface px-3 py-2.5 text-xs"
            >
              <Badge tone={e.read ? "neutral" : "info"} dot>
                {e.read ? "read" : "new"}
              </Badge>
              <span className="min-w-0 text-ink-secondary">{e.summary}</span>
              <span className="fs-data ml-auto shrink-0 text-2xs text-ink-faint">
                {e.venture.name} · {new Date(e.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </SectionShell>
    </div>
  );
}
