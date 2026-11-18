"use client";

// AI research console — natural-language questions over collected evidence,
// live run status, citation-validated report rendering, markdown export.

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Card,
  CardContent,
  DegradedState,
  EmptyState,
  ErrorState,
  Field,
  Glyph,
  Icon,
  LoadingState,
  ResearchComposer,
  ResearchReport,
  ResearchReportSkeleton,
  RunStatusStrip,
  Select,
  cn,
  timeAgo,
  toast,
  type ResearchReportData,
  type ResearchRunStatus,
  type SuggestedQuestion,
} from "@/components/fs";
import { api, type ReportData, type VentureSummary, type ListResponse } from "@/lib/client/api";
import { useApp } from "@/lib/client/store";

interface RunState {
  id: string;
  question: string;
  status: string;
  failureReason: string | null;
  createdAt: string;
  finishedAt: string | null;
  report: { id: string; title: string; validationStatus: string; validationIssues: string[]; sections: ReportData["sections"]; citations: ReportData["citations"] } | null;
}

interface RunSummary {
  id: string;
  question: string;
  status: string;
  failureReason: string | null;
  createdAt: string;
  venture: { name: string; slug: string };
  report: { id: string; title: string; validationStatus: string } | null;
}

const SUGGESTIONS: SuggestedQuestion[] = [
  { id: "shipped", text: "What has this venture verifiably shipped?" },
  { id: "dev", text: "Summarize the development activity and its trend." },
  { id: "token", text: "What is the token structure and what remains unknown?" },
  { id: "claims", text: "Which claims are self-asserted and which are corroborated?" },
];

/** Adapts the API report shape onto the design-system report view model. */
function toReportData(report: NonNullable<RunState["report"]>): ResearchReportData {
  return {
    id: report.id,
    title: report.title,
    validationStatus: report.validationStatus,
    validationIssues: report.validationIssues,
    sections: report.sections.map((s) => ({
      id: s.id,
      title: s.heading,
      paragraphs: s.body.split(/\n{2,}/).filter(Boolean),
      citationIds: [],
    })),
    citations: Object.entries(report.citations).map(([cid, c]) => ({
      id: cid,
      evidenceId: c.evidenceId,
      label: cid,
      provider: c.provider,
      collectedAt: c.collectedAt,
    })),
  };
}

