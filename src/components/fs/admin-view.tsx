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
  Input,
  LoadingState,
  SectionShell,
  Select,
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
import { api, type AccountState } from "@/lib/client/api";
interface AdminOverview {
  queue: Array<{ status: string; count: number }>;
  deadLetters: Array<{ id: string; kind: string; lastError: string | null; attempts: number; failureClass: string | null; finishedAt: string | null }>;
  recentJobs: Array<{ id: string; kind: string; status: string; attempts: number; failureClass: string | null; lastError: string | null; createdAt: string; finishedAt: string | null }>;
  auditLog: Array<{ id: string; action: string; summary: string; actor: string; createdAt: string }>;
  stats: { users: number; ventures: number; evidence: number; contradictedClaims: number; researchFailures: number };
  breakers: { github: { state: string; failures: number }; jupiter: { state: string; failures: number } };
  integrations: {
    githubToken: { configured: boolean; requiredEnv: string[]; note: string };
    billing: {
      provider: string;
      configured: boolean;
      checkoutReady: boolean;
      webhookReady: boolean;
      missingEnv: string[];
      configuredPlans: string[];
      unconfiguredPlans: string[];
    };
    tradingExecutionEnv: { configured: boolean; note: string };
    email: { available: boolean; level: string; requiredEnv: string[]; from: string | null };
  };
}

interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  platformRole: string;
  userType: string;
  emailVerified: boolean;
  createdAt: string;
  workspaces: Array<{ id: string; name: string; role: string }>;
}

interface PendingInvitation {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
}

interface DisputeRow {
  id: string;
  kind: string;
  statement: string;
  resolution: string;
  createdAt: string;
  claimId: string | null;
  claimStatement: string | null;
  claimCategory: string | null;
  ventureName: string | null;
  ventureSlug: string | null;
}

const PLATFORM_ROLE_OPTIONS = [
  { value: "USER", label: "USER" },
  { value: "MODERATOR", label: "MODERATOR" },
  { value: "PLATFORM_ADMIN", label: "PLATFORM_ADMIN" },
];

const INVITE_ROLE_OPTIONS_OWNER = [
  { value: "ADMIN", label: "ADMIN" },
  { value: "ANALYST", label: "ANALYST" },
  { value: "VIEWER", label: "VIEWER" },
  { value: "OWNER", label: "OWNER" },
];

const INVITE_ROLE_OPTIONS_ADMIN = [
  { value: "ANALYST", label: "ANALYST" },
  { value: "VIEWER", label: "VIEWER" },
];

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

