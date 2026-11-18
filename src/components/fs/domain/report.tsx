"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/fs/ui/badge";
import { Button } from "@/components/fs/ui/button";
import { EmptyState, ErrorState, SkeletonText } from "@/components/fs/ui/states";
import { Glyph } from "@/components/fs/brand/glyphs";

/**
 * ResearchReport — citation-validated analyst output.
 *
 * The report is the product's highest-stakes surface: every factual statement
 * must trace to a collected evidence record. Two guarantees are enforced here:
 *
 *  1. Citations are rendered inline and link to the evidence record. A
 *     statement without a citation is visibly marked "uncited" rather than
 *     silently presented as grounded.
 *  2. Validation status is never hidden. A report whose citations failed
 *     validation shows that prominently — a plausible-sounding ungrounded
 *     report is the failure mode this product exists to prevent.
 *
 * Sections are typed data from the research engine
 * (src/lib/domain/research/engine.ts): a fixed eleven-section structure.
 * Missing sections render as explicit "insufficient evidence" blocks, which is
 * an honest outcome, not an error.
 */

export interface ReportCitation {
  id: string;
  /** Evidence record this citation points at. */
  evidenceId: string;
  label: string;
  /** Provider that produced the cited record. */
  provider?: string | null;
  /** Short hash for audit. */
  contentHash?: string | null;
  /** ISO collection time. */
  collectedAt?: string | null;
}

export interface ReportSection {
  id: string;
  title: string;
  /** Paragraphs of prose. A section may carry zero paragraphs when the
   *  evidence does not support one — that is the "insufficient" case. */
  paragraphs: string[];
  /** Citation ids referenced by this section's paragraphs. */
  citationIds: string[];
  /** True when the engine could not ground this section. */
  insufficientEvidence?: boolean;
}

export interface ResearchReportData {
  id: string;
  title: string;
  /** VALID | INVALID | PARTIAL — from the citation validator. */
  validationStatus: string;
  validationIssues?: string[];
  sections: ReportSection[];
  citations: ReportCitation[];
  model?: string | null;
  generatedAt?: string | null;
  /** Token/cost accounting, when the provider reports it. */
  usage?: { inputTokens?: number; outputTokens?: number } | null;
}

export interface ResearchReportProps {
  report: ResearchReportData;
  onOpenEvidence?: (evidenceId: string) => void;
  onExport?: (reportId: string) => void;
  exporting?: boolean;
  className?: string;
  /** Collapse sections beyond the first N. */
  collapseAfter?: number;
}

function CitationRef({
  citation,
  onOpen,
}: {
  citation: ReportCitation;
  onOpen?: (evidenceId: string) => void;
}) {
  const content = (
    <>
      <span className="fs-data text-2xs">{citation.label}</span>
      {citation.provider ? (
        <span className="text-2xs opacity-70"> · {citation.provider}</span>
      ) : null}
    </>
  );

  if (!onOpen) {
    return (
      <span className="fs-chip fs-chip-accent gap-1 align-middle">
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(citation.evidenceId)}
      title={`Open evidence record ${citation.evidenceId}`}
      className="fs-chip fs-chip-accent fs-press gap-1 align-middle transition-colors duration-fast ease-out hover:border-[var(--fs-accent)]"
    >
      {content}
    </button>
  );
}

