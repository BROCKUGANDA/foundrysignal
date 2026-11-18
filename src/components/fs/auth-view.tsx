"use client";

// Auth view — registration, login, logout. Real sessions; account data is
// stored hashed and sessions are server-side and revocable.

import React, { useState } from "react";
import { Button, Card, CardContent, Field, Glyph, Icon, Input, LogoLockup, Select, toast } from "@/components/fs";
import { useApp } from "@/lib/client/store";
import { api, ApiClientError, type AccountState } from "@/lib/client/api";
import { USER_TYPES, USER_TYPE_LABELS } from "@/lib/contracts/api";

type Mode = "register" | "login" | "forgot" | "reset" | "verify";

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
  const [notice, setNotice] = useState<string | null>(null);

  // One-time URL params: ?verify=<token> | ?reset=<token> (from emailed links).
  const queryToken = params.verify ?? params.reset;
  const queryKind: "verify" | "reset" | null = params.verify ? "verify" : params.reset ? "reset" : null;
  const [appliedRoute, setAppliedRoute] = useState<string | null>(null);
  React.useEffect(() => {
    const oauthError = params.oauthError;
    if (oauthError) setError(`Provider sign-in failed: ${oauthError}`);
  }, [params.oauthError]);

  React.useEffect(() => {
    if (queryKind && queryToken && appliedRoute !== `${queryKind}:${queryToken}`) {
      setAppliedRoute(`${queryKind}:${queryToken}`);
      setMode(queryKind === "verify" ? "verify" : "reset");
    }
  }, [queryKind, queryToken, appliedRoute]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "register") {
        await api.post("/api/v1/auth/register", { email, password, name: name || undefined, userType });
        const account = await api.get<AccountState>("/api/v1/account");
        toast.success("Workspace created — verification email sent");
        onAuthenticated(account);
        return;
      }
      if (mode === "forgot") {
        await api.post("/api/v1/auth/forgot-password", { email });
        setNotice("If an account exists for that email, a reset link was sent.");
        return;
      }
      if (mode === "reset") {
        await api.post("/api/v1/auth/reset-password", { token: params.reset, newPassword: password });
        toast.success("Password updated — sign in with your new password.");
        setMode("login");
        setPassword("");
        return;
      }
      if (mode === "verify") {
        await api.post("/api/v1/auth/verify-email", { token: params.verify });
        setNotice("Email verified. Sign in to continue.");
        setMode("login");
        return;
      }
      // login
      await api.post("/api/v1/auth/login", { email, password });
      const account = await api.get<AccountState>("/api/v1/account");
      toast.success("Signed in");
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
    setNotice(null);
  };

  const heading = {
    register: "Create your account",
    login: "Sign in to your workspace",
    forgot: "Reset your password",
    reset: "Choose a new password",
    verify: "Verify your email",
  }[mode];

  const subheading = {
    register: "Investor, founder, analyst or LP. Your email is stored hashed for lookup; sessions are server-side and revocable.",
    login: "Sign in to your research workspace.",
    forgot: "Enter your account email — we will send a reset link.",
    reset: "Enter a new password for your account.",
    verify: "One click confirms this email belongs to you.",
  }[mode];

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <div className="flex h-14 items-center px-4 sm:px-6">
        <Button variant="ghost" size="sm" onClick={() => { if (window.history.length > 1) window.history.back(); else navigate("home"); }}>
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
            <h1 className="text-base font-semibold text-ink">{heading}</h1>
            <p className="text-xs leading-relaxed text-ink-muted">{subheading}</p>
          </div>

          <Card>
            <CardContent>
              <form onSubmit={submit} className="flex flex-col gap-4" aria-label={heading}>
                {(mode === "reset" || mode === "verify") && (
                  <p className="fs-data text-2xs text-ink-muted">
                    {mode === "reset" ? "Single-use link from your email. Expires in 30 minutes." : "Confirming your email address."}
                  </p>
                )}
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

                {mode !== "reset" && mode !== "verify" && (
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
                )}

                {mode !== "verify" && (
                <Field
                  id="fs-password"
                  label="Password"
                  hint={(mode === "register" || mode === "reset") ? "Minimum 10 characters." : undefined}
                  required
                >
                  {(props) => (
                    <Input
                      {...props}
                      type="password"
                      minLength={(mode === "register" || mode === "reset") ? 10 : 1}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete={(mode === "register" || mode === "reset") ? "new-password" : "current-password"}
                    />
                  )}
                </Field>
                )}

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

                {(mode === "register" || mode === "login") && (
                  <div className="flex flex-col gap-2" aria-label="Continue with a provider">
                    <a
                      href="/api/v1/auth/oauth/google/start"
                      className="flex w-full items-center justify-center gap-2 rounded-md border border-[var(--fs-border)] bg-surface-2 px-4 py-2 text-xs font-medium text-ink transition-colors hover:border-[var(--fs-border-strong)]"
                    >
                      <Icon name="externalLink" size={12} aria-hidden="true" />
                      Continue with Google
                    </a>
                    <a
                      href="/api/v1/auth/oauth/github/start"
                      className="flex w-full items-center justify-center gap-2 rounded-md border border-[var(--fs-border)] bg-surface-2 px-4 py-2 text-xs font-medium text-ink transition-colors hover:border-[var(--fs-border-strong)]"
                    >
                      <Icon name="externalLink" size={12} aria-hidden="true" />
                      Continue with GitHub
                    </a>
                    <div className="flex items-center gap-2 text-2xs text-ink-muted" aria-hidden="true">
                      <span className="h-px flex-1 bg-[var(--fs-border)]" />
                      or
                      <span className="h-px flex-1 bg-[var(--fs-border)]" />
                    </div>
                  </div>
                )}

                {notice && (
                  <p role="status" className="rounded-md border border-[#1f5f46] bg-[#06251a] px-3 py-2 text-xs leading-relaxed text-[#7fe0ae]">
                    {notice}
                  </p>
                )}

                {error && (
                  <p role="alert" className="rounded-md border border-[var(--fs-danger-border)] bg-[var(--fs-danger-bg)] px-3 py-2 text-xs leading-relaxed text-[var(--fs-danger-fg)]">
                    {error}
                  </p>
                )}

                <Button type="submit" className="w-full" loading={busy} loadingLabel={
                  mode === "register" ? "Creating account" :
                  mode === "forgot" ? "Sending reset link" :
                  mode === "reset" ? "Updating password" :
                  mode === "verify" ? "Confirming email" :
                  "Signing in"
                }>
                  {mode === "register" ? "Create account" :
                   mode === "forgot" ? "Send reset link" :
                   mode === "reset" ? "Update password" :
                   mode === "verify" ? "Confirm email" :
                   "Sign in"}
                </Button>

                {mode === "login" && (
                  <div className="flex flex-col gap-2">
                    <Button type="button" variant="link" className="w-full justify-center text-xs" onClick={() => { setMode("forgot"); setError(null); setNotice(null); }}>
                      Forgot password?
                    </Button>
                    <Button type="button" variant="link" className="w-full justify-center text-xs" onClick={swapMode}>
                      Need an account? Register
                    </Button>
                  </div>
                )}
                {mode === "register" && (
                  <Button type="button" variant="link" className="w-full justify-center text-xs" onClick={swapMode}>
                    Already have an account? Sign in
                  </Button>
                )}
                {(mode === "forgot" || mode === "reset") && (
                  <Button type="button" variant="link" className="w-full justify-center text-xs" onClick={() => { setMode("login"); setError(null); setNotice(null); }}>
                    Back to sign in
                  </Button>
                )}
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