/** Integrations — redacted configuration status only, never secret values. */
function IntegrationsSection({ integrations }: { integrations: AdminOverview["integrations"] }) {
  const rows = [
    {
      key: "githubToken",
      title: "GitHub collection token",
      configured: integrations.githubToken.configured,
      detail: integrations.githubToken.note,
      missing: integrations.githubToken.requiredEnv,
    },
    {
      key: "billing",
      title: `Billing (${integrations.billing.provider})`,
      configured: integrations.billing.configured,
      detail: integrations.billing.configured
        ? `checkout ${integrations.billing.checkoutReady ? "ready" : "not ready"} · webhook ${integrations.billing.webhookReady ? "ready" : "missing"} · plans configured: ${integrations.billing.configuredPlans.join(", ") || "none"}${integrations.billing.unconfiguredPlans.length ? ` · unconfigured: ${integrations.billing.unconfiguredPlans.join(", ")}` : ""}`
        : `not configured — missing env: ${integrations.billing.missingEnv.join(", ") || "unknown"}`,
      missing: integrations.billing.missingEnv,
    },
    {
      key: "tradingExecutionEnv",
      title: "Trading execution env",
      configured: integrations.tradingExecutionEnv.configured,
      detail: integrations.tradingExecutionEnv.note,
      missing: integrations.tradingExecutionEnv.configured ? [] : ["TRADING_ENABLED=true"],
    },
    {
      key: "email",
      title: "Transactional email (Resend)",
      configured: integrations.email.available,
      detail: integrations.email.available
        ? `configured via Resend (${integrations.email.level})`
        : `delivery disabled — emails (verification, reset, invitations) will not be sent until RESEND_API_KEY is set${integrations.email.requiredEnv.length ? `; requires: ${integrations.email.requiredEnv.join(", ")}` : ""}`,
      missing: integrations.email.requiredEnv,
    },
  ];

  return (
    <SectionShell title="Integrations" glyph="attestation" id="fs-integrations">
      <ul className="grid gap-3 lg:grid-cols-2">
        {rows.map((row) => (
          <li key={row.key} className="rounded-lg border border-[var(--fs-border)] bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-ink">{row.title}</div>
                <p className="mt-1.5 text-2xs leading-relaxed text-ink-muted">{row.detail}</p>
                {row.missing.length > 0 && (
                  <p className="fs-data mt-2 text-2xs text-ink-faint">requires env: {row.missing.join(", ")}</p>
                )}
              </div>
              <Badge tone={row.configured ? "success" : "warning"} dot className="shrink-0">
                {row.configured ? "configured" : "not configured"}
              </Badge>
            </div>
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}

/** Platform users — list + PLATFORM_ADMIN role assignment. Last PLATFORM_ADMIN
 * cannot be demoted (enforced server-side). */
function PlatformUsersSection({ platformRole }: { platformRole: string }) {
  const qc = useQueryClient();
  const isPlatformAdmin = platformRole === "PLATFORM_ADMIN";
  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api.get<AdminUserRow[]>("/api/v1/admin/users"),
    retry: 1,
  });

  const changeRole = useMutation({
    mutationFn: (input: { id: string; platformRole: string }) =>
      api.patch(`/api/v1/admin/users/${input.id}/role`, { platformRole: input.platformRole }),
    onSuccess: () => {
      toast.success("Platform role updated and audit-logged");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e) => toast.apiError("Role not changed", e),
  });

  return (
    <SectionShell
      title="Platform users & roles"
      glyph="founder"
      id="fs-users"
      aside={
        <span className="fs-data text-2xs text-ink-faint">
          {isPlatformAdmin ? "PLATFORM_ADMIN can assign roles" : "read-only — PLATFORM_ADMIN required to change roles"}
        </span>
      }
    >
      {users.isLoading && <LoadingState rows={3} label="Users loading" />}
      {users.isError && (
        <ErrorState
          title="Users unavailable"
          message={users.error instanceof Error ? users.error.message : "Could not load users."}
          onRetry={() => users.refetch()}
        />
      )}
      {users.data && (
        <Card>
          <TableScroll>
            <Table>
              <TableHead>
                <tr>
                  <TableHeaderCell>User</TableHeaderCell>
                  <TableHeaderCell>Workspaces</TableHeaderCell>
                  <TableHeaderCell>Joined</TableHeaderCell>
                  <TableHeaderCell align="end">Platform role</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {users.data.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium text-ink">{u.email}</div>
                        <div className="mt-0.5 flex items-center gap-2 text-2xs text-ink-faint">
                          <span>{u.name ?? "—"}</span>
                          {u.emailVerified ? (
                            <span className="inline-flex items-center gap-1 text-[var(--fs-success-fg)]">
                              <Icon name="check" size={10} /> verified
                            </span>
                          ) : (
                            <span className="text-[var(--fs-warning-fg)]">unverified</span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex max-w-48 flex-wrap gap-1">
                        {u.workspaces.slice(0, 3).map((w) => (
                          <Badge key={w.id} tone="neutral" size="sm" title={`${w.name} · ${w.role}`}>
                            {w.role}
                          </Badge>
                        ))}
                        {u.workspaces.length === 0 && <span className="text-2xs text-ink-faint">—</span>}
                      </div>
                    </TableCell>
                    <TableCell mono className="text-ink-faint">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell align="end">
                      <Select
                        size="sm"
                        mono
                        aria-label={`Platform role for ${u.email}`}
                        options={PLATFORM_ROLE_OPTIONS}
                        value={u.platformRole}
                        disabled={!isPlatformAdmin || changeRole.isPending}
                        onValueChange={(value) => {
                          if (value !== u.platformRole) changeRole.mutate({ id: u.id, platformRole: value });
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {users.data.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center text-xs text-ink-muted">
                      No active users.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableScroll>
        </Card>
      )}
    </SectionShell>
  );
}

/** Pending workspace invitations — create (OWNER/ADMIN) and revoke. Operates
 * on the caller's active workspace. */
function InvitationsSection() {
  const qc = useQueryClient();
  const account = useQuery({ queryKey: ["account"], queryFn: () => api.get<AccountState>("/api/v1/account") });
  const workspaceId = account.data?.activeWorkspaceId ?? null;
  const myRole = account.data?.workspaceRole ?? null;
  const canManage = myRole === "OWNER" || myRole === "ADMIN";
  const inviteOptions = myRole === "OWNER" ? INVITE_ROLE_OPTIONS_OWNER : INVITE_ROLE_OPTIONS_ADMIN;

  const invites = useQuery({
    queryKey: ["invitations", workspaceId],
    queryFn: () => api.get<{ invitations: PendingInvitation[] }>(`/api/v1/invitations?workspace=${workspaceId}`),
    enabled: !!workspaceId && canManage,
  });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState("ANALYST");
  const [devLink, setDevLink] = useState<string | null>(null);

  const createInvite = useMutation({
    mutationFn: () =>
      api.post<{ invitationId: string; acceptUrl: string; delivered: boolean; devLink: boolean }>(
        `/api/v1/workspaces/${workspaceId}/invitations`,
        { email: email.trim(), role },
      ),
    onSuccess: (data) => {
      if (data.delivered) {
        toast.success("Invitation email sent");
        setDevLink(null);
      } else if (data.devLink) {
        toast.success("Invitation created — email not configured; dev link shown below");
        setDevLink(data.acceptUrl);
      } else {
        toast.error("Invitation created, but the provider rejected the email — check the server logs.");
        setDevLink(null);
      }
      setEmail("");
      qc.invalidateQueries({ queryKey: ["invitations", workspaceId] });
    },
    onError: (e) => toast.apiError("Invitation not created", e),
  });

  const revokeInvite = useMutation({
    mutationFn: (id: string) => api.del(`/api/v1/invitations/${id}`),
    onSuccess: () => {
      toast.success("Invitation revoked");
      qc.invalidateQueries({ queryKey: ["invitations", workspaceId] });
    },
    onError: (e) => toast.apiError("Invitation not revoked", e),
  });

  if (!canManage) return null; // server enforces the same rule

  return (
    <SectionShell
      title="Pending invitations"
      glyph="attestation"
      id="fs-invitations"
      aside={<span className="fs-data text-2xs text-ink-faint">active workspace · OWNER/ADMIN manage</span>}
    >
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) createInvite.mutate();
        }}
      >
        <Field id="fs-invite-email" label="Invite by email" className="min-w-56 flex-1">
          {(props) => (
            <Input
              {...props}
              type="email"
              required
              placeholder="teammate@fund.example"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>
        <Field id="fs-invite-role" label="Role">
          {(props) => (
            <Select {...props} options={inviteOptions} value={role} onValueChange={setRole} />
          )}
        </Field>
        <Button type="submit" size="sm" disabled={!email.trim()} loading={createInvite.isPending} loadingLabel="Inviting">
          <Icon name="plus" size={13} />
          Send invite
        </Button>
      </form>

      {devLink && (
        <div className="mt-3 rounded-md border border-[var(--fs-warning-border)] bg-[var(--fs-warning-bg)] p-3">
          <div className="fs-data text-2xs font-semibold text-[var(--fs-warning-fg)]">
            Email delivery not configured — dev accept link (expires in 7 days):
          </div>
          <code className="fs-data mt-1.5 block break-all text-2xs text-ink">{devLink}</code>
        </div>
      )}

      {invites.isLoading && <LoadingState rows={2} label="Invitations loading" />}
      {invites.isError && (
        <ErrorState
          title="Invitations unavailable"
          message={invites.error instanceof Error ? invites.error.message : "Could not load invitations."}
          onRetry={() => invites.refetch()}
        />
      )}
      {invites.data && invites.data.invitations.length === 0 && (
        <p className="mt-3 text-2xs text-ink-faint">No pending invitations. New invites appear here until accepted or revoked.</p>
      )}
      {invites.data && invites.data.invitations.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {invites.data.invitations.map((inv) => (
            <li
              key={inv.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--fs-border)] bg-surface-2 px-3 py-2"
            >
              <div className="min-w-0">
                <span className="fs-data text-xs text-ink">{inv.email}</span>
                <span className="fs-data ml-2 text-2xs text-ink-faint">
                  {inv.role} · expires {new Date(inv.expiresAt).toLocaleString()}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={revokeInvite.isPending}
                onClick={() => revokeInvite.mutate(inv.id)}
              >
                <Icon name="close" size={12} />
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
    </SectionShell>
  );
}

/** Open disputes/corrections raised against claims — MODERATOR or
 * PLATFORM_ADMIN can mark them resolved. */
function DisputesSection() {
  const qc = useQueryClient();
  const disputes = useQuery({
    queryKey: ["admin-disputes", "open"],
    queryFn: () => api.get<DisputeRow[]>("/api/v1/admin/disputes?resolution=OPEN"),
    retry: 1,
  });

  const resolve = useMutation({
    mutationFn: (input: { id: string; resolution: string; note: string }) =>
      api.patch(`/api/v1/admin/disputes/${input.id}`, {
        resolution: input.resolution,
        resolutionNote: input.note || undefined,
      }),
    onSuccess: () => {
      toast.success("Dispute resolved and audit-logged");
      qc.invalidateQueries({ queryKey: ["admin-disputes", "open"] });
    },
    onError: (e) => toast.apiError("Dispute not resolved", e),
  });

  return (
    <SectionShell title="Open disputes & corrections" glyph="risk" id="fs-disputes">
      {disputes.isLoading && <LoadingState rows={2} label="Disputes loading" />}
      {disputes.isError && (
        <ErrorState
          title="Disputes unavailable"
          message={disputes.error instanceof Error ? disputes.error.message : "Could not load disputes."}
          onRetry={() => disputes.refetch()}
        />
      )}
      {disputes.data && disputes.data.length === 0 && (
        <EmptyState compact glyph="evidence" title="No open disputes" description="Claims disputes raised by analysts appear here until resolved." />
      )}
      {disputes.data && disputes.data.length > 0 && (
        <ul className="flex flex-col gap-2">
          {disputes.data.map((d) => (
            <DisputeItem key={d.id} dispute={d} busy={resolve.isPending} onResolve={(resolution, note) => resolve.mutate({ id: d.id, resolution, note })} />
          ))}
        </ul>
      )}
    </SectionShell>
  );
}

const RESOLUTION_OPTIONS = [
  { value: "RESOLVED", label: "RESOLVED" },
  { value: "UPHELD", label: "UPHELD" },
  { value: "REJECTED", label: "REJECTED" },
];

function DisputeItem({
  dispute,
  busy,
  onResolve,
}: {
  dispute: DisputeRow;
  busy: boolean;
  onResolve: (resolution: string, note: string) => void;
}) {
  const [resolution, setResolution] = useState("RESOLVED");
  const [note, setNote] = useState("");

  return (
    <li className="rounded-lg border border-[var(--fs-border)] bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2 text-2xs">
        <Badge tone="info" dot>
          {dispute.kind}
        </Badge>
        {dispute.ventureName && <span className="fs-data text-ink-secondary">{dispute.ventureName}</span>}
        {dispute.claimCategory && <span className="fs-data text-ink-faint">claim · {dispute.claimCategory}</span>}
        <span className="fs-data ml-auto text-ink-faint">{timeAgo(dispute.createdAt)}</span>
      </div>
      {dispute.claimStatement && (
        <p className="mt-2 text-2xs leading-relaxed text-ink-faint">
          <span className="fs-data">claim:</span> {dispute.claimStatement}
        </p>
      )}
      <p className="mt-1.5 text-xs leading-relaxed text-ink">{dispute.statement}</p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Field id={`fs-dispute-note-${dispute.id}`} label="Resolution note">
          {(props) => (
            <Input
              {...props}
              placeholder="What was decided, and why"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          )}
        </Field>
        <Select
          size="sm"
          mono
          aria-label="Resolution"
          options={RESOLUTION_OPTIONS}
          value={resolution}
          onValueChange={setResolution}
        />
        <Button size="sm" variant="outline" disabled={busy} onClick={() => onResolve(resolution, note.trim())}>
          <Icon name="check" size={12} />
          Apply
        </Button>
      </div>
    </li>
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

          <IntegrationsSection integrations={overview.data.integrations} />

          <PlatformUsersSection platformRole={platformRole} />

          <InvitationsSection />

          <DisputesSection />

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
