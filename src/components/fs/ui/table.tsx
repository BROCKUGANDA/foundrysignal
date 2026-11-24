"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Data table — semantic `<table>` with a fixed layout option and sticky head.
 *
 * Built on native table elements, not a div grid: screen readers announce
 * row/column relationships and users can navigate cells with table commands.
 *
 * State contract:
 *   default      hairline rows, hover tint
 *   selected     accent-subtle wash on the row
 *   disabled     muted row (e.g. a filtered-out record)
 *   empty        handled by the caller via EmptyState (never a blank tbody)
 *   loading      caller swaps in <Skeleton> rows via `loadingRows`
 *
 * `stickyHeader` pins the head while scrolling inside a bounded container —
 * pair with a `max-h-*` wrapper for the scroll region.
 */

export interface TableProps extends React.ComponentPropsWithoutRef<"table"> {
  /** Pin the header row inside a scrolling container. */
  stickyHeader?: boolean;
  /** Compact row padding for dense data grids. */
  dense?: boolean;
  /** Row striping. Off by default; hairlines usually read better. */
  striped?: boolean;
}

export function Table({ className, stickyHeader, dense, striped, children, ...props }: TableProps) {
  return (
    <table
      data-slot="table"
      className={cn("w-full border-collapse text-left text-sm", className)}
      {...props}
    >
      {children}
    </table>
  );
}

export function TableScroll({
  className,
  maxHeight,
  children,
}: {
  className?: string;
  maxHeight?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn("fs-scroll w-full overflow-x-auto", className)}
      style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}
    >
      {children}
    </div>
  );
}

export function TableHead({
  className,
  sticky,
  ...props
}: React.ComponentPropsWithoutRef<"thead"> & { sticky?: boolean }) {
  return (
    <thead
      data-slot="table-head"
      className={cn(
        "[&_th]:border-b [&_th]:border-[var(--fs-border)] [&_th]:bg-surface-2",
        sticky && "sticky top-0 z-10",
        className,
      )}
      {...props}
    />
  );
}

export function TableHeaderCell({
  className,
  align,
  ...props
}: Omit<React.ComponentPropsWithoutRef<"th">, "align"> & {
  align?: "start" | "end" | "center";
}) {
  return (
    <th
      scope="col"
      data-slot="table-header-cell"
      className={cn(
        "fs-label whitespace-nowrap px-4 py-2.5 font-semibold",
        align === "end" && "text-right",
        align === "center" && "text-center",
        className,
      )}
      {...props}
    />
  );
}

export function TableBody({ className, ...props }: React.ComponentPropsWithoutRef<"tbody">) {
  return <tbody data-slot="table-body" className={className} {...props} />;
}

export interface TableRowProps extends React.ComponentPropsWithoutRef<"tr"> {
  selected?: boolean;
  disabled?: boolean;
  /** Row activation; promotes the row to a button-like control. */
  onSelect?: () => void;
}

export function TableRow({ className, selected, disabled, onSelect, children, ...props }: TableRowProps) {
  const interactive = Boolean(onSelect);
  return (
    <tr
      data-slot="table-row"
      data-selected={selected ? "" : undefined}
      aria-selected={interactive ? selected : undefined}
      aria-disabled={disabled || undefined}
      onClick={onSelect}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect?.();
              }
            }
          : undefined
      }
      tabIndex={interactive ? 0 : undefined}
      className={cn(
        "border-b border-[var(--fs-border)] last:border-b-0",
        "transition-colors duration-fast ease-out",
        interactive && "cursor-pointer hover:bg-[var(--fs-surface-2)]",
        selected && "bg-[var(--fs-accent-subtle)]",
        disabled && "cursor-not-allowed opacity-55",
        "[&:focus-visible]:outline-none [&:focus-visible]:ring-2 [&:focus-visible]:ring-[var(--fs-focus-ring)] [&:focus-visible]:ring-inset",
        className,
      )}
      {...props}
    >
      {children}
    </tr>
  );
}

export function TableCell({
  className,
  align,
  mono,
  numeric,
  ...props
}: Omit<React.ComponentPropsWithoutRef<"td">, "align"> & {
  align?: "start" | "end" | "center";
  mono?: boolean;
  numeric?: boolean;
}) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-4 py-2.5 align-middle text-ink-secondary",
        align === "end" && "text-right",
        align === "center" && "text-center",
        mono && "fs-data text-xs",
        numeric && "fs-data text-right tabular-nums",
        className,
      )}
      {...props}
    />
  );
}

export function TableFooter({ className, ...props }: React.ComponentPropsWithoutRef<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("border-t border-[var(--fs-border-strong)] bg-surface-2", className)}
      {...props}
    />
  );
}

/* ─── Pagination ────────────────────────────────────────────────────── */

/**
 * Cursor pagination. FoundrySignal's API uses cursors (not offsets), so the
 * control is Prev/Next plus a "showing X–Y of Z" summary rather than page
 * numbers. Page-number UI would imply stable offsets the API does not offer.
 */
export interface PaginationProps {
  /** Total matched records; omit when the count is unknown. */
  total?: number;
  /** Records in the current page. */
  pageSize: number;
  /** Zero-based index of the current page within the result set. */
  pageIndex?: number;
  hasNext?: boolean;
  hasPrev?: boolean;
  onNext?: () => void;
  onPrev?: () => void;
  /** Label for the result set, e.g. "ventures". */
  noun?: string;
  className?: string;
  loading?: boolean;
}

export function Pagination({
  total,
  pageSize,
  pageIndex = 0,
  hasNext,
  hasPrev,
  onNext,
  onPrev,
  noun = "results",
  className,
  loading,
}: PaginationProps) {
  const from = pageIndex * pageSize + 1;
  const to = pageIndex * pageSize + pageSize;

  return (
    <nav
      aria-label="Pagination"
      className={cn("flex flex-wrap items-center justify-between gap-3 pt-1", className)}
    >
      <p className="fs-data text-2xs text-ink-faint">
        {loading
          ? "Loading…"
          : total !== undefined && total > 0
            ? `${Math.min(from, total)}–${Math.min(to, total)} of ${total} ${noun}`
            : `Page ${pageIndex + 1}`}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={!hasPrev || loading}
          className={cn(
            "fs-press fs-touch inline-flex h-8 items-center rounded-md border border-[var(--fs-border-strong)] bg-surface px-3 text-sm font-medium text-ink lg:min-h-0",
            "transition-colors duration-fast ease-out hover:bg-surface-2",
            "disabled:pointer-events-none disabled:opacity-55",
          )}
        >
          Previous
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!hasNext || loading}
          className={cn(
            "fs-press fs-touch inline-flex h-8 items-center rounded-md border border-[var(--fs-border-strong)] bg-surface px-3 text-sm font-medium text-ink lg:min-h-0",
            "transition-colors duration-fast ease-out hover:bg-surface-2",
            "disabled:pointer-events-none disabled:opacity-55",
          )}
        >
          Next
        </button>
      </div>
    </nav>
  );
}