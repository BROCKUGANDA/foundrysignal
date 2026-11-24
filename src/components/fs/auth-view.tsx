"use client";

// Auth view — registration, login, logout. Real sessions. Email verification
// and password reset are handled from this page: /auth?verify= consumes the
// token on load, /auth?reset= shows a new-password form, and /auth?invite=
// completes a workspace invitation after sign-in.

import React, { useState } from "react";
import { Button, Card, CardContent, Checkbox, Field, Glyph, Icon, Input, LogoLockup, Select, toast } from "@/components/fs";
import { useApp } from "@/lib/client/store";
import { api, ApiClientError, type AccountState, type Capabilities } from "@/lib/client/api";
import { USER_TYPES, USER_TYPE_LABELS } from "@/lib/contracts/api";
import { TERMS_VERSION } from "@/lib/contracts/terms";

type Mode = "register" | "login" | "mfa" | "reset" | "request-reset";

type CredentialsResult =
  | { mfaRequired: false; verificationEmailSent?: boolean }
  | { mfaRequired: true; challenge: string };

/** Registration personas — every option is a peer, none implies a role. */
const PERSONA_OPTIONS = USER_TYPES.map((value) => ({ value, label: USER_TYPE_LABELS[value] }));

function stripAuthQuery() {
  if (typeof window !== "undefined" && window.location.search) {
    window.history.replaceState({}, "", window.location.pathname);
  }
}

