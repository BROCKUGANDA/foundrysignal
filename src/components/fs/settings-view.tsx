"use client";

// Settings — account, workspace, capability registry (honest env-gated
// states), provider health, appearance, account deletion.

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
  ErrorState,
  Field,
  Icon,
  Input,
  LoadingState,
  MotionToggle,
  SectionShell,
  Select,
  ThemeMenuItems,
  cn,
  toast,
  type BadgeTone,
} from "@/components/fs";
import { api, type AccountState, type Capabilities, type SessionList } from "@/lib/client/api";
import { USER_TYPES, USER_TYPE_LABELS } from "@/lib/contracts/api";
import { useApp } from "@/lib/client/store";

interface CapEntry {
  available: boolean;
  level: string;
  requiredEnv: string[];
  reason?: string;
}

interface ProviderRow {
  name: string;
  health: string;
  configured: boolean;
  note: string;
  rateLimit: { limit: number | null; remaining: number | null; resetAt: string | null };
}

interface CheckoutPlan {
  code: string;
  name: string;
  monthlyPriceMicros: number;
  currency: string;
}

interface BillingStatus {
  provider: string;
  configured: boolean;
  checkoutReady: boolean;
  mint: string;
  destination: string | null;
  missingEnv: string[];
  plans: CheckoutPlan[];
  note: string;
  subscription: {
    status: string;
    provider: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string | null;
    plan: { code: string; name: string } | null;
  } | null;
}

interface PaymentIntent {
  memo: string;
  destination: string;
  mint: string;
  amountBaseUnits: number;
  amountDisplay: string;
  planCode: string;
  expiresAt: string;
  status: string;
}

interface VerificationResult {
  status: string;
  memo: string;
  planCode: string | null;
  signature: string | null;
  confirmedAt: string | null;
  expiresAt: string;
  note: string;
}

const PROVIDER_TONE: Record<string, BadgeTone> = {
  HEALTHY: "success",
  RATE_LIMITED: "warning",
  DEGRADED: "warning",
};

const PERSONA_OPTIONS = USER_TYPES.map((value) => ({ value, label: USER_TYPE_LABELS[value] }));

function capabilityStateLabel(entry: CapEntry): string {
  return `${entry.level}${entry.available ? "" : " — unavailable"}`;
}

function CapRow({ capKey, entry }: { capKey: string; entry: CapEntry }) {
  return (
    <li className="flex items-start justify-between gap-3 border-b border-[var(--fs-border)] py-2 last:border-b-0">
      <div className="min-w-0">
        <div className="fs-data text-xs font-medium text-ink">{capKey}</div>
        {entry.reason ? <p className="text-2xs leading-relaxed text-ink-muted">{entry.reason}</p> : null}
        {!entry.available && entry.requiredEnv.length > 0 ? (
          <p className="fs-data text-2xs text-ink-faint">requires env: {entry.requiredEnv.join(", ")}</p>
        ) : null}
      </div>
      <Badge tone={entry.available ? "success" : "warning"} dot>
        <Icon name={entry.available ? "check" : "close"} size={10} />
        {capabilityStateLabel(entry)}
      </Badge>
    </li>
  );
}

/**
 * Billing — USDC checkout on Solana. Real chain settlement: a payment intent
 * carries the destination wallet, exact amount and memo; entitlement is granted
 * only after a matching transfer is read from the chain. Without a payout
 * wallet configured, the exact missing env var is shown instead of a fake buy
 * button.
 */
