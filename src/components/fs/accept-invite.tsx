"use client";

// AcceptInviteView — target of emailed workspace invitations
// (/auth?invite=<token>) for sessions that already exist. The invitation is
// accepted once on mount; the invited workspace becomes the active one.

import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, CardContent, Glyph, LoadingState, LogoLockup } from "@/components/fs";
import { api, ApiClientError } from "@/lib/client/api";
import { useApp } from "@/lib/client/store";

export function AcceptInviteView({ token }: { token: string }) {
  const navigate = useApp((s) => s.navigate);
  const qc = useQueryClient();
  const [state, setState] = React.useState<"working" | "done" | "error">("working");
  const [message, setMessage] = React.useState<string>("");
  const started = React.useRef(false);

  React.useEffect(() => {
    if (started.current) return; // StrictMode double-invoke guard — accept exactly once
    started.current = true;
    api
      .post<{ workspaceId: string; role: string }>("/api/v1/invitations/accept", { token })
      .then(() => setState("done"))
      .catch((err) => {
        setState("error");
        setMessage(
          err instanceof ApiClientError
            ? err.message
            : "The invitation could not be accepted. It may have expired or been revoked.",
        );
      });
  }, [token]);

  const signOutForDifferentAccount = async () => {
    await api.post("/api/v1/auth/logout").catch(() => undefined);
    await qc.invalidateQueries();
    window.location.assign(`/auth?invite=${encodeURIComponent(token)}`);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="flex justify-center">
          <LogoLockup size={30} />
        </div>
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-6">
            {state === "working" && <LoadingState rows={1} label="Accepting your invitation" />}
            {state === "done" && (
              <>
                <Badge tone="success" dot>
                  Invitation accepted
                </Badge>
                <p className="text-sm leading-relaxed text-ink-secondary">
                  Welcome aboard. Your new workspace is now active for this session.
                </p>
                <Button
                  className="w-full"
                  onClick={() => {
                    void qc.invalidateQueries();
                    navigate("discover");
                  }}
                >
                  Continue to your workspace
                </Button>
              </>
            )}
            {state === "error" && (
              <>
                <span aria-hidden="true" className="text-[var(--fs-warning-fg)]">
                  <Glyph name="risk" size={22} />
                </span>
                <p role="alert" className="text-sm leading-relaxed text-ink-secondary">
                  {message}
                </p>
                <Button variant="outline" className="w-full" onClick={() => void signOutForDifferentAccount()}>
                  Sign in with the invited account
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