export function ResearchReport({
  report,
  onOpenEvidence,
  onExport,
  exporting,
  className,
  collapseAfter,
}: ResearchReportProps) {
  const [expanded, setExpanded] = React.useState(false);
  const citationById = React.useMemo(
    () => new Map(report.citations.map((c) => [c.id, c])),
    [report.citations],
  );

  const invalid = report.validationStatus === "INVALID";
  const partial = report.validationStatus === "PARTIAL";
  const shown = collapseAfter && !expanded ? report.sections.slice(0, collapseAfter) : report.sections;
  const hiddenCount = report.sections.length - shown.length;

  return (
    <article className={cn("flex flex-col gap-5", className)} data-slot="research-report">
      {/* Header */}
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="fs-brand text-xl font-semibold leading-tight text-ink">{report.title}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge
                tone={invalid ? "danger" : partial ? "warning" : "success"}
                dot={invalid || partial}
                title={`Citation validation: ${report.validationStatus}`}
              >
                citations {report.validationStatus.toLowerCase()}
              </Badge>
              {report.model ? (
                <Badge tone="neutral" size="sm">
                  {report.model}
                </Badge>
              ) : null}
              {report.generatedAt ? (
                <span className="fs-data text-2xs text-ink-faint">{report.generatedAt}</span>
              ) : null}
              {report.usage?.inputTokens !== undefined ? (
                <span className="fs-data text-2xs text-ink-faint">
                  {report.usage.inputTokens + (report.usage.outputTokens ?? 0)} tokens
                </span>
              ) : null}
            </div>
          </div>
          {onExport ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onExport(report.id)}
              loading={exporting}
              loadingLabel="Exporting"
              className="shrink-0"
            >
              <Glyph name="report" size={14} />
              Export .md
            </Button>
          ) : null}
        </div>

        {report.validationIssues && report.validationIssues.length > 0 ? (
          <div
            role="alert"
            className={cn(
              "flex flex-col gap-1 rounded-md border px-3 py-2",
              invalid
                ? "border-[var(--fs-danger-border)] bg-[var(--fs-danger-bg)]"
                : "border-[var(--fs-warning-border)] bg-[var(--fs-warning-bg)]",
            )}
          >
            <span className="flex items-center gap-1.5 text-xs font-semibold text-ink">
              <span aria-hidden="true" className={invalid ? "text-[var(--fs-danger-fg)]" : "text-[var(--fs-warning-fg)]"}>
                <Glyph name="risk" size={13} />
              </span>
              Citation validation {invalid ? "failed" : "found issues"}
            </span>
            <ul className="ml-5 flex list-disc flex-col gap-0.5">
              {report.validationIssues.map((issue, i) => (
                <li key={i} className="text-2xs leading-relaxed text-ink-secondary">
                  {issue}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {!report.sections.length ? (
          <EmptyState
            glyph="research"
            compact
            title="No report sections"
            description="The analyst returned no grounded sections. This is an honest outcome: the evidence did not support an answer."
          />
        ) : null}
      </header>

      {/* Sections */}
      <div className="flex flex-col gap-5">
        {shown.map((section, i) => (
          <section key={section.id} aria-labelledby={`${report.id}-${section.id}`} className="flex flex-col gap-2">
            <h3
              id={`${report.id}-${section.id}`}
              className="fs-label flex items-center gap-2"
            >
              <span className="fs-data text-2xs text-ink-faint" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              {section.title}
            </h3>

            {section.insufficientEvidence || section.paragraphs.length === 0 ? (
              <p className="rounded-md border border-dashed border-[var(--fs-warning-border)] bg-[var(--fs-warning-bg)] px-3 py-2 text-xs leading-relaxed text-ink-secondary">
                <span className="font-semibold">Insufficient evidence.</span> No collected record
                supports this section. FoundrySignal does not fill gaps with generated claims.
              </p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {section.paragraphs.map((paragraph, pi) => (
                  <p key={pi} className="text-sm leading-relaxed text-ink-secondary">
                    {paragraph}{" "}
                    {section.citationIds.length > 0 ? (
                      <span className="inline-flex flex-wrap gap-1 align-middle">
                        {section.citationIds.map((cid) => {
                          const citation = citationById.get(cid);
                          return citation ? (
                            <CitationRef
                              key={`${cid}-${pi}`}
                              citation={citation}
                              onOpen={onOpenEvidence}
                            />
                          ) : (
                            // A citation id with no backing record is a
                            // validation failure, not something to hide.
                            <span
                              key={cid}
                              className="fs-chip fs-chip-error"
                              title={`Citation ${cid} has no evidence record`}
                            >
                              uncited
                            </span>
                          );
                        })}
                      </span>
                    ) : (
                      <span className="fs-chip fs-chip-error" title="No citation attached to this statement">
                        uncited
                      </span>
                    )}
                  </p>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>

      {/* Citation ledger */}
      {report.citations.length > 0 ? (
        <details className="rounded-md border border-[var(--fs-border)] bg-surface-2">
          <summary
            className={cn(
              "flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-medium text-ink",
              "transition-colors duration-fast ease-out hover:bg-surface-3",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus-ring)]",
            )}
          >
            <span aria-hidden="true" className="text-ink-faint">
              <Glyph name="evidence" size={13} />
            </span>
            Citation ledger ({report.citations.length} evidence records)
          </summary>
          <ul className="flex flex-col gap-1.5 border-t border-[var(--fs-border)] px-3 py-2">
            {report.citations.map((c) => (
              <li key={c.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="fs-data text-2xs text-[var(--fs-accent-fg)]">{c.label}</span>
                <span className="min-w-0 flex-1 truncate text-2xs text-ink-secondary">{c.id}</span>
                {c.provider ? (
                  <span className="fs-data text-2xs text-ink-faint">{c.provider}</span>
                ) : null}
                {c.contentHash ? (
                  <span className="fs-data text-2xs text-ink-faint">
                    sha256 {c.contentHash.slice(0, 12)}…
                  </span>
                ) : null}
                {onOpenEvidence ? (
                  <button
                    type="button"
                    onClick={() => onOpenEvidence(c.evidenceId)}
                    className="fs-press text-2xs text-[var(--fs-accent-fg)] hover:underline"
                  >
                    open
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {hiddenCount > 0 ? (
        <Button variant="outline" size="sm" onClick={() => setExpanded(true)}>
          Show {hiddenCount} more section{hiddenCount === 1 ? "" : "s"}
        </Button>
      ) : null}

      <p className="text-2xs leading-relaxed text-ink-faint">
        Generated from collected evidence only. This report is research information, not investment
        advice.
      </p>
    </article>
  );
}

/** Skeleton matching the report's header + section rhythm. */
export function ResearchReportSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-hidden="true">
      <div className="flex flex-col gap-2">
        <div className="h-5 w-2/3 rounded-sm bg-[var(--fs-shimmer-base)]" />
        <div className="h-4 w-40 rounded-full bg-[var(--fs-surface-3)]" />
      </div>
      {[0, 1, 2].map((s) => (
        <div key={s} className="flex flex-col gap-2">
          <div className="h-2.5 w-32 rounded-sm bg-[var(--fs-surface-3)]" />
          <SkeletonText lines={3} />
        </div>
      ))}
    </div>
  );
}

export { ErrorState };