function BillingSection() {
  const billing = useQuery({ queryKey: ["billing", "status"], queryFn: () => api.get<BillingStatus>("/api/v1/billing/status") });
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [verification, setVerification] = useState<VerificationResult | null>(null);

  const startCheckout = useMutation({
    mutationFn: (planCode: string) => api.post<PaymentIntent & { provider: string }>("/api/v1/billing/checkout", { planCode }),
    onSuccess: (data) => {
      setIntent(data);
      setVerification(null);
    },
    onError: (e) => toast.apiError("Checkout not started", e),
  });

  const verify = useMutation({
    mutationFn: (memo: string) => api.post<VerificationResult>("/api/v1/billing/verify", { memo }),
    onSuccess: (data) => setVerification(data),
    onError: (e) => toast.apiError("Verification failed", e),
  });

  // Poll the chain while an intent is still pending. Stops on confirm/expire.
  React.useEffect(() => {
    if (!intent || intent.status !== "PENDING") return;
    if (verification?.status === "CONFIRMED" || verification?.status === "EXPIRED") return;
    const id = window.setInterval(() => verify.mutate(intent.memo), 6000);
    return () => window.clearInterval(id);
  }, [intent, verification?.status, verify]);

  const copy = (label: string, value: string) => {
    void navigator.clipboard?.writeText(value).then(
      () => toast.success(`${label} copied`),
      () => toast.error("Copy failed — select and copy manually."),
    );
  };

  const priceDisplay = (micros: number) => `$${(micros / 1_000_000).toFixed(2)}`;

  return (
    <SectionShell title="Billing" glyph="market" id="fs-billing">
      {billing.isLoading && <LoadingState rows={2} label="Billing loading" />}
      {billing.isError && (
        <ErrorState title="Billing unavailable" message={(billing.error as Error).message} onRetry={() => billing.refetch()} />
      )}
      {billing.data && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={billing.data.configured ? "success" : "warning"} dot>
              <Icon name={billing.data.configured ? "check" : "close"} size={10} />
              {billing.data.provider.toUpperCase()} {billing.data.configured ? "configured" : "not configured"}
            </Badge>
            {billing.data.subscription && (
              <Badge tone="info" dot>
                {billing.data.subscription.plan?.name ?? "plan"} · {billing.data.subscription.status}
                {billing.data.subscription.cancelAtPeriodEnd ? " · cancels at period end" : ""}
              </Badge>
            )}
          </div>

          {!billing.data.configured && (
            <div className="rounded-lg border border-dashed border-[var(--fs-border-strong)] bg-surface-2 p-3">
              <div className="fs-data text-2xs font-semibold text-[var(--fs-warning-fg)]">
                Configuration required — checkout is unavailable
              </div>
              <p className="mt-1.5 text-2xs leading-relaxed text-ink-muted">{billing.data.note}</p>
              <ul className="fs-data mt-2 flex flex-col gap-1 text-2xs text-ink-faint">
                {billing.data.missingEnv.map((env) => (
                  <li key={env}>· {env}</li>
                ))}
              </ul>
            </div>
          )}

          {billing.data.configured && !intent && (
            <div className="flex flex-col gap-2">
              {billing.data.plans.map((plan) => (
                <div key={plan.code} className="flex items-center justify-between gap-3 rounded-md border border-[var(--fs-border)] bg-surface-2 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink">{plan.name}</div>
                    <div className="fs-data text-2xs text-ink-faint">
                      {priceDisplay(plan.monthlyPriceMicros)} {plan.currency} / month
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => startCheckout.mutate(plan.code)}
                    loading={startCheckout.isPending && startCheckout.variables === plan.code}
                    loadingLabel="Preparing"
                  >
                    Pay with USDC
                  </Button>
                </div>
              ))}
            </div>
          )}

          {billing.data.configured && intent && (
            <div className="rounded-lg border border-[var(--fs-border-strong)] bg-surface-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="fs-label">Send exactly</div>
                  <div className="fs-data mt-0.5 text-lg font-semibold text-ink">
                    {intent.amountDisplay} USDC
                  </div>
                  <div className="fs-data mt-0.5 text-2xs text-ink-faint">Solana · {intent.planCode.toLowerCase()}</div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setIntent(null); setVerification(null); }}>
                  Start over
                </Button>
              </div>

              <dl className="mt-4 flex flex-col gap-3">
                <div>
                  <dt className="fs-data text-2xs text-ink-faint">Destination wallet</dt>
                  <dd className="mt-1 flex items-center gap-2">
                    <code className="fs-data min-w-0 flex-1 truncate rounded border border-[var(--fs-border)] bg-bg px-2 py-1.5 text-2xs text-ink">
                      {intent.destination}
                    </code>
                    <Button variant="outline" size="sm" onClick={() => copy("Destination", intent.destination)}>
                      Copy
                    </Button>
                  </dd>
                </div>
                <div>
                  <dt className="fs-data text-2xs text-ink-faint">Memo (required — binds this payment)</dt>
                  <dd className="mt-1 flex items-center gap-2">
                    <code className="fs-data min-w-0 flex-1 truncate rounded border border-[var(--fs-border)] bg-bg px-2 py-1.5 text-2xs text-ink">
                      {intent.memo}
                    </code>
                    <Button variant="outline" size="sm" onClick={() => copy("Memo", intent.memo)}>
                      Copy
                    </Button>
                  </dd>
                </div>
              </dl>

              {verification?.status === "CONFIRMED" ? (
                <div className="mt-4 rounded-md border border-[var(--fs-success-border)] bg-[var(--fs-success-bg)] px-3 py-2">
                  <p className="text-2xs font-medium text-[var(--fs-success-fg)]">
                    Payment confirmed onchain — subscription active.
                  </p>
                  {verification.signature ? (
                    <p className="fs-data mt-1 break-all text-2xs text-ink-faint">{verification.signature}</p>
                  ) : null}
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => verify.mutate(intent.memo)}
                    loading={verify.isPending}
                    loadingLabel="Checking chain"
                  >
                    Verify payment
                  </Button>
                  {verification ? (
                    <span className="text-2xs text-ink-muted">
                      {verification.status === "EXPIRED" ? "Payment window elapsed." : verification.note}
                    </span>
                  ) : (
                    <span className="text-2xs text-ink-muted">
                      Send the transfer with the memo, then verify. It re-checks every few seconds.
                    </span>
                  )}
                </div>
              )}

              <p className="fs-data mt-3 text-2xs text-ink-faint">
                Usdc mint {intent.mint.slice(0, 8)}… · expires {new Date(intent.expiresAt).toLocaleTimeString()}
              </p>
            </div>
          )}

          <p className="text-2xs leading-relaxed text-ink-faint">
            Entitlements change only when a matching onchain transfer is verified — never from client input. Paid research
            services additionally require the legal review gates before commercial activation.
          </p>
        </div>
      )}
    </SectionShell>
  );
}

