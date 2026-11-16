"use client";

// Admin console — queue monitoring, dead letters, provider status, audit log,
// data-quality stats. Platform-admin gated server-side (RBAC double check).

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  EmptyState,
  ErrorState,
  Field,
  ForbiddenState,
  Glyph,
  Icon,
  LoadingState,
  SectionShell,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableScroll,
  Textarea,
  cn,
  timeAgo,
  toast,
  type BadgeTone,
} from "@/components/fs";
import { api } from "@/lib/client/api";

interface AdminOverview {
  queue: Array<{ status: string; count: number }>;
  deadLetters: Array<{ id: string; kind: string; lastError: string | null; attempts: number; failureClass: string | null; finishedAt: string | null }>;
  recentJobs: Array<{ id: string; kind: string; status: string; attempts: number; failureClass: string | null; lastError: string | null; createdAt: string; finishedAt: string | null }>;
  auditLog: Array<{ id: string; action: string; summary: string; actor: string; createdAt: string }>;
  stats: { users: number; ventures: number; evidence: number; contradictedClaims: number; researchFailures: number };
  breakers: { github: { state: string; failures: number }; jupiter: { state: string; failures: number } };
}

interface GateView {
  key: string;
  title: string;
  description: string;
  state: string;
  decisionNotes: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  updatedAt: string;
}

interface TradingReadiness {
  gates: GateView[];
  conditions: { allReviewsApproved: boolean; killSwitchClear: boolean; envFlagSet: boolean };
  executionAllowed: boolean;
  blockReason: string;
}

const KILL_SWITCH_KEY = "EXECUTION_KILL_SWITCH";
const REVIEW_KEYS = ["PRODUCT_REVIEW", "LEGAL_JURISDICTION_REVIEW", "PROVIDER_INTEGRATION_REVIEW", "SECURITY_REVIEW"];

const GATE_TONE: Record<string, BadgeTone> = {
  APPROVED: "success",
  CLEAR: "success",
  REJECTED: "danger",
  ENGAGED: "danger",
  IN_REVIEW: "info",
};

const JOB_TONE: Record<string, BadgeTone> = {
  COMPLETED: "success",
  DEAD: "danger",
  RUNNING: "info",
};

