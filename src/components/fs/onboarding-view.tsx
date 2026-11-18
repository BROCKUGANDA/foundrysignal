"use client";

// First-run onboarding. Rendered only while the account is not yet onboarded
// (server-side `onboardedAt` — returning users never see it). Content is
// tailored to the registration persona; credentials stay out of step one by
// design (MFA is offered, never demanded).
//
// Every role sees: what the platform is, what they can do here, and one
// role-specific quick win. Skipping completes onboarding too — the flag
// records that the user has seen the welcome flow, not that they followed it.

import { useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  Glyph,
  Icon,
  cn,
  toast,
} from "@/components/fs";
import { api } from "@/lib/client/api";
import { USER_TYPE_LABELS, type UserType } from "@/lib/contracts/api";
import type { GlyphName } from "@/components/fs/brand/glyphs";

interface RoleStep {
  glyph: GlyphName;
  title: string;
  body: string;
}

const ROLE_CONTENT: Record<UserType, { headline: string; steps: RoleStep[] }> = {
  VENTURE_INVESTOR: {
    headline: "Research ventures with evidence, not pitch decks.",
    steps: [
      {
        glyph: "venture",
        title: "Browse the evidence graph",
        body: "Discover shows Solana ventures with repository, token and onchain evidence attached — every claim links back to a public source.",
      },
      {
        glyph: "watchlist",
        title: "Build your watchlist",
        body: "Track the ventures you care about. Watchlist items carry status, activity and claim counts once collectors run.",
      },
      {
        glyph: "report",
        title: "Run research",
        body: "Ask the AI analyst a question about any venture. Reports are traceable — sources are cited inline and can be exported.",
      },
    ],
  },
  FOUNDER: {
    headline: "Make your venture legible to evidence.",
    steps: [
      {
        glyph: "development",
        title: "Register your venture",
        body: "Submit your site or GitHub org from Discover. Collectors populate the dossier from public sources — nothing is fabricated.",
      },
      {
        glyph: "evidence",
        title: "Attach real evidence",
        body: "Published repos, token programs and onchain deployments all land in the evidence graph automatically with source timestamps.",
      },
      {
        glyph: "market",
        title: "See how you read to investors",
        body: "The dossier is exactly what an investor sees: claims, verification states, and market data from public sources.",
      },
    ],
  },
  RESEARCH_ANALYST: {
    headline: "Work from sources, not summaries.",
    steps: [
      {
        glyph: "research",
        title: "Query the evidence graph",
        body: "Ask the AI analyst how a venture ships, and get an answer with inline citations you can open and verify yourself.",
      },
      {
        glyph: "report",
        title: "Export reports",
        body: "Research runs produce reports you can export as a portable artifact for your own diligence workflow.",
      },
      {
        glyph: "claim",
        title: "Scrutinize claims",
        body: "Every claim carries a verification state and origin. Self-asserted vs source-confirmed is always disclosed.",
      },
    ],
  },
  LIMITED_PARTNER: {
    headline: "See what the fund sees.",
    steps: [
      {
        glyph: "market",
        title: "Track portfolio signal",
        body: "Follow ventures and their onchain and market activity from one workspace — no duplicated research, no stale decks.",
      },
      {
        glyph: "evidence",
        title: "Evidence over anecdotes",
        body: "Every dossier shows traceable public evidence: repos, tokens, program deployments and source-confirmed claims.",
      },
      {
        glyph: "watchlist",
        title: "Watch without a mandate",
        body: "Build a watchlist of portfolio and pipeline companies. Read-only access is enough to stay informed.",
      },
    ],
  },
  OTHER: {
    headline: "Welcome — here's the shortest path.",
    steps: [
      {
        glyph: "venture",
        title: "Discover ventures",
        body: "Browse Solana ventures with public evidence attached — repository, token and onchain sources, all traceable.",
      },
      {
        glyph: "research",
        title: "Ask the analyst",
        body: "Research questions get answers with inline citations. Trace any claim back to the source yourself.",
      },
      {
        glyph: "token",
        title: "Tune your persona",
        body: "Your registration type shapes what we suggest. Change it any time in Settings — it is a hint, never a role.",
      },
    ],
  },
};

export function OnboardingView({
  userType,
  onComplete,
}: {
  userType: string;
  onComplete: () => void;
}) {
  const content = ROLE_CONTENT[(userType as UserType) in ROLE_CONTENT ? (userType as UserType) : "OTHER"];
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    setBusy(true);
    try {
      await api.patch("/api/v1/account", { onboarded: true });
      toast.success("Onboarding complete — welcome aboard.");
      onComplete();
    } catch (err) {
      setBusy(false);
      toast.apiError("Could not save onboarding state", err as Error);
    }
  };

  const total = content.steps.length;
  const isLast = step === total - 1;

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent size="md" hideClose busy={busy} title="Welcome to FoundrySignal">
        <div className="space-y-5">
          <div className="space-y-1.5">
            <p className="text-2xs font-medium uppercase tracking-widest text-ink-muted">
              {USER_TYPE_LABELS[(userType as UserType) in USER_TYPE_LABELS ? (userType as UserType) : "OTHER"]} onboarding
            </p>
            <h2 className="text-lg font-semibold leading-snug text-ink">{content.headline}</h2>
          </div>

          {/* role-specific steps */}
          <ol className="space-y-3" aria-label="Onboarding steps">
            {content.steps.map((s, i) => {
              const state = i === step ? "current" : i < step ? "done" : "todo";
              return (
                <li key={s.title} className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border",
                      state === "current" && "border-[var(--fs-accent)] bg-surface-3 text-[var(--fs-accent)]",
                      state === "done" && "border-[var(--fs-success-fg)] bg-surface-2 text-[var(--fs-success-fg)]",
                      state === "todo" && "border-[var(--fs-border)] bg-surface-2 text-ink-muted",
                    )}
                  >
                    {state === "done" ? <Icon name="check" size={16} /> : <Glyph name={s.glyph} size={18} />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{s.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{s.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={finish} disabled={busy}>
            {isLast ? "Done" : "Skip tour"}
          </Button>
          <Button variant="primary" onClick={() => (isLast ? finish() : setStep((i) => Math.min(i + 1, total - 1)))} disabled={busy}>
            {isLast ? "Enter FoundrySignal" : "Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
