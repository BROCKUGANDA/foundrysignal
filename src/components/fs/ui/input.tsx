"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Text inputs.
 *
 * State contract (shared by Input / Textarea):
 *   default    hairline border, surface background
 *   hover      border-emphasis
 *   focus      2px accent ring + halo, border accent (via :focus-visible)
 *   disabled   muted fg/bg, not-allowed cursor, removed from tab order
 *   readonly   same as default but with a subtle inset tint, still focusable
 *   invalid    danger border + danger ring; `aria-invalid` is set for AT
 *   withIcon   left padding reserved so text never overlaps the glyph
 *
 * All sizing uses --fs-* so the light/dark themes stay consistent.
 */

const SHARED =
  "w-full min-w-0 rounded-md bg-surface text-ink placeholder:text-ink-faint " +
  "border border-[var(--fs-border-strong)] " +
  "transition-[border-color,box-shadow,background-color] duration-fast ease-out " +
  "hover:border-[var(--fs-border-emphasis)] " +
  "focus-visible:border-[var(--fs-accent)] focus-visible:outline-none " +
  "focus-visible:ring-2 focus-visible:ring-[var(--fs-focus-ring)] " +
  "focus-visible:ring-offset-0 " +
  "disabled:cursor-not-allowed disabled:bg-[var(--fs-disabled-bg)] disabled:text-[var(--fs-disabled-fg)] disabled:border-[var(--fs-disabled-border)] " +
  "read-only:bg-surface-2 read-only:text-ink-secondary " +
  "aria-[invalid=true]:border-[var(--fs-danger)] aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-[var(--fs-danger)]/25 " +
  "file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink-muted";

const SIZE = {
  sm: "h-8 px-2.5 text-sm",
  md: "h-9 px-3 text-sm",
  lg: "h-11 px-3.5 text-md",
} as const;

export type ControlSize = keyof typeof SIZE;

export interface InputProps extends Omit<React.ComponentPropsWithoutRef<"input">, "size"> {
  size?: ControlSize;
  /** Left inset in px; use the `--fs-space-*` scale or a measured icon size. */
  insetStart?: number;
  /** Right inset in px (clear button, unit suffix). */
  insetEnd?: number;
  /** Monospace treatment for hashes, addresses, tickers. */
  mono?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, size = "md", insetStart, insetEnd, mono, type = "text", ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      className={cn(
        SHARED,
        SIZE[size],
        mono && "fs-data text-xs tracking-tight",
        insetStart ? "" : "",
        className,
      )}
      style={{
        paddingLeft: insetStart !== undefined ? insetStart : undefined,
        paddingRight: insetEnd !== undefined ? insetEnd : undefined,
      }}
      {...props}
    />
  );
});

export interface TextareaProps extends React.ComponentPropsWithoutRef<"textarea"> {
  size?: ControlSize;
  mono?: boolean;
  /** Character counter rendered under the field. */
  showCount?: boolean;
  maxLength?: number;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, size = "md", mono, showCount, maxLength, value, ...props },
  ref,
) {
  const count = typeof value === "string" ? value.length : 0;
  return (
    <div className="w-full">
      <textarea
        ref={ref}
        data-slot="textarea"
        maxLength={maxLength}
        value={value}
        className={cn(
          SHARED,
          "min-h-24 resize-y py-2 leading-normal",
          size === "sm" ? "text-sm" : "text-sm",
          mono && "fs-data text-xs",
          className,
        )}
        {...props}
      />
      {showCount && maxLength ? (
        <div
          className={cn(
            "mt-1 text-right text-2xs fs-data",
            count > maxLength * 0.9 ? "text-[var(--fs-warning-fg)]" : "text-ink-faint",
          )}
          aria-hidden="true"
        >
          {count}/{maxLength}
        </div>
      ) : null}
    </div>
  );
});

/* ─── Label ─────────────────────────────────────────────────────────── */

export interface FieldLabelProps extends React.ComponentPropsWithoutRef<"label"> {
  /** Renders the required marker. Required state is conveyed to AT via the control. */
  required?: boolean;
  /** Helper text rendered under the control, wired with aria-describedby. */
  hint?: string;
  /** Error text; presence flips the control to invalid. */
  error?: string;
  htmlFor?: string;
}

export function FieldLabel({ className, required, hint, error, htmlFor, children, ...props }: FieldLabelProps) {
  return (
    <label
      htmlFor={htmlFor}
      data-slot="field-label"
      className={cn("fs-label flex items-center gap-1", className)}
      {...props}
    >
      {children}
      {required ? (
        <>
          <span aria-hidden="true" className="text-[var(--fs-danger)]">
            *
          </span>
          <span className="fs-sr-only"> (required)</span>
        </>
      ) : null}
      {hint ? <span className="sr-only">{hint}</span> : null}
      {error ? <span className="fs-sr-only">{error}</span> : null}
    </label>
  );
}

/**
 * Field wrapper: label + control + hint/error.
 *
 * Wires `aria-describedby` and `aria-invalid` automatically so callers cannot
 * forget the AT plumbing. `id` is required — it is the label association.
 */
export function Field({
  id,
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: (props: {
    id: string;
    "aria-describedby": string | undefined;
    "aria-invalid": boolean | undefined;
    required: boolean | undefined;
  }) => React.ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <FieldLabel htmlFor={id} required={required} hint={hint} error={error}>
        {label}
      </FieldLabel>
      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        required,
      })}
      {hint ? (
        <p id={hintId} className="text-xs leading-snug text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs leading-snug text-[var(--fs-danger-fg)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export { SHARED as CONTROL_BASE, SIZE as CONTROL_SIZE };