/** Trading readiness console — release gates + kill switch (platform admin). */
function TradingReadinessSection({ isPlatformAdmin }: { isPlatformAdmin: boolean }) {
  const qc = useQueryClient();
  const gates = useQuery({
    queryKey: ["trading-gates"],
    queryFn: () => api.get<TradingReadiness>("/api/v1/trading/gates"),
    refetchInterval: 15000,
  });
  const [decision, setDecision] = useState<{ key: string; title: string; state: string } | null>(null);
  const [notes, setNotes] = useState("");

  const decide = useMutation({
    mutationFn: (input: { key: string; state: string; decisionNotes: string }) =>
      api.patch("/api/v1/admin/trading-gates", input),
    onSuccess: () => {
      toast.success("Decision recorded and audit-logged");
      setDecision(null);
      setNotes("");
      qc.invalidateQueries({ queryKey: ["trading-gates"] });
      qc.invalidateQueries({ queryKey: ["capabilities"] });
    },
    onError: (e) => toast.apiError("Decision not recorded", e),
  });

  if (gates.isError) {
    const err = gates.error as { code?: string; message: string } & Error;
    if (err.code === "FORBIDDEN") return null; // moderators see admin ops, not release authority
    return <ErrorState title="Trading readiness unavailable" message={err.message} onRetry={() => gates.refetch()} />;
  }

  const r = gates.data;
  const openDecision = (key: string, title: string, state: string) => {
    setDecision({ key, title, state });
    setNotes("");
  };

  const decisionTitle = decision
    ? decision.state === "APPROVED"
      ? `Approve ${decision.title}`
      : decision.state === "REJECTED"
        ? `Reject ${decision.title}`
        : decision.state === "IN_REVIEW"
          ? `Move ${decision.title} into review`
          : decision.state === "ENGAGED"
            ? "Engage execution kill switch"
            : "Clear execution kill switch"
    : "";

  return (
    <SectionShell
      title="Trading readiness — release gates"
      glyph="risk"
      id="fs-gates"
      aside={
        r ? (
          <Badge tone={r.executionAllowed ? "success" : "warning"} dot aria-live="polite">
            {r.executionAllowed ? "EXECUTION PERMITTED" : "EXECUTION BLOCKED"}
          </Badge>
        ) : null
      }
    >
      <div
        className="rounded-lg border border-[var(--fs-border)] bg-surface-2 px-4 py-3 text-xs leading-relaxed text-ink-secondary"
        role="status"
      >
        {r && !r.executionAllowed ? (
          <>
            Execution stays disabled — {r.blockReason}. Order <span className="fs-data">intents</span> and real quote previews are
            allowed while gated; nothing is signed, submitted or executed.
          </>
        ) : (
          "All conditions met: every review gate APPROVED, kill switch CLEAR, TRADING_ENABLED=true. The execution pipeline (Jupiter Swap V2 /order → client wallet signing → /execute) is live and every call is audit-logged."
        )}
      </div>

      {gates.isLoading && <LoadingState rows={3} label="Release gates loading" />}

      {r && (
        <div className="grid gap-3 lg:grid-cols-2">
          {r.gates.map((g) => (
            <GateCard
              key={g.key}
              gate={g}
              canDecide={isPlatformAdmin}
              onDecide={(state) => openDecision(g.key, g.title, state)}
            />
          ))}
        </div>
      )}

      <Dialog open={decision !== null} onOpenChange={(open) => !open && setDecision(null)}>
        <DialogContent
          title={decisionTitle}
          description={`A decision note is mandatory — it is stored with the gate record and written to the append-only audit log together with your account id.${
            decision?.state === "ENGAGED" ? " Engaging blocks every execution attempt platform-wide, immediately." : ""
          }`}
          busy={decide.isPending}
        >
          <Field id="gate-notes" label="Decision notes" hint="Reference the review document, reviewer, date and scope.">
            {(props) => (
              <Textarea
                {...props}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-24"
              />
            )}
          </Field>
          <DialogFooter className="-mx-5 -mb-4 mt-4">
            <Button variant="ghost" size="sm" onClick={() => setDecision(null)} disabled={decide.isPending}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={notes.trim().length < 3}
              loading={decide.isPending}
              loadingLabel="Recording decision"
              disabledReason={notes.trim().length < 3 ? "A decision note of at least 3 characters is required" : undefined}
              onClick={() => decision && decide.mutate({ key: decision.key, state: decision.state, decisionNotes: notes.trim() })}
            >
              Record decision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionShell>
  );
}

