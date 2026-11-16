"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Segmented control — a radio group rendered as a compact pill row.
 *
 * Used for view switches and filter toggles where a native select would hide
 * options behind a click. Implemented with real radio inputs (not buttons) so
 * arrow-key navigation and form participation come from the platform.
 *
 * State contract: default / hover / focus / checked / disabled.
 * Only one option can be checked; `value` + `onValueChange` drive it as a
 * controlled component (uncontrolled via `defaultValue`).
 */

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  /** Optional glyph shown before the label. */
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string>
  extends Omit<React.ComponentPropsWithoutRef<"div">, "onChange" | "defaultValue"> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value?: T;
  defaultValue?: T;
  onValueChange?: (value: T) => void;
  /** Accessible name for the group. */
  ariaLabel: string;
  size?: "sm" | "md";
  /** Stretch to fill the container. */
  block?: boolean;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  defaultValue,
  onValueChange,
  ariaLabel,
  size = "md",
  block,
  className,
  ...props
}: SegmentedControlProps<T>) {
  const [internal, setInternal] = React.useState<T | undefined>(defaultValue);
  const current = value ?? internal;
  const name = React.useId();

  const select = (next: T) => {
    if (value === undefined) setInternal(next);
    onValueChange?.(next);
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      data-slot="segmented"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-[var(--fs-border)] bg-surface-2 p-0.5",
        block && "flex w-full",
        className,
      )}
      {...props}
    >
      {options.map((o) => {
        const checked = current === o.value;
        return (
          <label
            key={o.value}
            className={cn(
              "relative inline-flex flex-1 cursor-pointer select-none items-center justify-center gap-1.5 rounded-sm",
              "text-sm font-medium transition-[background-color,color,box-shadow] duration-fast ease-out",
              size === "sm" ? "h-7 px-2 text-xs" : "h-8 px-3",
              checked
                ? "bg-surface text-ink shadow-e1"
                : "text-ink-muted hover:text-ink",
              o.disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={checked}
              disabled={o.disabled}
              onChange={() => select(o.value)}
              className="peer sr-only"
            />
            {o.icon}
            <span className="whitespace-nowrap">{o.label}</span>
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute inset-0 rounded-sm",
                "peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--fs-focus-ring)]",
              )}
            />
          </label>
        );
      })}
    </div>
  );
}