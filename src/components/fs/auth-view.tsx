"use client";

// Auth view — registration, login, logout. Real sessions; email-verification
// and password-reset generate tokens but delivery shows EMAIL_UNAVAILABLE
// honestly (no email provider configured).

import React, { useState } from "react";
import { Button, Card, CardContent, Field, Glyph, Icon, Input, LogoLockup, Select, toast } from "@/components/fs";
import { useApp } from "@/lib/client/store";
import { api, ApiClientError, type AccountState } from "@/lib/client/api";
import { USER_TYPES, USER_TYPE_LABELS } from "@/lib/contracts/api";

type Mode = "register" | "login";

/** Registration personas — every option is a peer, none implies a role. */
const PERSONA_OPTIONS = USER_TYPES.map((value) => ({ value, label: USER_TYPE_LABELS[value] }));

export function AuthView({ onAuthenticated }: { onAuthenticated: (account: AccountState) => void }) {
  const navigate = useApp((s) => s.navigate);
  const params = useApp((s) => s.params);
  const [mode, setMode] = useState<Mode>(params.mode === "login" ? "login" : "register");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [userType, setUserType] = useState<string>("VENTURE_INVESTOR");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "register") {
        await api.post("/api/v1/auth/register", { email, password, name: name || undefined, userType });
      } else {
        await api.post("/api/v1/auth/login", { email, password });
      }
      const account = await api.get<AccountState>("/api/v1/account");
      toast.success(mode === "register" ? "Workspace created" : "Signed in");
      onAuthenticated(account);
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : "Authentication failed.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const swapMode = () => {
    setMode(mode === "register" ? "login" : "register");
    setError(null);
  };

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <div className="flex h-14 items-center px-4 sm:px-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("home")}>
          <Icon name="chevronRight" size={13} className="rotate-180" />
          Back
        </Button>
      </div>

      <main id="fs-main" className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-3 text-center">
            <div className="flex justify-center">
              <LogoLockup size={30} />
            </div>
            <p className="text-xs leading-relaxed text-ink-muted">
              {mode === "register"
                ? "Create your account and tell us who you are — investor, founder, analyst or LP. Your email is stored hashed for lookup; sessions are server-side and revocable."
                : "Sign in to your research workspace."}
            </p>
          </div>

          <Card>
            <CardContent>
              <form onSubmit={submit} className="flex flex-col gap-4" aria-label={mode === "register" ? "Create account" : "Sign in"}>
                {mode === "register" && (
                  <Field id="fs-name" label="Display name">
                    {(props) => (
                      <Input
                        {...props}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoComplete="name"
                        placeholder="Ada Researcher"
                      />
                    )}
                  </Field>
                )}

                <Field id="fs-email" label="Email" required>
                  {(props) => (
                    <Input
                      {...props}
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      placeholder="you@fund.example"
                    />
                  )}
                </Field>

                <Field
                  id="fs-password"
                  label="Password"
                  hint={mode === "register" ? "Minimum 10 characters." : undefined}
                  required
                >
                  {(props) => (
                    <Input
                      {...props}
                      type="password"
                      minLength={mode === "register" ? 10 : 1}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete={mode === "register" ? "new-password" : "current-password"}
                    />
                  )}
                </Field>

                {mode === "register" && (
                  <Field
                    id="fs-user-type"
                    label="I am registering as"
                    hint="This tailors onboarding only — it never grants a platform or workspace role."
                  >
                    {(props) => (
                      <Select
                        {...props}
                        options={PERSONA_OPTIONS}
                        value={userType}
                        onValueChange={setUserType}
                      />
                    )}
                  </Field>
                )}

                {error && (
                  <p role="alert" className="rounded-md border border-[var(--fs-danger-border)] bg-[var(--fs-danger-bg)] px-3 py-2 text-xs leading-relaxed text-[var(--fs-danger-fg)]">
                    {error}
                  </p>
                )}

                <Button type="submit" className="w-full" loading={busy} loadingLabel={mode === "register" ? "Creating account" : "Signing in"}>
                  {mode === "register" ? "Create account" : "Sign in"}
                </Button>

                <Button type="button" variant="link" className="w-full justify-center text-xs" onClick={swapMode}>
                  {mode === "register" ? "Already have an account? Sign in" : "Need an account? Register"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="flex items-start gap-2.5 rounded-lg border border-[var(--fs-border)] bg-surface-2 p-4">
            <span aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--fs-info-fg)]">
              <Glyph name="risk" size={14} />
            </span>
            <p className="text-2xs leading-relaxed text-ink-muted">
              Email delivery is configured via Resend for this deployment; verification/reset delivery depends on enabled auth
              flows and provider domain setup. OAuth client credentials and an MFA encryption key are configured in the environment
              (see capability registry for live status and any enablement steps such as callback registration).
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