export function AuthView({ onAuthenticated }: { onAuthenticated: (account: AccountState) => void }) {
  const navigate = useApp((s) => s.navigate);
  const params = useApp((s) => s.params);
  const inviteToken = params.invite;
  const resetToken = params.reset;
  const verifyToken = params.verify;
  const [mode, setMode] = useState<Mode>(resetToken ? "reset" : params.mode === "login" ? "login" : "register");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [userType, setUserType] = useState<string>("VENTURE_INVESTOR");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [oauthProviders, setOauthProviders] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const verifyFired = React.useRef(false);

  // Consume /auth?verify=<token> exactly once, on load.
  React.useEffect(() => {
    if (!verifyToken || verifyFired.current) return;
    verifyFired.current = true;
    api
      .post<{ verified: boolean; alreadyUsed?: boolean }>("/api/v1/auth/verify", { token: verifyToken })
      .then((data) => {
        setNotice({
          tone: "success",
          text: data.alreadyUsed ? "This email was already verified." : "Your email address is verified.",
        });
        toast.success(data.alreadyUsed ? "Email already verified" : "Email verified");
        stripAuthQuery();
      })
      .catch((err) => {
        const msg = err instanceof ApiClientError ? err.message : "The verification link is invalid or expired.";
        setNotice({ tone: "danger", text: msg });
        toast.error(msg);
        stripAuthQuery();
      });
  }, [verifyToken]);

  // Only advertise providers the server reports as configured.
  React.useEffect(() => {
    api.get<Capabilities>("/api/v1/capabilities")
      .then((caps) => setOauthProviders(caps.oauth?.providers ?? []))
      .catch(() => setOauthProviders([]));
  }, []);

  // After an OAuth sign-in that needs a second factor, the callback delivers
  // the challenge in an HttpOnly cookie rather than in the URL.
  React.useEffect(() => {
    if (mode !== "mfa" || challenge) return;
    api.post<{ challenge: string }>("/api/v1/auth/mfa-challenge", {})
      .then((data) => setChallenge(data.challenge))
      .catch(() => setError("Your second-factor session expired. Sign in again."));
  }, [mode, challenge]);

  React.useEffect(() => {
    if (params.oauth === "error" || params.oauth === "denied") {
      setNotice({
        tone: "danger",
        text: params.oauth === "denied"
          ? "Sign-in was cancelled at the provider."
          : "Provider sign-in failed. No account was changed — try again or use your password.",
      });
      stripAuthQuery();
    }
  }, [params.oauth]);

  const acceptInviteIfPresent = async () => {
    if (!inviteToken) return;
    try {
      await api.post("/api/v1/invitations/accept", { token: inviteToken });
      toast.success("Invitation accepted — your new workspace is active.");
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : "The invitation could not be accepted.";
      toast.error(msg);
    }
  };

  const submitCredentials = async (): Promise<CredentialsResult> => {
    if (mode === "register") {
      const res = await api.post<{ verificationEmailSent?: boolean }>("/api/v1/auth/register", {
        email,
        password,
        name: name || undefined,
        userType,
        acceptTerms,
        termsVersion: TERMS_VERSION,
      });
      return { mfaRequired: false, verificationEmailSent: res?.verificationEmailSent };
    }
    const res = await api.post<{ mfaRequired?: boolean; challenge?: string }>("/api/v1/auth/login", { email, password });
    // When MFA is enabled the server deliberately issues no session. The
    // challenge must be exchanged below before the app considers us signed in.
    if (res?.mfaRequired && res.challenge) return { mfaRequired: true, challenge: res.challenge };
    return { mfaRequired: false };
  };

  const verifySecondFactor = async () => {
    if (!challenge) {
      setError("Your second-factor session expired. Sign in again.");
      return;
    }
    await api.post("/api/v1/auth/mfa-verify",
      useRecovery ? { challenge, recoveryCode: recoveryCode.trim() } : { challenge, code: mfaCode.trim() },
    );
    const account = await api.get<AccountState>("/api/v1/account");
    await acceptInviteIfPresent();
    toast.success("Signed in");
    setMfaCode("");
    setRecoveryCode("");
    setChallenge(null);
    onAuthenticated(account);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "register" && !acceptTerms) {
      setError("Please accept the Terms of Service before creating an account.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === "mfa") {
        await verifySecondFactor();
        return;
      }
      if (mode === "reset") {
        if (!resetToken) {
          setError("Missing reset token — use the link from the password-reset email.");
          return;
        }
        if (password !== confirmPassword) {
          setError("The two passwords do not match.");
          return;
        }
        await api.post("/api/v1/auth/reset", { token: resetToken, password });
        toast.success("Password updated — sign in with your new password.");
        stripAuthQuery();
        setPassword("");
        setConfirmPassword("");
        setMode("login");
        return;
      }
      if (mode === "request-reset") {
        await api.post("/api/v1/auth/request-reset", { email });
        toast.success("If an account exists for that email, a reset link is on its way.");
        setMode("login");
        return;
      }
      const credentials = await submitCredentials();
      if (credentials.mfaRequired) {
        setChallenge(credentials.challenge);
        setMfaCode("");
        setRecoveryCode("");
        setUseRecovery(false);
        setMode("mfa");
        return;
      }
      const account = await api.get<AccountState>("/api/v1/account");
      await acceptInviteIfPresent();
      toast.success(
        mode === "register"
          ? credentials.verificationEmailSent
            ? "Workspace created — check your inbox to verify your email."
            : "Workspace created."
          : "Signed in",
      );
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

  const isCredentialMode = mode === "register" || mode === "login";

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
              {mode === "register" &&
                "Create your account and tell us who you are — investor, founder, analyst or LP. Your email is stored hashed for lookup; sessions are server-side and revocable."}
              {mode === "login" && "Sign in to your research workspace."}
              {mode === "mfa" && "Enter the six-digit code from your authenticator app. Your password was accepted; this is the second step."}
              {mode === "reset" && "Choose a new password for your account."}
              {mode === "request-reset" && "Enter your account email — we will send you a password-reset link."}
            </p>
          </div>

          {inviteToken && (
            <div role="status" className="flex items-start gap-2.5 rounded-lg border border-[var(--fs-info-border,var(--fs-border))] bg-surface-2 p-3">
              <span aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--fs-info-fg,#5aa)]">
                <Glyph name="attestation" size={14} />
              </span>
              <p className="text-2xs leading-relaxed text-ink-muted">
                You have a workspace invitation. Sign in (or create an account with the invited email) and it will be
                accepted automatically.
              </p>
            </div>
          )}

          {notice && (
            <div
              role="status"
              className={
                notice.tone === "success"
                  ? "rounded-md border border-[var(--fs-success-border)] bg-[var(--fs-success-bg)] px-3 py-2 text-xs text-[var(--fs-success-fg)]"
                  : "rounded-md border border-[var(--fs-danger-border)] bg-[var(--fs-danger-bg)] px-3 py-2 text-xs text-[var(--fs-danger-fg)]"
              }
            >
              {notice.text}
            </div>
          )}

          <Card>
            <CardContent>
              <form
                onSubmit={submit}
                className="flex flex-col gap-4"
                aria-label={
                  mode === "register"
                    ? "Create account"
                    : mode === "login"
                      ? "Sign in"
                      : mode === "mfa"
                        ? "Two-factor verification"
                        : mode === "reset"
                        ? "Reset password"
                        : "Request password reset"
                }
              >
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

                {mode !== "reset" && mode !== "mfa" && (
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

                {isCredentialMode && (
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
                )}

                {mode === "mfa" && (
                  useRecovery ? (
                    <Field id="fs-recovery-code" label="Recovery code" hint="Single use — each code works once." required>
                      {(props) => (
                        <Input
                          {...props}
                          value={recoveryCode}
                          onChange={(e) => setRecoveryCode(e.target.value)}
                          autoComplete="one-time-code"
                          placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
                        />
                      )}
                    </Field>
                  ) : (
                    <Field id="fs-mfa-code" label="Authentication code" hint="Six digits from your authenticator app." required>
                      {(props) => (
                        <Input
                          {...props}
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={6}
                          value={mfaCode}
                          onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          autoComplete="one-time-code"
                          placeholder="000000"
                        />
                      )}
                    </Field>
                  )
                )}

                {mode === "mfa" && (
                  <Button
                    type="button"
                    variant="link"
                    className="w-full justify-center text-xs"
                    onClick={() => {
                      setUseRecovery((v) => !v);
                      setError(null);
                    }}
                  >
                    {useRecovery ? "Use your authenticator code" : "Use a recovery code instead"}
                  </Button>
                )}

                {mode === "reset" && (
                  <>
                    <Field id="fs-new-password" label="New password" hint="Minimum 10 characters." required>
                      {(props) => (
                        <Input
                          {...props}
                          type="password"
                          minLength={10}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          autoComplete="new-password"
                        />
                      )}
                    </Field>
                    <Field id="fs-confirm-password" label="Confirm new password" required>
                      {(props) => (
                        <Input
                          {...props}
                          type="password"
                          minLength={10}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          autoComplete="new-password"
                        />
                      )}
                    </Field>
                  </>
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

                {mode === "register" && (
                  <div className="flex flex-col gap-2">
                    <Checkbox
                      id="fs-accept-terms"
                      label="I accept the Terms of Service"
                      checked={acceptTerms}
                      onChange={(e) => setAcceptTerms(e.target.checked)}
                    />
                    <p className="pl-7 text-2xs leading-relaxed text-ink-faint">
                      Read the{" "}
                      <a href="/terms" target="_blank" rel="noreferrer" className="underline underline-offset-2">
                        Terms of Service
                      </a>{" "}
                      and{" "}
                      <a href="/privacy" target="_blank" rel="noreferrer" className="underline underline-offset-2">
                        Privacy policy
                      </a>
                      . Version {TERMS_VERSION}.
                    </p>
                  </div>
                )}

                {error && (
                  <p role="alert" className="rounded-md border border-[var(--fs-danger-border)] bg-[var(--fs-danger-bg)] px-3 py-2 text-xs leading-relaxed text-[var(--fs-danger-fg)]">
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  loading={busy}
                  loadingLabel={
                    mode === "register"
                      ? "Creating account"
                      : mode === "login"
                        ? "Signing in"
                        : mode === "mfa"
                          ? "Verifying"
                          : mode === "reset"
                            ? "Updating password"
                            : "Sending reset link"
                  }
                >
                  {mode === "register" && "Create account"}
                  {mode === "login" && "Sign in"}
                  {mode === "mfa" && "Verify and sign in"}
                  {mode === "reset" && "Update password"}
                  {mode === "request-reset" && "Send reset link"}
                </Button>

                {isCredentialMode && oauthProviders.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-2xs text-ink-faint">
                      <span className="h-px flex-1 bg-[var(--fs-border)]" />
                      or continue with
                      <span className="h-px flex-1 bg-[var(--fs-border)]" />
                    </div>
                    {oauthProviders.map((provider) => (
                      <Button
                        key={provider}
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          const invite = inviteToken ? `?invite=${encodeURIComponent(inviteToken)}` : "";
                          window.location.assign(`/api/v1/auth/oauth/${provider.toLowerCase()}/start${invite}`);
                        }}
                      >
                        {provider === "GITHUB" ? "GitHub" : "Google"}
                      </Button>
                    ))}
                  </div>
                )}

                {isCredentialMode && (
                  <Button type="button" variant="link" className="w-full justify-center text-xs" onClick={swapMode}>
                    {mode === "register" ? "Already have an account? Sign in" : "Need an account? Register"}
                  </Button>
                )}
                {mode === "login" && (
                  <Button
                    type="button"
                    variant="link"
                    className="w-full justify-center text-xs"
                    onClick={() => {
                      setMode("request-reset");
                      setError(null);
                    }}
                  >
                    Forgot your password?
                  </Button>
                )}
                {mode === "request-reset" && (
                  <Button
                    type="button"
                    variant="link"
                    className="w-full justify-center text-xs"
                    onClick={() => {
                      setMode("login");
                      setError(null);
                    }}
                  >
                    Back to sign in
                  </Button>
                )}
                {mode === "mfa" && (
                  <Button
                    type="button"
                    variant="link"
                    className="w-full justify-center text-xs"
                    onClick={() => {
                      setMode("login");
                      setChallenge(null);
                      setMfaCode("");
                      setRecoveryCode("");
                      setError(null);
                    }}
                  >
                    Back to sign in
                  </Button>
                )}
              </form>
            </CardContent>
          </Card>

          <div className="flex items-start gap-2.5 rounded-lg border border-[var(--fs-border)] bg-surface-2 p-4">
            <span aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--fs-info-fg)]">
              <Glyph name="risk" size={14} />
            </span>
            <p className="text-2xs leading-relaxed text-ink-muted">
              Email verification and password reset depend on provider domain setup. TOTP two-factor authentication can
              be enabled under Settings → Security when the server's MFA key is configured; it is never simulated.
              OAuth buttons appear only for providers configured with callback URLs registered at the provider.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