function SessionsSection() {
  const qc = useQueryClient();
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => api.get<SessionList>("/api/v1/account/sessions") });

  const revokeOne = useMutation({
    mutationFn: (id: string) => api.del(`/api/v1/account/sessions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      toast.success("Session revoked");
    },
    onError: (e) => toast.apiError("Session not revoked", e),
  });

  const revokeOthers = useMutation({
    mutationFn: () => api.del("/api/v1/account/sessions"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      toast.success("Other sessions revoked. This device stays signed in.");
    },
    onError: (e) => toast.apiError("Sessions not revoked", e),
  });

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

  const otherCount = sessions.data ? sessions.data.sessions.filter((x) => !x.current).length : 0;

  return (
    <SectionShell title="Sessions" glyph="token" id="fs-sessions">
      <Card>
        <CardContent className="flex flex-col gap-3">
          <p className="text-xs leading-relaxed text-ink-muted">
            Active sessions on this account. Revoking a session signs it out everywhere it is
            used. This session is marked and is kept when you revoke others.
          </p>
          {sessions.isLoading && <LoadingState rows={2} label="Sessions loading" />}
          {sessions.isError && (
            <ErrorState
              title="Sessions unavailable"
              message={(sessions.error as Error).message}
              onRetry={() => sessions.refetch()}
            />
          )}
          {sessions.data && (
            <>
              <ul className="flex flex-col divide-y divide-[var(--fs-border)]">
                {sessions.data.sessions.map((s) => (
                  <li key={s.id} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-ink">
                        {s.current ? "This device (current session)" : "Other session"}
                      </p>
                      <p className="mt-0.5 text-2xs leading-relaxed text-ink-muted">
                        Created {fmt(s.createdAt)} · Last seen {fmt(s.lastSeenAt)} · Expires {fmt(s.expiresAt)}
                      </p>
                    </div>
                    {s.current ? (
                      <Badge tone="success" dot>Current</Badge>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => revokeOne.mutate(s.id)} loading={revokeOne.isPending}>
                        Revoke
                      </Button>
                    )}
                  </li>
                ))}
                {sessions.data.sessions.length === 0 && (
                  <li className="py-3 text-2xs text-ink-muted">No active sessions.</li>
                )}
              </ul>
              {otherCount > 0 && (
                <div>
                  <Button variant="secondary" size="sm" onClick={() => revokeOthers.mutate()} loading={revokeOthers.isPending}>
                    <Icon name="close" size={13} />
                    Revoke {otherCount} other session{otherCount === 1 ? "" : "s"}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </SectionShell>
  );
}

export function SettingsView({
  account,
  onAccountRefresh,
}: {
  account: AccountState;
  onAccountRefresh: (a: AccountState) => void;
}) {
  const navigate = useApp((s) => s.navigate);
  const qc = useQueryClient();
  // Platform configuration surfaces (billing, capability registry, provider
  // health) are administrator-only. Ordinary accounts never see env-var names,
  // queue depth or provider internals — and no surface can promote them.
  const isPlatformAdmin = account.platformRole === "PLATFORM_ADMIN" || account.platformRole === "MODERATOR";

  const caps = useQuery({ queryKey: ["capabilities"], queryFn: () => api.get<Capabilities>("/api/v1/capabilities"), enabled: isPlatformAdmin });
  const providers = useQuery({ queryKey: ["providers"], queryFn: () => api.get<{ providers: ProviderRow[] }>("/api/v1/providers"), enabled: isPlatformAdmin });
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [name, setName] = useState(account.name ?? "");
  const [userType, setUserType] = useState<string>(account.userType ?? "VENTURE_INVESTOR");
  const profileDirty =
    name !== (account.name ?? "") || userType !== (account.userType ?? "VENTURE_INVESTOR");

  const saveProfile = useMutation({
    mutationFn: () => api.patch<AccountState>("/api/v1/account", { name: name || undefined, userType }),
    onSuccess: (data) => {
      onAccountRefresh(data);
      toast.success("Profile updated");
    },
    onError: (e) => toast.apiError("Profile not updated", e),
  });

  const deleteAccount = useMutation({
    mutationFn: () => api.del("/api/v1/account"),
    onSuccess: () => {
      toast.success("Account deleted. Sessions revoked.");
      qc.clear();
      navigate("home");
    },
    onError: (e) => toast.apiError("Account not deleted", e),
  });

  const capEntries: Array<[string, CapEntry]> = caps.data
    ? [
        ["githubCollection", caps.data.githubCollection],
        ["solanaOnchain", caps.data.solanaOnchain],
        ["marketData", caps.data.marketData],
        ["tradingExecution", caps.data.tradingExecution],
        ["billing", caps.data.billing],
        ["email", caps.data.email],
        ["aiResearch", caps.data.aiResearch],
        ["heliusIndexed", caps.data.heliusIndexed],
        ["oauth", caps.data.oauth],
        ["mfa", caps.data.mfa],
      ]
    : [];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header>
        <h1 className="fs-brand text-xl font-bold text-ink">Settings</h1>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">
          Account, workspace, appearance, and the honest capability registry for this deployment.
        </p>
      </header>

      <SectionShell title="Account" id="fs-account">
        <Card>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {[
              { label: "Email", value: account.email, mono: false },
              { label: "Account type", value: USER_TYPE_LABELS[account.userType as keyof typeof USER_TYPE_LABELS] ?? account.userType, mono: false },
              { label: "Platform role", value: account.platformRole, mono: true },
              { label: "Workspace role", value: account.workspaceRole, mono: true },
            ].map((row) => (
              <div key={row.label}>
                <div className="fs-data text-2xs text-ink-faint">{row.label}</div>
                <div className={cn("text-sm text-ink", row.mono && "fs-data")}>{row.value}</div>
              </div>
            ))}
            <div>
              <div className="fs-data text-2xs text-ink-faint">Email verification</div>
              <div className="mt-0.5">
                {account.emailVerified ? (
                  <Badge tone="success" dot>
                    verified
                  </Badge>
                ) : (
                  <Badge tone="warning" dot>
                    unverified
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-3">
          <CardHeader>
            <CardTitle className="text-sm">Profile</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Field id="fs-settings-name" label="Display name">
              {(props) => (
                <Input {...props} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
              )}
            </Field>
            <Field
              id="fs-settings-user-type"
              label="Account type"
              hint="Registration persona — tailors onboarding; it does not change your platform or workspace role."
            >
              {(props) => (
                <Select {...props} options={PERSONA_OPTIONS} value={userType} onValueChange={setUserType} />
              )}
            </Field>
            <div>
              <Button
                size="sm"
                disabled={!profileDirty}
                loading={saveProfile.isPending}
                loadingLabel="Saving"
                onClick={() => saveProfile.mutate()}
              >
                Save profile
              </Button>
            </div>
          </CardContent>
        </Card>
      </SectionShell>

      {isPlatformAdmin ? <BillingSection /> : null}

      <SessionsSection />

      <SectionShell title="Appearance & motion" id="fs-appearance">
        <Card>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <ThemeMenuItems />
            <MotionToggle />
          </CardContent>
        </Card>
      </SectionShell>

      {isPlatformAdmin ? (
        <SectionShell title="Capability registry" glyph="attestation" id="fs-capabilities">
        <p className="-mt-1 text-xs text-ink-muted">Configuration-gated features, stated with their exact environment requirements.</p>
        {caps.isLoading && <LoadingState rows={4} label="Capabilities loading" />}
        {caps.isError && <ErrorState title="Capabilities unavailable" message={(caps.error as Error).message} onRetry={() => caps.refetch()} />}
        {caps.data && (
          <Card>
            <CardContent>
              <ul className="flex flex-col">
                {capEntries.map(([key, entry]) => (
                  <CapRow key={key} capKey={key} entry={entry} />
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </SectionShell>
      ) : null}

      {isPlatformAdmin ? (
        <SectionShell title="Provider health" glyph="development" id="fs-providers">
        {providers.isLoading && <LoadingState rows={3} label="Providers loading" />}
        {providers.isError && (
          <ErrorState title="Provider health unavailable" message={(providers.error as Error).message} onRetry={() => providers.refetch()} />
        )}
        {providers.data && (
          <ul className="flex flex-col gap-2.5">
            {providers.data.providers.map((p) => (
              <li key={p.name} className="flex items-start justify-between gap-3 rounded-md border border-[var(--fs-border)] bg-surface-2 p-3">
                <div className="min-w-0">
                  <div className="fs-data text-xs font-semibold text-ink">{p.name}</div>
                  <p className="mt-1 text-2xs leading-relaxed text-ink-muted">{p.note}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge tone={PROVIDER_TONE[p.health] ?? "neutral"} dot>
                    {p.health}
                  </Badge>
                  {p.rateLimit.remaining !== null && (
                    <span className="fs-data text-2xs text-ink-faint">
                      {p.rateLimit.remaining}/{p.rateLimit.limit ?? "?"} req remaining
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionShell>
      ) : null}

      <SectionShell title="Danger zone" glyph="risk" id="fs-danger">
        <Card className="border-[var(--fs-danger-border)]">
          <CardHeader>
            <CardTitle className="text-sm text-[var(--fs-danger-fg)]">Delete account</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-xs leading-relaxed text-ink-muted">
              Deleting your account soft-deletes it, revokes all sessions immediately and requests workspace data cleanup per the
              documented retention policy.
            </p>
            <div>
              <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                <Icon name="trash" size={13} />
                Delete account
              </Button>
            </div>
          </CardContent>
        </Card>
      </SectionShell>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent
          title="Delete account?"
          description="This action cannot be undone from the interface. Your sessions are revoked immediately. Workspace-owned research objects follow the retention policy documented in DATA_METHODOLOGY."
          busy={deleteAccount.isPending}
        >
          <DialogFooter className="-mx-5 -mb-4 mt-4">
            <Button variant="outline" size="sm" onClick={() => setDeleteOpen(false)} disabled={deleteAccount.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => deleteAccount.mutate()}
              loading={deleteAccount.isPending}
              loadingLabel="Deleting account"
            >
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
