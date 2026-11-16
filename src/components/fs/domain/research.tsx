"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/fs/ui/button";
import { Badge } from "@/components/fs/ui/badge";
import { Glyph } from "@/components/fs/brand/glyphs";

/**
 * ResearchComposer — grounded question input.
 *
 * The composer is deliberately constrained: the analyst answers only from
 * collected evidence, so the UI states that contract up front and offers
 * suggested questions that are known to be answerable from the evidence graph.
 *
 * State contract:
 *   default     empty input, submit disabled
 *   typing      submit enabled, char budget shown
 *   submitting  button loading, textarea locked, aria-busy
 *   error       inline error from the API, content preserved (never cleared)
 *   offline     submit blocked with an explanation
 *   forbidden   caller renders ForbiddenState instead of the composer
 *
 * The character budget is real: the API caps question length, so the UI
 * enforces it rather than letting the request fail server-side.
 */

export interface SuggestedQuestion {
  id: string;
  text: string;
  /** Optional rationale shown as a hint. */
  hint?: string;
}

export const DEFAULT_SUGGESTIONS: SuggestedQuestion[] = [
  { id: "shipped", text: "What has this venture verifiably shipped?" },
  { id: "dev", text: "Summarize development activity and its trend.", hint: "Repository observations" },
  { id: "token", text: "What is the token structure and what remains unknown?" },
  { id: "claims", text: "Which claims are self-asserted and which are corroborated?" },
];

export interface ResearchComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  suggestions?: SuggestedQuestion[];
  /** Provider of the venture this question is scoped to; shown as context. */
  scopeLabel?: string;
  placeholder?: string;
  maxLength?: number;
  submitting?: boolean;
  disabled?: boolean;
  offline?: boolean;
  error?: string | null;
  className?: string;
  /** Hide the suggestion row when space is tight. */
  hideSuggestions?: boolean;
}

export function ResearchComposer({
  value,
  onChange,
  onSubmit,
  suggestions = DEFAULT_SUGGESTIONS,
  scopeLabel,
  placeholder = "Ask a question the evidence can answer…",
  maxLength = 500,
  submitting,
  disabled,
  offline,
  error,
  className,
  hideSuggestions,
}: ResearchComposerProps) {
  const canSubmit = value.trim().length > 0 && !submitting && !disabled && !offline;
  const nearLimit = value.length > maxLength * 0.9;
  const fieldId = React.useId();

  return (
    <form
      className={cn("flex flex-col gap-3", className)}
      data-slot="research-composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) onSubmit();
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={fieldId} className="fs-label">
          Question
        </label>
        {scopeLabel ? (
          <span className="fs-data text-2xs text-ink-faint">{scopeLabel}</span>
        ) : null}
      </div>

      <div className="relative">
        <textarea
          id={fieldId}
          value={value}
          onChange={(event) => onChange(event.target.value.slice(0, maxLength))}
          placeholder={placeholder}
          rows={3}
          maxLength={maxLength}
          disabled={submitting || offline}
          aria-describedby={error ? `${fieldId}-error` : undefined}
          aria-invalid={error ? true : undefined}
          className={cn(
            "w-full resize-y rounded-md border bg-surface px-3.5 py-2.5 text-sm text-ink",
            "placeholder:text-ink-faint",
            "transition-[border-color,box-shadow] duration-fast ease-out",
            "border-[var(--fs-border-strong)] hover:border-[var(--fs-border-emphasis)]",
            "focus-visible:border-[var(--fs-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus-ring)]",
            "disabled:cursor-not-allowed disabled:bg-[var(--fs-disabled-bg)] disabled:text-[var(--fs-disabled-fg)]",
            "aria-[invalid=true]:border-[var(--fs-danger)]",
          )}
        />
        <div
          aria-hidden="true"
          className={cn(
            "fs-data pointer-events-none absolute bottom-2 right-3 text-2xs",
            nearLimit ? "text-[var(--fs-warning-fg)]" : "text-ink-faint",
          )}
        >
          {value.length}/{maxLength}
        </div>
      </div>

      {error ? (
        <p id={`${fieldId}-error`} role="alert" className="text-xs text-[var(--fs-danger-fg)]">
          {error}
        </p>
      ) : null}

      {offline ? (
        <p className="text-xs text-[var(--fs-warning-fg)]">
          You are offline. Reconnect to run a research query.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" loading={submitting} loadingLabel="Researching" disabled={!canSubmit}>
          <Glyph name="research" size={15} />
          Run analysis
        </Button>
        <span className="text-2xs text-ink-faint">
          Answers cite collected evidence. Missing evidence is reported as unknown.
        </span>
      </div>

      {!hideSuggestions && suggestions.length > 0 ? (
        <div className="flex flex-col gap-1.5 border-t border-[var(--fs-border)] pt-3">
          <span className="fs-label">Suggested questions</span>
          <ul className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={submitting || offline}
                  onClick={() => {
                    onChange(s.text);
                    document.getElementById(fieldId)?.focus();
                  }}
                  title={s.hint}
                  className={cn(
                    "fs-press max-w-full rounded-full border border-[var(--fs-border)] px-3 py-1.5 text-left text-2xs text-ink-secondary",
                    "transition-colors duration-fast ease-out",
                    "hover:border-[var(--fs-border-strong)] hover:bg-surface-2 hover:text-ink",
                    "disabled:pointer-events-none disabled:opacity-55",
                  )}
                >
                  {s.text}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </form>
  );
}

/* ─── Run status strip ──────────────────────────────────────────────── */

/**
 * Run status with honest failure reporting. The analyst can fail validation
 * (citations missing) without failing the request, and that distinction is
 * surfaced rather than hidden behind a green check.
 */
export interface ResearchRunStatus {
  status: string;
  failureReason?: string | null;
  createdAt: string;
  finishedAt?: string | null;
  validationStatus?: string | null;
}

const STATUS_TONE: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  QUEUED: "neutral",
  RUNNING: "info",
  COMPLETED: "success",
  FAILED: "danger",
  CANCELLED: "neutral",
};

export function RunStatusStrip({ run, className }: { run: ResearchRunStatus; className?: string }) {
  const tone = STATUS_TONE[run.status] ?? "neutral";
  const isWorking = run.status === "QUEUED" || run.status === "RUNNING";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-[var(--fs-border)] bg-surface-2 px-3 py-2",
        className,
      )}
      data-slot="run-status"
    >
      <Badge tone={tone} dot={isWorking}>
        {run.status.toLowerCase()}
      </Badge>
      <span className="fs-data text-2xs text-ink-faint">started {run.createdAt}</span>
      {run.finishedAt ? (
        <span className="fs-data text-2xs text-ink-faint">finished {run.finishedAt}</span>
      ) : null}
      {run.validationStatus ? (
        <Badge tone={run.validationStatus === "VALID" ? "success" : "warning"} size="sm">
          citations {run.validationStatus.toLowerCase()}
        </Badge>
      ) : null}
      {run.failureReason ? (
        <p className="w-full text-2xs leading-relaxed text-[var(--fs-danger-fg)]">
          {run.failureReason}
        </p>
      ) : null}
    </div>
  );
}