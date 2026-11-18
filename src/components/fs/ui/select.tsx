"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { CONTROL_BASE, CONTROL_SIZE, type ControlSize } from "./input";

/**
 * Select — a native `<select>` skinned to the design system.
 *
 * Why native rather than a listbox: a real `<select>` gives platform picker
 * behaviour, type-ahead, mobile wheel pickers, and screen-reader semantics for
 * free. The Radix listbox cannot be styled consistently enough across
 * platforms to justify replacing that, and its extra a11y surface is a net
 * regression here.
 *
 * State contract matches Input: default/hover/focus/disabled/invalid.
 * `aria-invalid` + `aria-describedby` are caller-supplied via Field().
 */

export interface SelectProps
  extends Omit<React.ComponentPropsWithoutRef<"select">, "size" | "onChange" | "value"> {
  size?: ControlSize;
  /** Options as data, so callers do not hand-roll `<option>` everywhere. */
  options?: ReadonlyArray<{ value: string; label: string; disabled?: boolean }>;
  /** Placeholder row; renders an empty-value option. */
  placeholder?: string;
  mono?: boolean;
  /** Controlled value. Pairs with `onValueChange`. */
  value?: string;
  /** Preferred over `onChange`: receives the value, not the event. */
  onValueChange?: (value: string) => void;
  /** Escape hatch for callers that need the raw change event. */
  onChange?: React.ChangeEventHandler<HTMLSelectElement>;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, size = "md", options, placeholder, mono, children, value, onValueChange, onChange, ...props },
  ref,
) {
  return (
    <div className="relative w-full">
      <select
        ref={ref}
        data-slot="select"
        value={value}
        onChange={(event) => {
          onChange?.(event);
          onValueChange?.(event.target.value);
        }}
        className={cn(
          CONTROL_BASE,
          CONTROL_SIZE[size],
          "cursor-pointer appearance-none bg-[image:none] pr-9",
          mono && "fs-data text-xs",
          className,
        )}
        {...props}
      >
        {placeholder ? (
          <option value="" disabled={props.required}>
            {placeholder}
          </option>
        ) : null}
        {options
          ? options.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ))
          : children}
      </select>
      {/* Chevron is decorative; the native control owns the semantics. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 9.5 12 15.5 18 9.5" />
      </svg>
    </div>
  );
});

/* ─── Checkbox ──────────────────────────────────────────────────────── */

export interface CheckboxProps extends Omit<React.ComponentPropsWithoutRef<"input">, "type"> {
  /** Renders the controlled checkmark rather than the native box. */
  label?: React.ReactNode;
  /** Description shown under the label. */
  description?: string;
  /** Indeterminate state for "select all" style controls. */
  indeterminate?: boolean;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, label, description, indeterminate, id, ...props },
  ref,
) {
  const autoId = React.useId();
  const inputId = id ?? autoId;
  const innerRef = React.useRef<HTMLInputElement | null>(null);

  const setRef = React.useCallback(
    (node: HTMLInputElement | null) => {
      innerRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  React.useEffect(() => {
    if (innerRef.current) innerRef.current.indeterminate = Boolean(indeterminate);
  }, [indeterminate]);

  return (
    <div className={cn("flex items-start gap-2", className)}>
      <span className="relative mt-0.5 inline-flex size-4 shrink-0 items-center justify-center">
        <input
          ref={setRef}
          id={inputId}
          type="checkbox"
          className={cn(
            "peer size-4 cursor-pointer appearance-none rounded-xs border",
            "border-[var(--fs-border-strong)] bg-surface",
            "transition-[background-color,border-color,box-shadow] duration-fast ease-out",
            "hover:border-[var(--fs-border-emphasis)]",
            "checked:border-[var(--fs-accent)] checked:bg-[var(--fs-accent)]",
            "indeterminate:border-[var(--fs-accent)] indeterminate:bg-[var(--fs-accent)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus-ring)]",
            "disabled:cursor-not-allowed disabled:border-[var(--fs-disabled-border)] disabled:bg-[var(--fs-disabled-bg)]",
          )}
          {...props}
        />
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="pointer-events-none absolute size-3 text-[var(--fs-accent-contrast)] opacity-0 peer-checked:opacity-100"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
        </svg>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="pointer-events-none absolute size-3 text-[var(--fs-accent-contrast)] opacity-0 peer-indeterminate:opacity-100"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
        >
          <path d="M5 12h14" />
        </svg>
      </span>
      {label ? (
        <div className="min-w-0">
          <label htmlFor={inputId} className="block cursor-pointer text-sm leading-snug text-ink">
            {label}
          </label>
          {description ? <p className="mt-0.5 text-xs leading-snug text-ink-muted">{description}</p> : null}
        </div>
      ) : null}
    </div>
  );
});

/* ─── Switch ────────────────────────────────────────────────────────── */

export interface SwitchProps extends Omit<React.ComponentPropsWithoutRef<"input">, "type" | "size"> {
  label?: React.ReactNode;
  description?: string;
  /** Compact track for dense toolbars. */
  size?: "sm" | "md";
}

export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { className, label, description, size = "md", id, ...props },
  ref,
) {
  const autoId = React.useId();
  const inputId = id ?? autoId;
  const dims = size === "sm" ? { track: "h-4 w-7", knob: "size-3" } : { track: "h-5 w-9", knob: "size-4" };
  const shift = size === "sm" ? "peer-checked:translate-x-3" : "peer-checked:translate-x-4";

  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <span className={cn("relative mt-0.5 inline-flex shrink-0 items-center", dims.track)}>
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          role="switch"
          className="peer sr-only"
          {...props}
        />
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-0 rounded-full border border-[var(--fs-border-strong)] bg-surface-3",
            "transition-[background-color,border-color] duration-fast ease-out",
            "peer-checked:border-[var(--fs-accent)] peer-checked:bg-[var(--fs-accent)]",
            "peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--fs-focus-ring)] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[var(--fs-bg)]",
            "peer-disabled:cursor-not-allowed peer-disabled:border-[var(--fs-disabled-border)] peer-disabled:bg-[var(--fs-disabled-bg)]",
          )}
        />
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute left-0.5 rounded-full bg-ink",
            dims.knob,
            "transition-transform duration-fast ease-out",
            shift,
            "peer-checked:bg-[var(--fs-accent-contrast)]",
          )}
        />
      </span>
      {label ? (
        <div className="min-w-0">
          <label htmlFor={inputId} className="block cursor-pointer text-sm leading-snug text-ink">
            {label}
          </label>
          {description ? <p className="mt-0.5 text-xs leading-snug text-ink-muted">{description}</p> : null}
        </div>
      ) : null}
    </div>
  );
});