function GateCard({
  gate,
  canDecide,
  onDecide,
}: {
  gate: GateView;
  canDecide: boolean;
  onDecide: (state: string) => void;
}) {
  const isKill = gate.key === KILL_SWITCH_KEY;
  const isReview = REVIEW_KEYS.includes(gate.key);
  const controlKey = isKill || isReview;

  return (
    <div className="rounded-lg border border-[var(--fs-border)] bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span
            aria-hidden="true"
            className={cn("mt-0.5 shrink-0", isKill && gate.state === "ENGAGED" ? "text-[var(--fs-danger-fg)]" : "text-ink-muted")}
          >
            <Glyph name={isKill ? "risk" : "attestation"} size={15} />
          </span>
          <div>
            <div className="text-sm font-medium text-ink">{gate.title}</div>
            <p className="mt-1 max-w-md text-2xs leading-relaxed text-ink-muted">{gate.description}</p>
          </div>
        </div>
        <Badge tone={GATE_TONE[gate.state] ?? "neutral"} dot className="shrink-0">
          {gate.state}
        </Badge>
      </div>

      {(gate.decisionNotes || gate.decidedAt) && (
        <div className="fs-data mt-3 rounded-md bg-surface-2 px-2.5 py-2 text-2xs text-ink-faint">
          {gate.decisionNotes ? <div>“{gate.decisionNotes}”</div> : null}
          {gate.decidedAt ? (
            <div className="mt-1">
              decided {new Date(gate.decidedAt).toLocaleString()}
              {gate.decidedBy ? ` · admin ${gate.decidedBy.slice(0, 8)}…` : ""}
            </div>
          ) : null}
        </div>
      )}

      {canDecide && controlKey && (
        <div className="mt-3 flex flex-wrap gap-2">
          {gate.state === "NOT_STARTED" && (
            <Button variant="outline" size="sm" onClick={() => onDecide("IN_REVIEW")}>
              Start review
            </Button>
          )}
          {gate.state === "IN_REVIEW" && (
            <>
              <Button size="sm" onClick={() => onDecide("APPROVED")} disabledReason="Records an approval decision">
                <Icon name="check" size={12} />
                Approve
              </Button>
              <Button variant="outline" size="sm" onClick={() => onDecide("REJECTED")}>
                <Icon name="close" size={12} />
                Reject
              </Button>
            </>
          )}
          {gate.state === "APPROVED" && (
            <Button variant="outline" size="sm" onClick={() => onDecide("REJECTED")}>
              Revoke (reject)
            </Button>
          )}
          {gate.state === "REJECTED" && (
            <Button variant="outline" size="sm" onClick={() => onDecide("IN_REVIEW")}>
              Re-open review
            </Button>
          )}
        </div>
      )}

      {canDecide && isKill && (
        <div className="mt-3">
          {gate.state === "CLEAR" ? (
            <Button variant="destructive" size="sm" onClick={() => onDecide("ENGAGED")}>
              <Icon name="close" size={12} />
              Engage kill switch
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => onDecide("CLEAR")}>
              <Icon name="check" size={12} />
              Re-clear (lift halt)
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

const STATS = [
  { key: "users", label: "Active users", glyph: "founder" },
  { key: "ventures", label: "Ventures", glyph: "venture" },
  { key: "evidence", label: "Evidence records", glyph: "evidence" },
  { key: "contradictedClaims", label: "Contradicted claims", glyph: "claim" },
  { key: "researchFailures", label: "Research failures", glyph: "research" },
] as const;

export function AdminView({ platformRole }: { platformRole: string }) {
  const overview = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => api.get<AdminOverview>("/api/v1/admin/overview"),
    refetchInterval: 8000,
    retry: 1,
  });

  if (overview.isError) {
    const err = overview.error as { code?: string; message: string } & Error;
    if (err.code === "FORBIDDEN") {
      return (
        <ForbiddenState
          message="Administration requires MODERATOR or PLATFORM_ADMIN platform role. Your account is not authorized."
          requiredRole="MODERATOR or PLATFORM_ADMIN"
        />
      );
    }
    return <ErrorState title="Admin unavailable" message={err.message} onRetry={() => overview.refetch()} />;
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header>
        <h1 className="fs-brand text-xl font-bold text-ink">Administration</h1>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">
          Ingestion health, queue state, audit trail and data quality. Administrative corrections never mutate original
          observations — they create new auditable records.
        </p>
      </header>

      {overview.isLoading && <LoadingState kind="table" rows={5} label="Admin overview loading" />}

      {overview.data && (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {STATS.map(({ key, label, glyph }) => (
              <li key={key} className="rounded-lg border border-[var(--fs-border)] bg-surface p-4">
                <div className="flex items-center gap-1.5 text-2xs text-ink-faint">
                  <Glyph name={glyph} size={11} />
                  {label}
                </div>
                <div className="fs-data fs-num mt-1 text-xl font-semibold text-ink">{overview.data.stats[key]}</div>
              </li>
            ))}
          </ul>

          <TradingReadinessSection isPlatformAdmin={platformRole === "PLATFORM_ADMIN"} />

          <SectionShell title="Queue & ingestion health" id="fs-queue">
            <div className="flex flex-wrap gap-2">
              {overview.data.queue.map((q) => (
                <Badge key={q.status} tone={JOB_TONE[q.status] ?? "neutral"} dot>
                  {q.status}: {q.count}
                </Badge>
              ))}
              {overview.data.queue.length === 0 && <Badge tone="neutral">QUEUE EMPTY</Badge>}
              <Badge tone="neutral">breaker github: {overview.data.breakers.github.state}</Badge>
              <Badge tone="neutral">breaker jupiter: {overview.data.breakers.jupiter.state}</Badge>
            </div>

            <Card>
              <TableScroll>
                <Table>
                  <TableHead>
                    <tr>
                      <TableHeaderCell>Kind</TableHeaderCell>
                      <TableHeaderCell>Status</TableHeaderCell>
                      <TableHeaderCell align="end">Attempts</TableHeaderCell>
                      <TableHeaderCell>Failure class</TableHeaderCell>
                      <TableHeaderCell>Last error</TableHeaderCell>
                      <TableHeaderCell align="end">Created</TableHeaderCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {overview.data.recentJobs.map((j) => (
                      <TableRow key={j.id}>
                        <TableCell mono>{j.kind}</TableCell>
                        <TableCell>
                          <Badge tone={JOB_TONE[j.status] ?? "neutral"} dot>
                            {j.status}
                          </Badge>
                        </TableCell>
                        <TableCell align="end" mono>
                          {j.attempts}
                        </TableCell>
                        <TableCell mono>{j.failureClass ?? "—"}</TableCell>
                        <TableCell className="max-w-64 truncate text-xs text-ink-muted" title={j.lastError ?? ""}>
                          {j.lastError ?? "—"}
                        </TableCell>
                        <TableCell align="end" mono className="text-ink-faint">
                          {timeAgo(j.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {overview.data.recentJobs.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-6 text-center text-xs text-ink-muted">
                          No jobs yet — collection runs when ventures are registered.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableScroll>
            </Card>
          </SectionShell>

          <SectionShell title="Dead-letter queue" glyph="risk" id="fs-dead-letters">
            {overview.data.deadLetters.length === 0 ? (
              <EmptyState compact glyph="risk" title="No dead jobs" description="Every queued job has finished or is still retryable." />
            ) : (
              <ul className="flex flex-col gap-2">
                {overview.data.deadLetters.map((j) => (
                  <li key={j.id} className="rounded-md border border-[var(--fs-danger-border)] bg-[var(--fs-danger-bg)] px-3.5 py-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Badge tone="danger" dot>
                        DEAD
                      </Badge>
                      <span className="fs-data font-medium text-ink">{j.kind}</span>
                      <span className="fs-data text-2xs text-ink-faint">
                        {j.failureClass} · {j.attempts} attempts
                        {j.finishedAt ? ` · ${timeAgo(j.finishedAt)}` : ""}
                      </span>
                    </div>
                    <p className="mt-1.5 text-2xs leading-relaxed text-ink-muted">{j.lastError}</p>
                  </li>
                ))}
              </ul>
            )}
          </SectionShell>

          <SectionShell title="Audit log (append-only)" glyph="attestation" id="fs-audit">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Recent administrative events</CardTitle>
              </CardHeader>
              <CardContent>
                {overview.data.auditLog.length === 0 ? (
                  <p className="py-4 text-center text-xs text-ink-muted">No audit events yet.</p>
                ) : (
                  <ul className="fs-scroll max-h-80 divide-y divide-[var(--fs-border)] overflow-y-auto" aria-label="Audit log">
                    {overview.data.auditLog.map((a) => (
                      <li key={a.id} className="flex items-baseline gap-3 py-2 text-xs">
                        <span className="fs-data shrink-0 text-[var(--fs-accent-2)]">{a.action}</span>
                        <span className="min-w-0 text-ink-secondary">{a.summary}</span>
                        <span className="fs-data ml-auto shrink-0 text-2xs text-ink-faint">
                          {a.actor} · {new Date(a.createdAt).toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </SectionShell>
        </>
      )}
    </div>
  );
}