export function ResearchView({ ventureId, runId }: { ventureId?: string; runId?: string }) {
  const navigate = useApp((s) => s.navigate);
  const qc = useQueryClient();
  const [question, setQuestion] = useState("");

  const ventures = useQuery({ queryKey: ["ventures", "all"], queryFn: () => api.get<ListResponse>("/api/v1/ventures?limit=60") });
  const selectedVenture = ventureId ?? ventures.data?.items[0]?.id;

  const runs = useQuery({
    queryKey: ["research-runs", selectedVenture],
    queryFn: () =>
      api.get<RunSummary[]>(selectedVenture ? `/api/v1/research/runs?venture=${selectedVenture}` : "/api/v1/research/runs"),
    refetchInterval: (q) => (q.state.data?.some((r) => r.status === "QUEUED" || r.status === "RUNNING") ? 3000 : false),
  });

  const run = useQuery({
    queryKey: ["research-run", runId],
    queryFn: () => api.get<RunState>(`/api/v1/research/runs/${runId}`),
    enabled: !!runId,
    refetchInterval: (q) => (q.state.data && (q.state.data.status === "QUEUED" || q.state.data.status === "RUNNING") ? 3000 : false),
  });

  const start = useMutation({
    mutationFn: () => api.post<{ runId: string }>("/api/v1/research/runs", { ventureId: selectedVenture, question }),
    onSuccess: (r) => {
      toast.success("Research run started — grounded in collected evidence only");
      setQuestion("");
      qc.invalidateQueries({ queryKey: ["research-runs"] });
      navigate("research", { venture: selectedVenture ?? "", run: r.runId });
    },
    onError: (e) => toast.apiError("Research run not started", e),
  });

  const exportReport = async (reportId: string) => {
    try {
      const res = await fetch(`/api/v1/reports/${reportId}/export`, { credentials: "same-origin" });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `foundrysignal-report-${reportId}.md`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Report exported as markdown");
    } catch (e) {
      toast.apiError("Export failed", e);
    }
  };

  const ventureOptions = (ventures.data?.items ?? []).map((v: VentureSummary) => ({ value: v.id, label: v.name }));
  const selectedVentureName = ventures.data?.items.find((v) => v.id === selectedVenture)?.name;
  const noVentures = Boolean(ventures.data && ventures.data.items.length === 0);
  const runStatus: ResearchRunStatus | null = run.data
    ? {
        status: run.data.status,
        failureReason: run.data.failureReason,
        createdAt: run.data.createdAt,
        finishedAt: run.data.finishedAt,
        validationStatus: run.data.report?.validationStatus ?? null,
      }
    : null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <header>
        <h1 className="fs-brand text-xl font-bold text-ink">AI research analyst</h1>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">
          Retrieval-grounded generation over your tenant&apos;s collected evidence. Citations are validated server-side; unsupported
          points return explicit insufficient-evidence statements. External source content is treated as untrusted data.
        </p>
      </header>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <Field id="rq-scope" label="Venture scope">
            {(props) => (
              <Select
                {...props}
                value={selectedVenture ?? ""}
                onValueChange={(vid) => navigate("research", { venture: vid })}
                options={ventureOptions}
                placeholder={ventures.isLoading ? "Loading…" : "Select venture"}
              />
            )}
          </Field>

          <ResearchComposer
            value={question}
            onChange={setQuestion}
            onSubmit={() => {
              if (question.trim().length >= 8) start.mutate();
            }}
            suggestions={SUGGESTIONS}
            scopeLabel={selectedVentureName ? `Scoped to ${selectedVentureName}` : undefined}
            placeholder="e.g. What has been shipped and by whom?"
            submitting={start.isPending}
            disabled={!selectedVenture}
            error={start.isError ? (start.error as Error).message : null}
          />
        </CardContent>
      </Card>

      {noVentures && (
        <DegradedState
          provider="Research scope"
          message="No ventures registered yet — the analyst can only answer from collected evidence, never from general knowledge. Register a venture in Discover first."
        />
      )}

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <aside className="flex flex-col gap-2.5">
          <h2 className="fs-label flex items-center gap-1.5">
            <Glyph name="research" size={13} />
            Run history
          </h2>

          {runs.isLoading && <LoadingState rows={3} label="Runs loading" />}
          {runs.isError && (
            <ErrorState title="Run history unavailable" message={(runs.error as Error).message} onRetry={() => runs.refetch()} />
          )}
          {runs.data && runs.data.length === 0 && (
            <EmptyState glyph="research" compact title="No runs yet" description="Ask your first question above. Runs are workspace-scoped." />
          )}

          <ul className="flex flex-col gap-2" aria-label="Research runs">
            {(runs.data ?? []).map((r) => {
              const current = r.id === runId;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    aria-current={current ? "true" : undefined}
                    onClick={() => navigate("research", { venture: r.venture.slug, run: r.id })}
                    className={cn(
                      "fs-press w-full rounded-lg border bg-surface px-3 py-2.5 text-left transition-colors duration-fast ease-out",
                      "hover:border-[var(--fs-border-strong)] hover:bg-surface-2",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus-ring)]",
                      current ? "border-[var(--fs-accent-border)] bg-[var(--fs-accent-subtle)]" : "border-[var(--fs-border)]",
                    )}
                  >
                    <span className="block truncate text-xs font-medium text-ink">{r.question}</span>
                    <span className="fs-data mt-1 block truncate text-2xs text-ink-faint">
                      {r.venture.name} · {r.status} · {timeAgo(r.createdAt)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <div className="min-w-0">
          {!runId && (
            <EmptyState
              glyph="evidence"
              title="Select or start a research run"
              description="Reports render with their full citation appendix. Validation status shows whether every citation resolved to retrieved evidence."
            />
          )}

          {runId && run.isLoading && (
            <div className="fs-panel p-5" role="status" aria-busy="true">
              <ResearchReportSkeleton />
            </div>
          )}

          {runId && run.isError && (
            <ErrorState title="Run unavailable" message={(run.error as Error).message} onRetry={() => run.refetch()} />
          )}

          {runId && run.data && !run.data.report && (
            <Card>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <RunStatusStrip run={runStatus!} />
                  <Button variant="ghost" size="sm" onClick={() => run.refetch()}>
                    <Icon name="refresh" size={13} />
                    Refresh
                  </Button>
                </div>
                <p className="text-sm text-ink">{run.data.question}</p>
                <p className="text-xs leading-relaxed text-ink-muted">
                  Retrieving evidence → grounded generation → citation validation. This uses a real model call and typically
                  completes within one to two minutes. Original evidence is never modified by a research run.
                </p>
                {run.data.status === "FAILED" && (
                  <ErrorState title="Run failed" message={run.data.failureReason ?? "No failure reason was recorded."} />
                )}
              </CardContent>
            </Card>
          )}

          {runId && run.data?.report && (
            <Card>
              <CardContent>
                <ResearchReport
                  report={toReportData(run.data.report)}
                  onExport={exportReport}
                  exporting={false}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