/* ─── Radio group (native) ──────────────────────────────────────────── */

export interface RadioOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface RadioGroupProps extends Omit<React.ComponentPropsWithoutRef<"input">, "type" | "size"> {
  legend?: string;
  options: ReadonlyArray<RadioOption>;
  /** Layout of the option list. */
  orientation?: "vertical" | "horizontal";
}

export const RadioGroup = React.forwardRef<HTMLInputElement, RadioGroupProps>(function RadioGroup(
  { className, legend, options, orientation = "vertical", name, id, ...props },
  ref,
) {
  const autoId = React.useId();
  const groupName = name ?? id ?? autoId;

  return (
    <fieldset className={cn("min-w-0", className)}>
      {legend ? <legend className="fs-label mb-2">{legend}</legend> : null}
      <div
        className={cn(
          "flex gap-3",
          orientation === "vertical" ? "flex-col" : "flex-row flex-wrap",
        )}
      >
        {options.map((o, i) => (
          <div key={o.value} className="flex items-start gap-2">
            <span className="relative mt-0.5 inline-flex size-4 shrink-0 items-center justify-center">
              <input
                ref={i === 0 ? ref : undefined}
                type="radio"
                name={groupName}
                value={o.value}
                disabled={o.disabled}
                className={cn(
                  "peer size-4 cursor-pointer appearance-none rounded-full border",
                  "border-[var(--fs-border-strong)] bg-surface",
                  "transition-[border-color,box-shadow] duration-fast ease-out",
                  "hover:border-[var(--fs-border-emphasis)]",
                  "checked:border-[var(--fs-accent)]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus-ring)]",
                  "disabled:cursor-not-allowed disabled:border-[var(--fs-disabled-border)] disabled:bg-[var(--fs-disabled-bg)]",
                )}
                {...props}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute size-2 rounded-full bg-[var(--fs-accent)] opacity-0 peer-checked:opacity-100"
              />
            </span>
            <div className="min-w-0">
              <label className={cn("block cursor-pointer text-sm leading-snug", o.disabled ? "text-ink-faint" : "text-ink")}>
                {o.label}
              </label>
              {o.description ? (
                <p className="mt-0.5 text-xs leading-snug text-ink-muted">{o.description}</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </fieldset>
  );
});